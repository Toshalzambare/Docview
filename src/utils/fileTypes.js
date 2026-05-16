// File type detection and metadata
const FILE_TYPES = {
  // Documents
  pdf: { category: 'document', label: 'PDF', icon: '📄', color: '#FF4444' },
  doc: { category: 'document', label: 'Word', icon: '📝', color: '#2B5797' },
  docx: { category: 'document', label: 'Word', icon: '📝', color: '#2B5797' },

  // Spreadsheets
  xlsx: { category: 'spreadsheet', label: 'Excel', icon: '📊', color: '#217346' },
  xls: { category: 'spreadsheet', label: 'Excel', icon: '📊', color: '#217346' },
  csv: { category: 'spreadsheet', label: 'CSV', icon: '📊', color: '#4ADE80' },

  // Presentations
  pptx: { category: 'presentation', label: 'PowerPoint', icon: '📽️', color: '#D24726' },
  ppt: { category: 'presentation', label: 'PowerPoint', icon: '📽️', color: '#D24726' },

  // Code & Data
  json: { category: 'code', label: 'JSON', icon: '{ }', color: '#FBBF24' },
  md: { category: 'code', label: 'Markdown', icon: 'M↓', color: '#A0A0B8' },
  markdown: { category: 'code', label: 'Markdown', icon: 'M↓', color: '#A0A0B8' },
  txt: { category: 'code', label: 'Text', icon: 'Aa', color: '#A0A0B8' },
  xml: { category: 'code', label: 'XML', icon: '< >', color: '#F97316' },
  html: { category: 'code', label: 'HTML', icon: '< >', color: '#E44D26' },
  css: { category: 'code', label: 'CSS', icon: '{ }', color: '#264DE4' },
  js: { category: 'code', label: 'JavaScript', icon: 'JS', color: '#F7DF1E' },
  ts: { category: 'code', label: 'TypeScript', icon: 'TS', color: '#3178C6' },
  py: { category: 'code', label: 'Python', icon: '🐍', color: '#3776AB' },
  java: { category: 'code', label: 'Java', icon: '☕', color: '#ED8B00' },
  c: { category: 'code', label: 'C', icon: 'C', color: '#A8B9CC' },
  cpp: { category: 'code', label: 'C++', icon: 'C+', color: '#00599C' },
  log: { category: 'code', label: 'Log', icon: '📋', color: '#6C6C80' },

  // Images
  png: { category: 'image', label: 'PNG', icon: '🖼️', color: '#4A9EFF' },
  jpg: { category: 'image', label: 'JPEG', icon: '🖼️', color: '#4A9EFF' },
  jpeg: { category: 'image', label: 'JPEG', icon: '🖼️', color: '#4A9EFF' },
  gif: { category: 'image', label: 'GIF', icon: '🖼️', color: '#A855F7' },
  bmp: { category: 'image', label: 'BMP', icon: '🖼️', color: '#4A9EFF' },
  webp: { category: 'image', label: 'WebP', icon: '🖼️', color: '#4A9EFF' },
  svg: { category: 'image', label: 'SVG', icon: '🖼️', color: '#FFB13B' },
  ico: { category: 'image', label: 'Icon', icon: '🖼️', color: '#4A9EFF' },
};

export function getFileExtension(filename) {
  if (!filename) return '';
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

export function getFileType(filename) {
  const ext = getFileExtension(filename);
  return FILE_TYPES[ext] || { category: 'unknown', label: ext.toUpperCase() || 'File', icon: '📎', color: '#6C6C80' };
}

export function getFileCategory(filename) {
  return getFileType(filename).category;
}

export function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export function isSupported(filename) {
  const ext = getFileExtension(filename);
  return ext in FILE_TYPES;
}

export const SUPPORTED_EXTENSIONS = Object.keys(FILE_TYPES);
