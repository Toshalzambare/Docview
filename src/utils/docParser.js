/**
 * Parse legacy .doc (Word Binary Format) files to extract text.
 *
 * DOC files are OLE2/CFB compound documents. The text is stored in:
 * - WordDocument stream: contains the FIB (File Information Block) and possibly text
 * - 0Table or 1Table stream: contains the piece table that maps text positions
 *
 * The FIB tells us whether to use 0Table or 1Table, and where the CLX (piece table) is.
 * The piece table maps logical character positions to physical byte positions in the streams.
 */

export function parseLegacyDoc(base64Data) {
  try {
    const CFB = require('cfb');
    const cfb = CFB.read(base64Data, { type: 'base64' });

    const wordDocEntry = CFB.find(cfb, '/WordDocument') || CFB.find(cfb, 'WordDocument');
    if (!wordDocEntry || !wordDocEntry.content) {
      return { success: false, error: 'No WordDocument stream found' };
    }

    const wordDoc = new Uint8Array(wordDocEntry.content);
    if (wordDoc.length < 68) {
      return { success: false, error: 'WordDocument stream too small' };
    }

    // Parse FIB base
    const wIdent = readUInt16(wordDoc, 0);
    if (wIdent !== 0xA5EC && wIdent !== 0xA5DC) {
      // Not a valid Word doc magic number, try text extraction fallback
      return extractTextFallback(cfb);
    }

    // FIB flags at offset 0x0A
    const fibFlags = readUInt16(wordDoc, 0x0A);
    const fWhichTblStm = (fibFlags >> 9) & 1; // Which table stream: 0 = "0Table", 1 = "1Table"

    const tableStreamName = fWhichTblStm ? '1Table' : '0Table';
    const tableEntry = CFB.find(cfb, '/' + tableStreamName) ||
                       CFB.find(cfb, tableStreamName) ||
                       CFB.find(cfb, '/1Table') ||
                       CFB.find(cfb, '1Table') ||
                       CFB.find(cfb, '/0Table') ||
                       CFB.find(cfb, '0Table');

    // Get text counts from FIB.fibRgLw97 (starts at offset 0x20 in many Word versions)
    // ccpText is at fibRgLw97 + 0x0C (offset 0x4C from start)
    let ccpText = 0;
    if (wordDoc.length > 0x50) {
      ccpText = readInt32(wordDoc, 0x4C);
    }

    // Try piece table approach first
    if (tableEntry && tableEntry.content) {
      const tableStream = new Uint8Array(tableEntry.content);
      const text = extractTextViaPieceTable(wordDoc, tableStream, ccpText);
      if (text && text.length > 10) {
        return { success: true, text: cleanText(text) };
      }
    }

    // Fallback: try reading text directly from WordDocument stream
    // In simple Word docs, text starts at offset 0x200 (512)
    let text = '';
    const textStart = 0x200;
    if (wordDoc.length > textStart && ccpText > 0) {
      const textEnd = Math.min(textStart + ccpText, wordDoc.length);
      // Try as ASCII first
      for (let i = textStart; i < textEnd; i++) {
        const b = wordDoc[i];
        if (b === 13) text += '\n';
        else if (b === 7) text += '\t'; // Cell/row end marker
        else if (b >= 32 && b < 127) text += String.fromCharCode(b);
        else if (b >= 0xA0) text += String.fromCharCode(b); // Extended Latin
      }
    }

    if (text.trim().length > 10) {
      return { success: true, text: cleanText(text) };
    }

    // Final fallback: scan all streams for text
    return extractTextFallback(cfb);
  } catch (error) {
    console.log('DOC parse error:', error);
    return { success: false, error: error.message };
  }
}

