import JSZip from 'jszip';

/**
 * Parse DOCX file from base64 string and convert to HTML
 * DOCX files are ZIP archives containing XML files.
 * The main document content is in word/document.xml
 */
export async function parseDocx(base64Data) {
  try {
    // Clean base64 data - remove data URI prefix if present
    let cleanBase64 = base64Data;
    const commaIdx = cleanBase64.indexOf(',');
    if (commaIdx !== -1 && commaIdx < 100) {
      cleanBase64 = cleanBase64.substring(commaIdx + 1);
    }

    // Clean whitespace/newlines from base64
    cleanBase64 = cleanBase64.replace(/[\s\r\n]/g, '');
    console.log('DOCX clean base64 length:', cleanBase64.length, 'first 20:', cleanBase64.substring(0, 20));

    const zip = await JSZip.loadAsync(cleanBase64, { base64: true });

    // Debug: log all paths in the ZIP
    const allPaths = [];
    zip.forEach((path) => allPaths.push(path));
    console.log('DOCX all paths:', allPaths.join(', '));

    // Read the main document XML - try multiple path formats
    let documentXml = null;
    const docPaths = ['word/document.xml', 'word\\document.xml', 'Word/document.xml'];
    for (const dp of docPaths) {
      const f = zip.file(dp);
      if (f) {
        documentXml = await f.async('text');
        break;
      }
    }
    // Fallback: search for any file matching document.xml
    if (!documentXml) {
      for (const p of allPaths) {
        if (p.toLowerCase().endsWith('document.xml') && p.toLowerCase().includes('word')) {
          const f = zip.file(p);
          if (f) {
            documentXml = await f.async('text');
            break;
          }
        }
      }
    }
    if (!documentXml) {
      throw new Error(`No document.xml found in DOCX file. Contents: ${allPaths.slice(0, 10).join(', ')}`);
    }

    // Read styles if available
    const stylesXml = await zip.file('word/styles.xml')?.async('text');

    // Extract images and hyperlinks from relationships
    const images = {};
    const hyperlinkRels = {};
    let relsXml = null;
    const relsPaths = ['word/_rels/document.xml.rels', 'word\\_rels\\document.xml.rels'];
    for (const rp of relsPaths) {
      const rf = zip.file(rp);
      if (rf) { relsXml = await rf.async('text'); break; }
    }
    // Fallback search
    if (!relsXml) {
      for (const p of allPaths) {
        if (p.toLowerCase().includes('document.xml.rels')) {
          const rf = zip.file(p);
          if (rf) { relsXml = await rf.async('text'); break; }
        }
      }
    }
    const imageRels = {};

    if (relsXml) {
      // Parse relationships to find image and hyperlink references
      const relMatches = relsXml.match(/<Relationship[^>]*>/g) || [];
      for (const rel of relMatches) {
        const idMatch = rel.match(/Id="([^"]+)"/);
        const targetMatch = rel.match(/Target="([^"]+)"/);
        const typeMatch = rel.match(/Type="[^"]*\/(\w+)"/);
        if (idMatch && targetMatch && typeMatch) {
          if (typeMatch[1] === 'image') {
            imageRels[idMatch[1]] = targetMatch[1];
          } else if (typeMatch[1] === 'hyperlink') {
            hyperlinkRels[idMatch[1]] = targetMatch[1];
          }
        }
      }

      // Load images as base64
      for (const [relId, target] of Object.entries(imageRels)) {
        const imagePath = target.startsWith('/') ? target.slice(1) : `word/${target}`;
        const imageFile = zip.file(imagePath);
        if (imageFile) {
          const imageBase64 = await imageFile.async('base64');
          const ext = target.split('.').pop().toLowerCase();
          const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
          images[relId] = `data:${mime};base64,${imageBase64}`;
        }
      }
    }

    // Convert XML to HTML
    const html = convertDocxXmlToHtml(documentXml, images, hyperlinkRels);

    return {
      html,
      text: extractPlainText(documentXml),
      success: true,
    };
  } catch (error) {
    console.log('DOCX parse error:', error);
    return {
      html: null,
      text: null,
      success: false,
      error: error.message,
    };
  }
}

