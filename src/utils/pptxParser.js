import JSZip from 'jszip';

/**
 * Parse PPTX file from base64 string and convert to HTML slides
 * PPTX files are ZIP archives containing XML files.
 * Slides are in ppt/slides/slide1.xml, slide2.xml, etc.
 *
 * Renders each slide as a visual card with proper layout,
 * background color, and text positioning similar to how
 * mobile PowerPoint viewers display slides.
 */
export async function parsePptx(base64Data) {
  try {
    // Clean base64 data - remove data URI prefix if present
    let cleanBase64 = base64Data;
    if (!cleanBase64 || typeof cleanBase64 !== 'string') {
      throw new Error('Invalid input: base64 data is empty or not a string');
    }
    const commaIdx = cleanBase64.indexOf(',');
    if (commaIdx !== -1 && commaIdx < 100) {
      cleanBase64 = cleanBase64.substring(commaIdx + 1);
    }

    // Clean whitespace/newlines from base64
    cleanBase64 = cleanBase64.replace(/[\s\r\n]/g, '');

    const zip = await JSZip.loadAsync(cleanBase64, { base64: true });

    // Find all slide files
    const allPaths = [];
    const slideFiles = [];
    zip.forEach((path, entry) => {
      allPaths.push(path);
      // Match slide files with flexible path matching
      const match = path.match(/ppt[\\/]slides[\\/]slide(\d+)\.xml$/i);
      if (match) {
        slideFiles.push({ path, number: parseInt(match[1]), entry });
      }
    });

    // Sort by slide number
    slideFiles.sort((a, b) => a.number - b.number);

    if (slideFiles.length === 0) {
      // Try alternative: look for any XML file containing slide content
      for (const p of allPaths) {
        if (p.toLowerCase().includes('slide') && p.endsWith('.xml')) {
          const numMatch = p.match(/slide(\d+)\.xml$/i);
          if (numMatch) {
            slideFiles.push({ path: p, number: parseInt(numMatch[1]), entry: zip.file(p) });
          }
        }
      }
      slideFiles.sort((a, b) => a.number - b.number);

      if (slideFiles.length === 0) {
        throw new Error('No slides found in presentation');
      }
    }

    // Load slide relationships for images and hyperlinks
    const images = {};
    const slideHyperlinks = {};
    for (const slideFile of slideFiles) {
      try {
        const relsPath = `ppt/slides/_rels/slide${slideFile.number}.xml.rels`;
        const relsFile = zip.file(relsPath);
        if (relsFile) {
          const relsXml = await relsFile.async('text');
          const relMatches = (relsXml || '').match(/<Relationship[^>]*>/g) || [];
          for (const rel of relMatches) {
            const idMatch = rel.match(/Id="([^"]+)"/);
            const targetMatch = rel.match(/Target="([^"]+)"/);
            const typeMatch = rel.match(/Type="[^"]*\/(\w+)"/);
            if (!idMatch || !targetMatch || !typeMatch) continue;

            if (typeMatch[1] === 'image') {
              const target = targetMatch[1];
              const imagePath = target.startsWith('/')
                ? target.slice(1)
                : `ppt/slides/${target}`.replace('/slides/../', '/');
              const normalizedPath = imagePath.replace(/\.\.\//g, '').replace('ppt/ppt/', 'ppt/');
              let imageFile = zip.file(normalizedPath);
              if (!imageFile) {
                const altPath = `ppt/${target.replace('../', '')}`;
                imageFile = zip.file(altPath);
              }
              if (imageFile) {
                try {
                  const imgBase64 = await imageFile.async('base64');
                  const ext = target.split('.').pop().toLowerCase();
                  const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' :
                    ext === 'svg' ? 'image/svg+xml' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
                  images[`${slideFile.number}_${idMatch[1]}`] = `data:${mime};base64,${imgBase64}`;
                } catch (imgErr) {
                  console.log('Failed to load image:', imgErr.message);
                }
              }
            } else if (typeMatch[1] === 'hyperlink') {
              if (!slideHyperlinks[slideFile.number]) slideHyperlinks[slideFile.number] = {};
              slideHyperlinks[slideFile.number][idMatch[1]] = targetMatch[1];
            }
          }
        }
      } catch (relErr) {
        console.log('Failed to load slide relationships:', relErr.message);
      }
    }

    // Parse each slide (with individual error handling so one bad slide doesn't crash everything)
    const slides = [];
    for (const slideFile of slideFiles) {
      try {
        const entry = slideFile.entry || zip.file(slideFile.path);
        if (!entry) continue;
        const slideXml = await entry.async('text');
        if (!slideXml || typeof slideXml !== 'string') continue;
        const links = slideHyperlinks[slideFile.number] || {};
        const slideHtml = parseSlideXml(slideXml, slideFile.number, images, links);
        slides.push({
          number: slideFile.number,
          html: slideHtml || '<p style="color:#6C6C80;">Empty slide</p>',
        });
      } catch (slideErr) {
        console.log(`Failed to parse slide ${slideFile.number}:`, slideErr.message);
        slides.push({
          number: slideFile.number,
          html: `<p style="color:#8E918F;">Slide content could not be loaded</p>`,
        });
      }
    }

    if (slides.length === 0) {
      throw new Error('No slide content could be extracted');
    }

    // Build full HTML with slide-card styling
    const fullHtml = slides
      .map(
        (slide) => `
        <div class="slide">
          <div class="slide-number">Slide ${slide.number} of ${slides.length}</div>
          ${slide.html}
        </div>
      `
      )
      .join('');

    return {
      html: fullHtml,
      slideCount: slides.length,
      success: true,
    };
  } catch (error) {
    console.log('PPTX parse error:', error);
    return {
      html: null,
      slideCount: 0,
      success: false,
      error: error.message || 'Unknown error parsing PPTX',
    };
  }
}

