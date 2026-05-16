/**
 * Parse legacy .ppt binary files into slide-based HTML
 * PPT files are OLE2 compound documents (CFB) containing a "PowerPoint Document" stream.
 * The stream contains a sequence of records with specific types for slides and text.
 *
 * Key record types:
 * - SlideContainer (0x03E8 / 1000) — marks start of a slide's content
 * - TextCharsAtom (0x0FA0 / 4000) — UTF-16LE text
 * - TextBytesAtom (0x0FA8 / 4008) — ASCII/Latin-1 text
 * - SlidePersistAtom (0x03F3 / 1011) — slide persistence info
 */

const RECORD_TYPES = {
  RT_Document: 0x03E8,          // 1000
  RT_Slide: 0x03EE,             // 1006
  RT_SlideBase: 0x03EC,         // 1004
  RT_MainMaster: 0x03F8,        // 1016
  RT_TextCharsAtom: 0x0FA0,     // 4000 - UTF-16LE
  RT_TextBytesAtom: 0x0FA8,     // 4008 - ASCII
  RT_SlidePersistAtom: 0x03F3,  // 1011
  RT_SlideListWithText: 0x0FF0, // 4080
  RT_TextHeaderAtom: 0x0F9F,    // 3999
  RT_EndDocument: 0x03EA,       // 1002
};

// Text header types (what kind of text follows)
const TEXT_TYPES = {
  0: 'title',
  1: 'body',
  2: 'notes',
  3: 'notUsed',
  4: 'other',
  5: 'centerBody',
  6: 'centerTitle',
  7: 'halfBody',
  8: 'quarterBody',
};

export function parseLegacyPpt(base64Data) {
  try {
    const CFB = require('cfb');
    const cfb = CFB.read(base64Data, { type: 'base64' });

    // Find the PowerPoint Document stream
    const pptStream = CFB.find(cfb, '/PowerPoint Document') ||
                      CFB.find(cfb, 'PowerPoint Document');

    if (!pptStream || !pptStream.content || pptStream.content.length < 8) {
      return { success: false, error: 'No PowerPoint Document stream found' };
    }

    const bytes = new Uint8Array(pptStream.content);
    const slides = extractSlidesFromRecords(bytes);

    if (slides.length === 0) {
      return { success: false, error: 'No slide content found' };
    }

    // Build HTML
    const html = slides.map((slide, idx) => {
      const slideContent = slide.texts.map(t => {
        const escaped = escapeHtml(t.text);
        if (t.type === 'title') {
          return `<h2 style="color:#4A9EFF;margin-bottom:12px;">${escaped}</h2>`;
        } else if (t.type === 'centerTitle') {
          return `<h2 style="color:#4A9EFF;text-align:center;margin-bottom:12px;">${escaped}</h2>`;
        } else {
          // Body text — split by newlines for bullet-like rendering
          const lines = escaped.split('\n').filter(l => l.trim());
          if (lines.length > 1) {
            return lines.map(l => `<p style="margin-bottom:6px;">\u2022 ${l}</p>`).join('');
          }
          return `<p>${escaped}</p>`;
        }
      }).join('');

      return `<div class="slide">
        <div class="slide-number">Slide ${idx + 1} of ${slides.length}</div>
        ${slideContent || '<p style="color:#6C6C80;">Empty slide</p>'}
      </div>`;
    }).join('');

    return { success: true, html, slideCount: slides.length };
  } catch (error) {
    console.log('PPT parse error:', error);
    return { success: false, error: error.message };
  }
}