function convertDocxXmlToHtml(xml, images, hyperlinkRels) {
  // Remove namespace prefixes for easier parsing
  const cleanXml = xml
    .replace(/<w:/g, '<w_')
    .replace(/<\/w:/g, '</w_')
    .replace(/<r:/g, '<r_')
    .replace(/<\/r:/g, '</r_')
    .replace(/<a:/g, '<a_')
    .replace(/<\/a:/g, '</a_')
    .replace(/<wp:/g, '<wp_')
    .replace(/<\/wp:/g, '</wp_')
    .replace(/<mc:/g, '<mc_')
    .replace(/<\/mc:/g, '</mc_');

  // Process the document body content in order (paragraphs and tables interleaved)
  // Match top-level w_p and w_tbl elements in document order
  const bodyMatch = cleanXml.match(/<w_body>([\s\S]*)<\/w_body>/);
  const bodyContent = bodyMatch ? bodyMatch[1] : cleanXml;

  let html = '';
  // Match paragraphs and tables in order
  const blockRegex = /<w_tbl>[\s\S]*?<\/w_tbl>|<w_p[ >][\s\S]*?<\/w_p>/g;
  let match;
  while ((match = blockRegex.exec(bodyContent)) !== null) {
    const block = match[0];
    if (block.startsWith('<w_tbl>')) {
      html += convertTable(block, images, hyperlinkRels);
    } else {
      const { tag, style } = getParagraphStyle(block);
      const content = extractParagraphContent(block, images, hyperlinkRels);
      if (content.trim() || tag === 'br') {
        html += `<${tag}${style}>${content}</${tag}>`;
      } else {
        html += '<br/>';
      }
    }
  }

  return html || '<p style="color:#A0A0B8;">Document appears to be empty.</p>';
}

function convertTable(tableXml, images, hyperlinkRels) {
  let html = '<table>';
  const rows = tableXml.match(/<w_tr[ >][\s\S]*?<\/w_tr>/g) || [];
  for (const row of rows) {
    html += '<tr>';
    const cells = row.match(/<w_tc[ >][\s\S]*?<\/w_tc>/g) || [];
    for (const cell of cells) {
      // Check for merge/span attributes
      const gridSpanMatch = cell.match(/w_gridSpan w_val="(\d+)"/);
      const colspan = gridSpanMatch ? ` colspan="${gridSpanMatch[1]}"` : '';

      html += `<td${colspan}>`;
      // Each cell can contain multiple paragraphs
      const cellParas = cell.match(/<w_p[ >][\s\S]*?<\/w_p>/g) || [];
      for (const para of cellParas) {
        const content = extractParagraphContent(para, images, hyperlinkRels);
        if (content.trim()) {
          html += `<p>${content}</p>`;
        }
      }
      html += '</td>';
    }
    html += '</tr>';
  }
  html += '</table>';
  return html;
}

function getParagraphStyle(paraXml) {
  let tag = 'p';
  let style = '';

  // Check for heading styles
  const styleMatch = paraXml.match(/w_pStyle w_val="([^"]+)"/);
  if (styleMatch) {
    const styleName = styleMatch[1].toLowerCase();
    if (styleName.includes('heading1') || styleName === 'title') {
      tag = 'h1';
    } else if (styleName.includes('heading2') || styleName === 'subtitle') {
      tag = 'h2';
    } else if (styleName.includes('heading3')) {
      tag = 'h3';
    } else if (styleName.includes('heading4')) {
      tag = 'h4';
    } else if (styleName.includes('heading5')) {
      tag = 'h5';
    } else if (styleName.includes('heading6')) {
      tag = 'h6';
    } else if (styleName.includes('listparagraph')) {
      tag = 'li';
    }
  }

  // Check for alignment
  const alignMatch = paraXml.match(/w_jc w_val="([^"]+)"/);
  if (alignMatch) {
    const align = alignMatch[1];
    if (align === 'center') style = ' style="text-align:center"';
    else if (align === 'right') style = ' style="text-align:right"';
    else if (align === 'both') style = ' style="text-align:justify"';
  }

  return { tag, style };
}