function parseSlideXml(xml, slideNumber, images, hyperlinks) {
  if (!xml || typeof xml !== 'string') return '';
  let html = '';

  // Remove namespace prefixes
  const cleanXml = xml
    .replace(/<a:/g, '<a_')
    .replace(/<\/a:/g, '</a_')
    .replace(/<p:/g, '<p_')
    .replace(/<\/p:/g, '</p_')
    .replace(/<r:/g, '<r_')
    .replace(/<\/r:/g, '</r_');

  // Extract shape tree (contains all content)
  const shapeTreeMatch = cleanXml.match(/<p_spTree>([\s\S]*)<\/p_spTree>/);
  if (!shapeTreeMatch || !shapeTreeMatch[1]) {
    return '<p style="color:#6C6C80;">Empty slide</p>';
  }

  const shapeTree = shapeTreeMatch[1];

  // Process all content elements in order
  let htmlContent = extractAllContent(shapeTree, slideNumber, images, hyperlinks);

  if (!htmlContent || !htmlContent.trim()) {
    // Fallback: extract all raw text from any text nodes
    const allTexts = [...cleanXml.matchAll(/<a_t>([\s\S]*?)<\/a_t>/g)]
      .map(m => escapeHtml(m[1]))
      .filter(t => t.trim());
    
    if (allTexts.length > 0) {
      htmlContent = allTexts.map(t => `<p>${t}</p>`).join('');
    }
  }

  return htmlContent || '<p style="color:#6C6C80;">Slide content could not be extracted</p>';
}

function extractAllContent(xml, slideNumber, images, hyperlinks) {
  if (!xml || typeof xml !== 'string') return '';
  let html = '';

  // Match shapes, group shapes, pictures, and graphicFrame in order
  const elementRegex = /<p_sp>[\s\S]*?<\/p_sp>|<p_grpSp>[\s\S]*?<\/p_grpSp>|<p_pic>[\s\S]*?<\/p_pic>|<p_graphicFrame>[\s\S]*?<\/p_graphicFrame>/g;
  let match;
  while ((match = elementRegex.exec(xml)) !== null) {
    const elem = match[0];
    if (!elem || typeof elem !== 'string') continue;

    try {
      if (elem.startsWith('<p_sp>')) {
        const content = parseShape(elem, slideNumber, images, hyperlinks);
        if (content) html += content;
      } else if (elem.startsWith('<p_grpSp>')) {
        html += extractAllContent(elem, slideNumber, images, hyperlinks);
      } else if (elem.startsWith('<p_pic>')) {
        const embedMatch = elem.match(/r_embed="([^"]+)"/);
        if (embedMatch) {
          const imgKey = `${slideNumber}_${embedMatch[1]}`;
          if (images[imgKey]) {
            html += `<div style="text-align:center;margin:12px 0;">
              <img src="${images[imgKey]}" style="max-width:100%;height:auto;border-radius:8px;" />
            </div>`;
          }
        }
      } else if (elem.startsWith('<p_graphicFrame>')) {
        html += parseGraphicFrame(elem, hyperlinks);
      }
    } catch (elemErr) {
      console.log('Error parsing slide element:', elemErr.message);
    }
  }

  return html;
}