function extractSlidesFromRecords(bytes) {
  const len = bytes.length;
  let offset = 0;
  const allTexts = [];
  let currentTextType = 'body';
  let inSlideListWithText = false;
  let slideBreaks = [];

  while (offset + 8 <= len) {
    // Read record header (8 bytes)
    const recVerInstance = readUInt16(bytes, offset);
    const recType = readUInt16(bytes, offset + 2);
    const recLen = readUInt32(bytes, offset + 4);

    const recVer = recVerInstance & 0x0F;
    const isContainer = recVer === 0x0F;

    if (recType === RECORD_TYPES.RT_SlideListWithText) {
      inSlideListWithText = true;
      // Container — dive into children
      offset += 8;
      continue;
    }

    if (recType === RECORD_TYPES.RT_SlidePersistAtom && inSlideListWithText) {
      // Marks a new slide boundary
      slideBreaks.push(allTexts.length);
      offset += 8 + recLen;
      continue;
    }

    if (recType === RECORD_TYPES.RT_TextHeaderAtom) {
      // 4 bytes telling us the type of text that follows
      if (recLen >= 4 && offset + 8 + 4 <= len) {
        const textTypeVal = readUInt32(bytes, offset + 8);
        currentTextType = TEXT_TYPES[textTypeVal] || 'body';
      }
      offset += 8 + recLen;
      continue;
    }

    if (recType === RECORD_TYPES.RT_TextCharsAtom) {
      // UTF-16LE text
      const textEnd = Math.min(offset + 8 + recLen, len);
      let text = '';
      for (let i = offset + 8; i + 1 < textEnd; i += 2) {
        const code = bytes[i] | (bytes[i + 1] << 8);
        if (code === 0) break;
        if (code === 13) {
          text += '\n';
        } else if (code >= 32 || code === 9) {
          text += String.fromCharCode(code);
        }
      }
      text = text.trim();
      if (text.length > 0) {
        allTexts.push({ text, type: currentTextType });
      }
      offset += 8 + recLen;
      continue;
    }

    if (recType === RECORD_TYPES.RT_TextBytesAtom) {
      // ASCII/Latin-1 text
      const textEnd = Math.min(offset + 8 + recLen, len);
      let text = '';
      for (let i = offset + 8; i < textEnd; i++) {
        const b = bytes[i];
        if (b === 0) break;
        if (b === 13) {
          text += '\n';
        } else if (b >= 32 || b === 9) {
          text += String.fromCharCode(b);
        }
      }
      text = text.trim();
      if (text.length > 0) {
        allTexts.push({ text, type: currentTextType });
      }
      offset += 8 + recLen;
      continue;
    }

    // For container records, dive into children
    if (isContainer) {
      offset += 8;
      continue;
    }

    // Skip non-container atom records
    offset += 8 + recLen;

    // Safety: if recLen is 0 or absurdly large, move forward
    if (recLen === 0 || offset > len) {
      if (recLen === 0) offset += 1;
      if (offset > len) break;
    }
  }

  // Group texts into slides using slide breaks
  const slides = [];
  if (slideBreaks.length === 0 && allTexts.length > 0) {
    // No slide breaks found — try to group by title occurrences
    let currentSlide = { texts: [] };
    for (const t of allTexts) {
      if (t.type === 'title' || t.type === 'centerTitle') {
        if (currentSlide.texts.length > 0) {
          slides.push(currentSlide);
          currentSlide = { texts: [] };
        }
      }
      currentSlide.texts.push(t);
    }
    if (currentSlide.texts.length > 0) {
      slides.push(currentSlide);
    }
  } else {
    // Use slide breaks to partition texts
    slideBreaks.push(allTexts.length); // sentinel
    for (let i = 0; i < slideBreaks.length; i++) {
      const start = i === 0 ? 0 : slideBreaks[i - 1];
      // For SlidePersistAtom-based breaks, the text for slide i
      // starts at slideBreaks[i] (after the persist atom)
    }
    // Re-approach: each SlidePersistAtom starts a new slide's text block
    for (let i = 0; i < slideBreaks.length; i++) {
      const start = slideBreaks[i];
      const end = i + 1 < slideBreaks.length ? slideBreaks[i + 1] : allTexts.length;
      const slideTexts = allTexts.slice(start, end);
      if (slideTexts.length > 0) {
        slides.push({ texts: slideTexts });
      }
    }
  }

  // Filter out slides that only have very short garbage text
  return slides.filter(s =>
    s.texts.some(t => t.text.length > 1)
  );
}

function readUInt16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUInt32(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