function extractParagraphContent(paraXml, images, hyperlinkRels) {
  let content = '';

  // Process content in order: runs, hyperlinks, and drawings can be interleaved
  // Match runs, hyperlinks, and drawings in document order
  const elementRegex = /<w_hyperlink[\s\S]*?<\/w_hyperlink>|<w_r[ >][\s\S]*?<\/w_r>|<w_drawing>[\s\S]*?<\/w_drawing>/g;
  let elemMatch;
  while ((elemMatch = elementRegex.exec(paraXml)) !== null) {
    const elem = elemMatch[0];

    if (elem.startsWith('<w_hyperlink')) {
      // Extract hyperlink with real URL from relationships
      const relIdMatch = elem.match(/r_id="([^"]+)"/);
      const href = (relIdMatch && hyperlinkRels && hyperlinkRels[relIdMatch[1]])
        ? escapeHtml(hyperlinkRels[relIdMatch[1]])
        : '#';
      const linkRuns = elem.match(/<w_r[ >][\s\S]*?<\/w_r>/g) || [];
      let linkText = '';
      for (const run of linkRuns) {
        linkText += extractRunText(run);
      }
      if (linkText) {
        content += `<a href="${href}">${escapeHtml(linkText)}</a>`;
      }
    } else if (elem.startsWith('<w_drawing>')) {
      const embedMatch = elem.match(/r_embed="([^"]+)"/);
      if (embedMatch && images[embedMatch[1]]) {
        content += `<img src="${images[embedMatch[1]]}" style="max-width:100%;height:auto;border-radius:8px;margin:8px 0;" />`;
      }
    } else {
      // Regular text run
      const text = extractRunText(elem);
      if (!text) continue;

      const isBold = elem.includes('<w_b/>') || elem.includes('<w_b ') || elem.includes('w_val="true"');
      const isItalic = elem.includes('<w_i/>') || elem.includes('<w_i ');
      const isUnderline = elem.includes('<w_u ');
      const isStrike = elem.includes('<w_strike');

      const colorMatch = elem.match(/w_color w_val="([^"]+)"/);
      const sizeMatch = elem.match(/w_sz w_val="(\d+)"/);

      let styledText = escapeHtml(text);

      let inlineStyle = '';
      if (colorMatch && colorMatch[1] !== '000000' && colorMatch[1] !== 'auto') {
        inlineStyle += `color:#${colorMatch[1]};`;
      }
      if (sizeMatch) {
        const sizePt = parseInt(sizeMatch[1]) / 2;
        if (sizePt > 14) inlineStyle += `font-size:${sizePt}px;`;
      }

      if (inlineStyle) {
        styledText = `<span style="${inlineStyle}">${styledText}</span>`;
      }

      if (isBold) styledText = `<strong>${styledText}</strong>`;
      if (isItalic) styledText = `<em>${styledText}</em>`;
      if (isUnderline) styledText = `<u>${styledText}</u>`;
      if (isStrike) styledText = `<s>${styledText}</s>`;

      content += styledText;
    }
  }

  return content;
}

function extractRunText(runXml) {
  let text = '';
  // Match w_t elements (text content)
  const textMatches = runXml.match(/<w_t[^>]*>([\s\S]*?)<\/w_t>/g) || [];
  for (const match of textMatches) {
    const inner = match.replace(/<w_t[^>]*>/, '').replace(/<\/w_t>/, '');
    text += inner;
  }

  // Handle tabs
  if (runXml.includes('<w_tab/>')) text += '\t';

  // Handle line breaks
  if (runXml.includes('<w_br/>') || runXml.includes('<w_br ')) text += '<br/>';

  return text;
}

function extractPlainText(xml) {
  // Simple text extraction
  const textMatches = xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
  return textMatches
    .map((m) => m.replace(/<w:t[^>]*>/, '').replace(/<\/w:t>/, ''))
    .join(' ');
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