function parseGraphicFrame(xml, hyperlinks) {
  if (!xml || typeof xml !== 'string') return '';
  // Check for table
  const tableMatch = xml.match(/<a_tbl>([\s\S]*?)<\/a_tbl>/);
  if (!tableMatch) return '';

  let html = '<table style="width:100%;border-collapse:collapse;margin:12px 0;">';
  const rows = tableMatch[1].match(/<a_tr[ >][\s\S]*?<\/a_tr>/g) || [];

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    html += '<tr>';
    const cells = rows[rowIdx].match(/<a_tc[ >][\s\S]*?<\/a_tc>/g) || [];
    for (const cell of cells) {
      const gridSpanMatch = cell.match(/gridSpan="(\d+)"/);
      const colspan = gridSpanMatch ? ` colspan="${gridSpanMatch[1]}"` : '';
      const rowSpanMatch = cell.match(/rowSpan="(\d+)"/);
      const rowspan = rowSpanMatch ? ` rowspan="${rowSpanMatch[1]}"` : '';

      // Skip merged cells
      if (cell.includes('vMerge="1"') || cell.includes('hMerge="1"')) continue;

      const isHeader = rowIdx === 0;
      const tag = isHeader ? 'th' : 'td';

      html += `<${tag}${colspan}${rowspan}>`;
      const cellParas = cell.match(/<a_p[ >][\s\S]*?<\/a_p>/g) || [];
      for (const para of cellParas) {
        const text = parseSlideParagraph(para, hyperlinks);
        if (text && text.trim()) html += `<p>${text}</p>`;
      }
      html += `</${tag}>`;
    }
    html += '</tr>';
  }
  html += '</table>';
  return html;
}

function parseShape(shapeXml, slideNumber, images, hyperlinks) {
  if (!shapeXml || typeof shapeXml !== 'string') return null;
  let content = '';

  // Extract text body
  const textBodyMatch = shapeXml.match(/<p_txBody>([\s\S]*?)<\/p_txBody>/);
  if (!textBodyMatch || !textBodyMatch[1]) return null;

  const textBody = textBodyMatch[1];

  // Extract paragraphs
  const paragraphs = textBody.match(/<a_p[ >][\s\S]*?<\/a_p>/g) || [];

  for (const para of paragraphs) {
    try {
      const paraContent = parseSlideParagraph(para, hyperlinks);
      if (paraContent && paraContent.trim()) {
        const pprMatch = para.match(/sz="(\d+)"/);
        const fontSize = pprMatch ? parseInt(pprMatch[1]) / 100 : null;

        let tag = 'p';
        let style = '';

        if (fontSize && fontSize > 28) {
          tag = 'h2';
          style = ' style="color:#4A9EFF;margin-bottom:12px;"';
        } else if (fontSize && fontSize > 20) {
          tag = 'h3';
          style = ' style="margin-bottom:8px;"';
        }

        // Check alignment
        const alignMatch = para.match(/algn="([^"]+)"/);
        if (alignMatch) {
          const align = alignMatch[1] === 'ctr' ? 'center' : alignMatch[1] === 'r' ? 'right' : 'left';
          const existingStyle = style ? style.slice(8, -1) : '';
          style = ` style="text-align:${align};${existingStyle}"`;
        }

        content += `<${tag}${style}>${paraContent}</${tag}>`;
      }
    } catch (paraErr) {
      console.log('Error parsing paragraph:', paraErr.message);
    }
  }

  return content;
}

function parseSlideParagraph(paraXml, hyperlinks) {
  if (!paraXml || typeof paraXml !== 'string') return '';
  let text = '';

  const runs = paraXml.match(/<a_r>[\s\S]*?<\/a_r>/g) || [];

  for (const run of runs) {
    try {
      // Get text content
      const textMatch = run.match(/<a_t>([\s\S]*?)<\/a_t>/);
      if (!textMatch || !textMatch[1]) continue;

      let runText = escapeHtml(textMatch[1]);

      // Check formatting
      const isBold = run.includes('b="1"');
      const isItalic = run.includes('i="1"');
      const isUnderline = run.includes('u="sng"');

      // Check color
      const colorMatch = run.match(/<a_solidFill>[\s\S]*?<a_srgbClr val="([^"]+)"[\s\S]*?<\/a_solidFill>/);
      if (colorMatch && colorMatch[1]) {
        runText = `<span style="color:#${colorMatch[1]}">${runText}</span>`;
      }

      if (isBold) runText = `<strong>${runText}</strong>`;
      if (isItalic) runText = `<em>${runText}</em>`;
      if (isUnderline) runText = `<u>${runText}</u>`;

      // Check for hyperlink
      const hlinkMatch = run.match(/r_id="([^"]+)"/);
      if (hlinkMatch && hlinkMatch[1] && hyperlinks && hyperlinks[hlinkMatch[1]]) {
        const href = hyperlinks[hlinkMatch[1]];
        if (href && typeof href === 'string') {
          runText = `<a href="${escapeHtml(href)}" style="color:#4A9EFF;">${runText}</a>`;
        }
      }

      text += runText;
    } catch (runErr) {
      console.log('Error parsing run:', runErr.message);
    }
  }

  // Handle bullet points
  const hasBullet = paraXml.includes('<a_buChar') || paraXml.includes('<a_buAutoNum');
  if (hasBullet && text) {
    const charMatch = paraXml.match(/<a_buChar char="([^"]+)"/);
    const bullet = charMatch ? charMatch[1] : '\u2022';
    text = `${bullet} ${text}`;
  }

  return text;
}

function escapeHtml(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