function extractTextViaPieceTable(wordDoc, tableStream, ccpText) {
  // Search for the CLX structure in the table stream
  // CLX contains Pcds (piece descriptors) prefixed by clxt = 0x02
  // Before that, there may be grpprl entries prefixed by clxt = 0x01

  let offset = 0;
  const len = tableStream.length;
  let text = '';

  // Scan for piece table (clxt = 0x02)
  while (offset < len - 4) {
    const clxt = tableStream[offset];

    if (clxt === 0x01) {
      // Skip grpprl
      if (offset + 3 > len) break;
      const cb = readUInt16(tableStream, offset + 1);
      offset += 3 + cb;
      continue;
    }

    if (clxt === 0x02) {
      // Found piece table
      if (offset + 5 > len) break;
      const lcb = readUInt32(tableStream, offset + 1);
      offset += 5;

      if (lcb < 4 || offset + lcb > len) break;

      // The piece table has:
      // - (n+1) CP values (each 4 bytes) = character positions
      // - n PCD entries (each 8 bytes) = piece descriptors
      // Total = 4*(n+1) + 8*n = 12n + 4 = lcb
      // So n = (lcb - 4) / 12

      const n = Math.floor((lcb - 4) / 12);
      if (n <= 0) break;

      const cpStart = offset;
      const pcdStart = offset + (n + 1) * 4;

      for (let i = 0; i < n; i++) {
        const cpBegin = readUInt32(tableStream, cpStart + i * 4);
        const cpEnd = readUInt32(tableStream, cpStart + (i + 1) * 4);
        const charCount = cpEnd - cpBegin;

        if (charCount <= 0 || charCount > 100000) continue;

        // Read PCD
        const pcdOffset = pcdStart + i * 8;
        if (pcdOffset + 8 > len) break;

        // PCD structure: 2 bytes flags, 4 bytes fc (file character position), 2 bytes prm
        const fcCompressed = readUInt32(tableStream, pcdOffset + 2);
        const fCompressed = (fcCompressed >> 30) & 1;
        const fc = fcCompressed & 0x3FFFFFFF;

        if (fCompressed) {
          // ANSI text — fc/2 is the byte offset in WordDocument
          const byteOffset = fc >> 1;
          for (let j = 0; j < charCount && byteOffset + j < wordDoc.length; j++) {
            const b = wordDoc[byteOffset + j];
            if (b === 13) text += '\n';
            else if (b === 7) text += '\n'; // table cell end
            else if (b === 12) text += '\n\n'; // page break
            else if (b >= 32) text += String.fromCharCode(b);
          }
        } else {
          // Unicode (UTF-16LE) — fc is the byte offset
          for (let j = 0; j < charCount && fc + j * 2 + 1 < wordDoc.length; j++) {
            const code = wordDoc[fc + j * 2] | (wordDoc[fc + j * 2 + 1] << 8);
            if (code === 13) text += '\n';
            else if (code === 7) text += '\n';
            else if (code === 12) text += '\n\n';
            else if (code >= 32) text += String.fromCharCode(code);
          }
        }
      }

      break; // Only process the first piece table
    }

    // Unknown clxt, skip
    offset++;
  }

  return text;
}

function extractTextFallback(cfb) {
  const entries = cfb.FullPaths || [];
  let bestText = '';

  // Try all streams, pick the one with the most readable text
  for (const entryPath of entries) {
    try {
      const entry = require('cfb').find(cfb, entryPath);
      if (!entry || !entry.content || entry.content.length < 50) continue;

      const bytes = new Uint8Array(entry.content);
      let text = '';

      // Try UTF-16LE
      let utf16Text = '';
      let run = '';
      for (let i = 0; i < bytes.length - 1; i += 2) {
        const code = bytes[i] | (bytes[i + 1] << 8);
        if (code === 13 || code === 10) {
          if (run.length > 0) run += '\n';
        } else if (code >= 32 && code < 0xFFFE) {
          run += String.fromCharCode(code);
        } else {
          if (run.length > 3) utf16Text += run + '\n';
          run = '';
        }
      }
      if (run.length > 3) utf16Text += run;

      // Try ASCII
      let asciiText = '';
      run = '';
      for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (b === 13 || b === 10) {
          if (run.length > 0) run += '\n';
        } else if (b >= 32 && b < 127) {
          run += String.fromCharCode(b);
        } else {
          if (run.length > 4) asciiText += run + '\n';
          run = '';
        }
      }
      if (run.length > 4) asciiText += run;

      text = utf16Text.length > asciiText.length ? utf16Text : asciiText;
      if (text.length > bestText.length) {
        bestText = text;
      }
    } catch {}
  }

  if (bestText.length > 10) {
    return { success: true, text: cleanText(bestText) };
  }
  return { success: false, error: 'Could not extract text from document' };
}

function cleanText(text) {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/ {3,}/g, ' ')
    .trim();
}

function readUInt16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUInt32(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function readInt32(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
}
