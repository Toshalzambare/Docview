import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Share, Alert, Modal, TextInput, Dimensions } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import ReactNativeBlobUtil from 'react-native-blob-util';
import * as XLSX from 'xlsx';
import { theme } from '../utils/theme';
import { getFileExtension, getFileType, formatFileSize } from '../utils/fileTypes';
import { parseDocx } from '../utils/docxParser';
import { parsePptx } from '../utils/pptxParser';
import { parseLegacyPpt } from '../utils/pptParser';
import { parseLegacyDoc } from '../utils/docParser';
import SearchBar from '../components/SearchBar';
import { useHistory } from '../contexts/HistoryContext';

// Viewers
import PdfViewer from '../viewers/PdfViewer';
import ImageViewer from '../viewers/ImageViewer';
import TextViewer from '../viewers/TextViewer';
import JsonViewer from '../viewers/JsonViewer';
import MarkdownViewer from '../viewers/MarkdownViewer';
import SpreadsheetViewer from '../viewers/SpreadsheetViewer';
import WebViewer from '../viewers/WebViewer';
import CodeViewer from '../viewers/CodeViewer';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Cache for content:// URI copies to avoid re-copying on the same file
const contentUriCache = {};
const CACHE_MAX_SIZE = 20;

// Clean up old cached files on startup
const cleanupCache = async () => {
  try {
    const cacheDir = ReactNativeBlobUtil.fs.dirs.CacheDir;
    const files = await ReactNativeBlobUtil.fs.ls(cacheDir);
    const docviewFiles = files.filter(f => f.startsWith('docview_'));
    // Remove files older than 1 hour
    for (const file of docviewFiles) {
      try {
        const stat = await ReactNativeBlobUtil.fs.stat(`${cacheDir}/${file}`);
        const age = Date.now() - stat.lastModified;
        if (age > 3600000) {
          await ReactNativeBlobUtil.fs.unlink(`${cacheDir}/${file}`);
        }
      } catch {}
    }
    // Clear in-memory cache if too large
    const keys = Object.keys(contentUriCache);
    if (keys.length > CACHE_MAX_SIZE) {
      keys.slice(0, keys.length - CACHE_MAX_SIZE).forEach(k => delete contentUriCache[k]);
    }
  } catch {}
};

// Run cleanup on module load
cleanupCache();

// Check if URI is a remote URL
const isRemoteUrl = (uri) => {
  return uri.startsWith('http://') || uri.startsWith('https://');
};

// Download remote file to cache with progress tracking
const downloadRemoteFile = async (url, onProgress) => {
  const cacheDir = ReactNativeBlobUtil.fs.dirs.CacheDir;
  // Extract filename from URL
  const urlPath = url.split('?')[0].split('#')[0];
  const urlFilename = decodeURIComponent(urlPath.split('/').pop() || 'download');
  const destPath = `${cacheDir}/docview_${Date.now()}_${urlFilename}`;

  const res = await ReactNativeBlobUtil.config({
    path: destPath,
    timeout: 30000,
  }).fetch('GET', url, {})
    .progress((received, total) => {
      if (total > 0 && onProgress) {
        onProgress(received / total);
      }
    });

  const status = res.respInfo?.status;
  if (status && status >= 400) {
    // Clean up failed download
    try { await ReactNativeBlobUtil.fs.unlink(destPath); } catch {}
    throw new Error(`Download failed with status ${status}`);
  }

  return destPath;
};

// Resolve URI to a local file path (handles file://, content://, and http(s):// URIs)
const resolveFilePath = async (uri, onProgress) => {
  if (uri.startsWith('file://')) {
    return uri.replace('file://', '');
  }
  if (uri.startsWith('content://')) {
    if (contentUriCache[uri]) return contentUriCache[uri];
    const destPath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/docview_${Date.now()}`;
    await ReactNativeBlobUtil.fs.cp(uri, destPath);
    contentUriCache[uri] = destPath;
    return destPath;
  }
  if (isRemoteUrl(uri)) {
    if (contentUriCache[uri]) return contentUriCache[uri];
    const destPath = await downloadRemoteFile(uri, onProgress);
    contentUriCache[uri] = destPath;
    return destPath;
  }
  return uri;
};

// Helper: read file as base64 using react-native-blob-util (more reliable than expo-file-system)
const readFileAsBase64 = async (uri, onProgress) => {
  const path = await resolveFilePath(uri, onProgress);
  return await ReactNativeBlobUtil.fs.readFile(path, 'base64');
};

// Helper: read file as text
const readFileAsText = async (uri, onProgress) => {
  if (isRemoteUrl(uri)) {
    const path = await resolveFilePath(uri, onProgress);
    return await ReactNativeBlobUtil.fs.readFile(path, 'utf8');
  }
  try {
    return await FileSystem.readAsStringAsync(uri);
  } catch {
    const path = await resolveFilePath(uri);
    return await ReactNativeBlobUtil.fs.readFile(path, 'utf8');
  }
};

// Detect Office format from ZIP contents using JSZip
const detectOfficeZipFormat = async (path) => {
  try {
    const JSZip = require('jszip');
    const base64 = await ReactNativeBlobUtil.fs.readFile(path, 'base64');
    const zip = await JSZip.loadAsync(base64, { base64: true });
    const paths = [];
    zip.forEach((p) => paths.push(p.toLowerCase()));

    if (paths.some(p => p.startsWith('ppt/') || p.includes('/slides/'))) return 'pptx';
    if (paths.some(p => p.startsWith('xl/') || p.includes('/worksheets/'))) return 'xlsx';
    if (paths.some(p => p.startsWith('word/') || p.includes('/document.xml'))) return 'docx';
    return null;
  } catch {
    return null;
  }
};

// Detect file type from content when extension is missing/unknown
const detectExtFromContent = async (uri, onProgress) => {
  try {
    const path = await resolveFilePath(uri, onProgress);
    const exists = await ReactNativeBlobUtil.fs.exists(path);
    if (!exists) return null;
    const chunk = await ReactNativeBlobUtil.fs.readFile(path, 'base64');
    const raw = atob(chunk.substring(0, 64));

    // PDF
    if (raw.startsWith('%PDF')) return 'pdf';
    // PNG
    if (raw.charCodeAt(0) === 0x89 && raw.substring(1, 4) === 'PNG') return 'png';
    // JPEG
    if (raw.charCodeAt(0) === 0xFF && raw.charCodeAt(1) === 0xD8) return 'jpg';
    // GIF
    if (raw.startsWith('GIF8')) return 'gif';
    // BMP
    if (raw.startsWith('BM')) return 'bmp';
    // WebP
    if (raw.substring(0, 4) === 'RIFF' && raw.substring(8, 12) === 'WEBP') return 'webp';
    // ZIP-based (docx, xlsx, pptx) — use JSZip for reliable detection
    if (raw.substring(0, 2) === 'PK') {
      const format = await detectOfficeZipFormat(path);
      return format; // Returns 'pptx', 'xlsx', 'docx', or null
    }
    // OLE2 (doc, xls, ppt)
    if (raw.charCodeAt(0) === 0xD0 && raw.charCodeAt(1) === 0xCF) return 'doc';
    // SVG
    if (raw.trim().startsWith('<svg') || raw.trim().startsWith('<?xml')) {
      if (raw.includes('<svg')) return 'svg';
      return 'xml';
    }
    // JSON
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
    // HTML
    if (trimmed.toLowerCase().startsWith('<!doctype html') || trimmed.toLowerCase().startsWith('<html')) return 'html';
  } catch (e) {
    console.log('Content detection failed:', e.message);
  }
  return null;
};

export default function ViewerScreen({ route, navigation }) {
  const { file: initialFile } = route.params;
  const [file, setFile] = useState(initialFile);
  const { addToHistory, saveAs } = useHistory();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [content, setContent] = useState(null);
  const [viewerType, setViewerType] = useState(null);
  const [extraData, setExtraData] = useState(null);
  const [detectedExt, setDetectedExt] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [localUri, setLocalUri] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState(0);
  const [currentSearchMatch, setCurrentSearchMatch] = useState(0);
  const webViewRef = useRef(null);
  const isRemote = isRemoteUrl(file.uri);

  // Save As modal state
  const [isRenameVisible, setIsRenameVisible] = useState(false);
  const [customSaveName, setCustomSaveName] = useState('');

  const onProgress = (progress) => setDownloadProgress(progress);

  const rawExt = getFileExtension(file.name);
  const ext = detectedExt || rawExt;
  const fileType = getFileType(detectedExt ? `file.${detectedExt}` : file.name);

  // Header options & Save As triggering
  const triggerSaveAs = () => {
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    setCustomSaveName(baseName);
    setIsRenameVisible(true);
  };

  const handleSaveAsSubmit = async () => {
    if (!customSaveName.trim()) return;
    setIsRenameVisible(false);
    await saveAs(file, customSaveName.trim());
  };

  const handleShare = async () => {
    try {
      const uriToShare = localUri || file.uri;
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uriToShare, {
          mimeType: fileType?.mime || '*/*',
          dialogTitle: 'Open In...'
        });
      } else {
        Alert.alert("Error", "Sharing is not available on this device.");
      }
    } catch (e) {
      console.log('Share error:', e);
      Alert.alert("Error", "Could not share or open the file.");
    }
  };

  useEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <View style={styles.headerTitle}>
          <Text style={styles.headerFileName} numberOfLines={1}>{file.name}</Text>
          <Text style={styles.headerFileType}>{fileType.label}{file.size ? ` • ${formatFileSize(file.size)}` : ''}</Text>
        </View>
      ),
      headerRight: () => (
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => setShowSearch(s => !s)} style={styles.headerButton}>
            <Text style={styles.headerButtonText}>🔍</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={triggerSaveAs} style={styles.headerButton}>
            <Text style={styles.headerButtonText}>💾</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleShare} style={styles.headerButton}>
            <Text style={styles.headerButtonText}>📤</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [file, fileType, detectedExt]);

  useEffect(() => {
    const logHistoryAndLoad = async () => {
      // Reset view state when a new file is loaded
      setLoading(true);
      setError(null);
      setContent(null);
      setViewerType(null);
      
      const currentFile = route.params.file;
      const persistedFile = await addToHistory(currentFile);
      const activeFile = persistedFile || currentFile;
      setFile(activeFile);
      await loadFile(activeFile);
    };
    logHistoryAndLoad();
  }, [route.params.file?.uri]);

  // Search handler
  const handleSearch = useCallback((query) => {
    setSearchQuery(query);
    setCurrentSearchMatch(0);
    if (!query) {
      setSearchMatches(0);
      return;
    }
    // For text-based content, count matches
    if (content && typeof content === 'string') {
      const lowerContent = content.toLowerCase();
      const lowerQuery = query.toLowerCase();
      let count = 0;
      let pos = 0;
      while ((pos = lowerContent.indexOf(lowerQuery, pos)) !== -1) {
        count++;
        pos += lowerQuery.length;
      }
      setSearchMatches(count);
    }
  }, [content]);

  const handleSearchNext = useCallback(() => {
    setCurrentSearchMatch(prev => (prev + 1) % Math.max(searchMatches, 1));
  }, [searchMatches]);

  const handleSearchPrev = useCallback(() => {
    setCurrentSearchMatch(prev => (prev - 1 + Math.max(searchMatches, 1)) % Math.max(searchMatches, 1));
  }, [searchMatches]);



  const showFileInfo = () => {
    Alert.alert(
      'File Info',
      [
        `Name: ${file.name}`,
        `Type: ${fileType.label}`,
        `Size: ${file.size ? formatFileSize(file.size) : 'Unknown'}`,
        `Extension: .${ext}`,
        file.mimeType ? `MIME: ${file.mimeType}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      [{ text: 'OK' }]
    );
  };

  const loadFile = async (activeFile = file) => {
    try {
      setLoading(true);
      setError(null);
      setDownloadProgress(null);

      // For remote files, download first to get a local path
      let fileUri = activeFile.uri;
      const isRemoteFile = isRemoteUrl(activeFile.uri);
      if (isRemoteFile) {
        setDownloadProgress(0);
        const cachedPath = await resolveFilePath(activeFile.uri, onProgress);
        fileUri = cachedPath;
        setLocalUri(cachedPath);
        setDownloadProgress(1);
      }

      // If no extension or unknown extension, try to detect from file content
      let effectiveExt = ext;
      if (!rawExt || !getFileType(activeFile.name).category || getFileType(activeFile.name).category === 'unknown') {
        const detected = await detectExtFromContent(fileUri, onProgress);
        if (detected) {
          effectiveExt = detected;
          setDetectedExt(detected);
        }
      }

      // Use resolved local path for all operations
      const uri = fileUri;

      switch (effectiveExt) {
        // PDF
        case 'pdf':
          setViewerType('pdf');
          break;

        // Images
        case 'png':
        case 'jpg':
        case 'jpeg':
        case 'gif':
        case 'bmp':
        case 'webp':
        case 'ico':
          setViewerType('image');
          break;

        // SVG
        case 'svg':
          const svgContent = await readFileAsText(uri, onProgress);
          setContent(svgContent);
          setViewerType('web');
          break;

        // Word Documents (DOCX only - zip-based)
        case 'docx':
          await loadDocx(uri);
          break;

        // Old Word format (.doc) - binary, not zip
        case 'doc':
          await loadDoc(uri);
          break;

        // Spreadsheets
        case 'xlsx':
        case 'xls':
          await loadSpreadsheet(uri);
          break;

        // CSV
        case 'csv':
          await loadCsv(uri);
          break;

        // PowerPoint (PPTX only - zip-based)
        case 'pptx':
          await loadPptx(uri);
          break;

        // Old PowerPoint format (.ppt) - binary, not zip
        case 'ppt':
          await loadLegacyPpt(uri);
          break;

        // JSON
        case 'json':
          const jsonContent = await readFileAsText(uri, onProgress);
          setContent(jsonContent);
          setViewerType('json');
          break;

        // Markdown
        case 'md':
        case 'markdown':
          const mdContent = await readFileAsText(uri, onProgress);
          setContent(mdContent);
          setViewerType('markdown');
          break;

        // HTML
        case 'html':
        case 'htm':
          const htmlContent = await readFileAsText(uri, onProgress);
          setContent(htmlContent);
          setViewerType('web');
          break;

        // XML
        case 'xml':
          const xmlContent = await readFileAsText(uri, onProgress);
          setContent(xmlContent);
          setViewerType('text');
          break;

        // Code extensions mapping
        case 'js':
        case 'ts':
        case 'jsx':
        case 'tsx':
        case 'py':
        case 'java':
        case 'c':
        case 'cpp':
        case 'h':
        case 'sh':
        case 'css':
          const codeContent = await readFileAsText(uri, onProgress);
          setContent(codeContent);
          setViewerType('code');
          break;

        // All other text-based files
        default:
          try {
            const textContent = await readFileAsText(uri, onProgress);
            setContent(textContent);
            setViewerType('text');
          } catch {
            setError(`Cannot preview .${effectiveExt} files. The file format is not supported for viewing.`);
          }
          break;
      }
    } catch (err) {
      console.log('Load error:', err);
      if (err.message?.includes('timeout') || err.message?.includes('network') || err.message?.includes('Network')) {
        setError('Network error: Could not download file. Check your internet connection and try again.');
      } else {
        setError(`Failed to load file: ${err.message}`);
      }
    } finally {
      setLoading(false);
      setDownloadProgress(null);
    }
  };

  const loadDocx = async (uri) => {
    try {
      const base64 = await readFileAsBase64(uri || file.uri, onProgress);
      if (!base64 || base64.length < 10) {
        throw new Error('Failed to read file data');
      }

      const result = await parseDocx(base64);

      if (result.success && result.html) {
        setContent(result.html);
        setViewerType('web');
      } else if (result.text) {
        setContent(result.text);
        setViewerType('text');
      } else {
        // Parse failed — file might be misidentified. Re-detect format from ZIP contents.
        const path = await resolveFilePath(uri || file.uri);
        const realFormat = await detectOfficeZipFormat(path);
        if (realFormat && realFormat !== 'docx') {
          console.log('File misidentified as docx, actually:', realFormat);
          if (realFormat === 'pptx') return await loadPptx(uri);
          if (realFormat === 'xlsx' || realFormat === 'xls') return await loadSpreadsheet(uri);
        }
        setError('Could not read Word document: ' + (result.error || 'Unknown format'));
      }
    } catch (err) {
      // Also try re-detection on exception
      try {
        const path = await resolveFilePath(uri || file.uri);
        const realFormat = await detectOfficeZipFormat(path);
        if (realFormat && realFormat !== 'docx') {
          console.log('File misidentified as docx, actually:', realFormat);
          if (realFormat === 'pptx') return await loadPptx(uri);
          if (realFormat === 'xlsx' || realFormat === 'xls') return await loadSpreadsheet(uri);
        }
      } catch {}
      setError('Could not read Word document: ' + err.message);
    }
  };

  // Handle old .doc binary format - use proper piece table parser
  const loadDoc = async (uri) => {
    try {
      const base64 = await readFileAsBase64(uri || file.uri, onProgress);
      if (!base64 || base64.length < 10) {
        throw new Error('Failed to read file data');
      }

      const result = parseLegacyDoc(base64);

      if (result.success && result.text && result.text.length > 10) {
        // Wrap plain text in HTML paragraphs to render via WebViewer (makes it look like a document)
        const html = result.text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .split('\n')
          .filter(line => line.trim())
          .map(line => `<p>${line}</p>`)
          .join('');
        setContent(html);
        setViewerType('web');
      } else {
        setError(
          'Could not extract readable text from this .doc file.\\n' +
          (result.error || 'The old .doc binary format has limited support.')
        );
      }
    } catch (err) {
      console.log('DOC parse error:', err);
      setError('Could not read .doc file: ' + err.message + '\\nThe old .doc format has limited support.');
    }
  };

  const loadSpreadsheet = async (uri) => {
    try {
      const base64 = await readFileAsBase64(uri || file.uri, onProgress);

      if (!base64 || base64.length < 10) {
        throw new Error('Failed to read file data');
      }

      const wb = XLSX.read(base64, {
        type: 'base64',
        sheetRows: 200,
        cellStyles: false,
        cellFormula: false,
        cellDates: false,
        bookSheets: false,
        bookVBA: false,
        bookProps: false,
      });

      const sheetNames = wb.SheetNames;
      if (!sheetNames || sheetNames.length === 0) {
        throw new Error('No sheets found in spreadsheet');
      }

      const sheetsData = sheetNames.map((name) => {
        const sheet = wb.Sheets[name];
        return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      });

      setContent(sheetsData);
      setExtraData({ sheetNames });
      setViewerType('spreadsheet');
    } catch (err) {
      console.log('Spreadsheet error:', err);
      setError('Could not read spreadsheet: ' + err.message);
    }
  };

  const loadCsv = async (uri) => {
    try {
      const csvText = await readFileAsText(uri || file.uri, onProgress);
      if (!csvText || csvText.length === 0) {
        throw new Error('File is empty');
      }

      // Parse CSV manually - much faster than XLSX for CSV files
      const lines = csvText.split('\n');
      const data = lines.slice(0, 200).map((line) => {
        // Handle quoted CSV fields
        const fields = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            inQuotes = !inQuotes;
          } else if (ch === ',' && !inQuotes) {
            fields.push(current.trim());
            current = '';
          } else {
            current += ch;
          }
        }
        fields.push(current.trim().replace(/\r$/, ''));
        return fields;
      }).filter(row => row.some(cell => cell !== ''));

      setContent([data]);
      setExtraData({ sheetNames: ['Sheet1'] });
      setViewerType('spreadsheet');
    } catch (err) {
      console.log('CSV error:', err);
      // Fallback to text viewer
      try {
        const text = await readFileAsText(uri || file.uri);
        setContent(text);
        setViewerType('text');
      } catch {
        setError('Could not read CSV file: ' + err.message);
      }
    }
  };

  const loadPptx = async (uri) => {
    try {
      const base64 = await readFileAsBase64(uri || file.uri, onProgress);
      console.log('PPTX base64 length:', base64?.length);

      if (!base64 || base64.length < 10) {
        throw new Error('Failed to read file data');
      }

      const result = await parsePptx(base64);

      if (result.success && result.html) {
        setContent(result.html);
        setViewerType('web');
      } else {
        setError('Could not read presentation: ' + (result.error || 'Unknown format'));
      }
    } catch (err) {
      setError('Could not read presentation: ' + err.message);
    }
  };

  // Handle old .ppt binary format - parse as slides using record-level parsing
  const loadLegacyPpt = async (uri) => {
    try {
      const base64 = await readFileAsBase64(uri || file.uri, onProgress);
      if (!base64 || base64.length < 10) {
        throw new Error('Failed to read file data');
      }

      const result = parseLegacyPpt(base64);

      if (result.success && result.html) {
        setContent(result.html);
        setViewerType('web');
      } else {
        setError(
          'Could not read this .ppt file.\n\n' +
          (result.error || '') + '\n' +
          'For best results, convert to .pptx format using Microsoft Office or Google Docs.'
        );
      }
    } catch (err) {
      setError(
        `Could not read .ppt file: ${err.message}\n\n` +
        'For best results, convert to .pptx format.'
      );
    }
  };

  // Render loading state
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
        {downloadProgress !== null && downloadProgress < 1 ? (
          <>
            <Text style={styles.loadingText}>Downloading file...</Text>
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBar, { width: `${Math.round(downloadProgress * 100)}%` }]} />
            </View>
            <Text style={styles.progressText}>{Math.round(downloadProgress * 100)}%</Text>
          </>
        ) : (
          <Text style={styles.loadingText}>Opening {fileType.label}...</Text>
        )}
      </View>
    );
  }

  // Render error state
  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorTitle}>Cannot Open File</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadFile}>
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Render the appropriate viewer — use local cached path for remote files
  const effectiveUri = localUri ? `file://${localUri}` : file.uri;
  const renderViewer = () => {
    switch (viewerType) {
      case 'pdf':
        return <PdfViewer uri={effectiveUri} />;
      case 'image':
        return <ImageViewer uri={effectiveUri} />;
      case 'code':
        return <CodeViewer content={content} language={ext} />;
      case 'text':
        return <TextViewer content={content} language={ext} searchQuery={searchQuery} currentMatch={currentSearchMatch} />;
      case 'json':
        return <JsonViewer content={content} />;
      case 'markdown':
        return <MarkdownViewer content={content} />;
      case 'spreadsheet':
        return <SpreadsheetViewer data={content} sheetNames={extraData?.sheetNames} />;
      case 'web':
        return <WebViewer html={content} searchQuery={searchQuery} ref={webViewRef} />;
      default:
        return (
          <View style={styles.centerContainer}>
            <Text style={styles.errorIcon}>📎</Text>
            <Text style={styles.errorTitle}>Unsupported Format</Text>
            <Text style={styles.errorMessage}>
              .{ext} files cannot be previewed yet.
            </Text>
          </View>
        );
    }
  };

  return (
    <View style={styles.container}>
      {showSearch && (
        <SearchBar
          onSearch={handleSearch}
          onClose={() => { setShowSearch(false); setSearchQuery(''); setSearchMatches(0); }}
          matchCount={searchMatches}
          currentMatch={currentSearchMatch}
          onNext={handleSearchNext}
          onPrev={handleSearchPrev}
        />
      )}
      
      {renderViewer()}

      {/* Save As Modal Dialog inside Viewer Screen */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isRenameVisible}
        onRequestClose={() => setIsRenameVisible(false)}
      >
        <View style={styles.modalCentered}>
          <View style={styles.dialogCard}>
            <Text style={styles.dialogTitle}>Save Document</Text>
            <Text style={styles.dialogSubtitle}>Enter custom file name:</Text>
            
            <TextInput
              style={styles.dialogInput}
              value={customSaveName}
              onChangeText={setCustomSaveName}
              autoFocus={true}
              placeholder="Filename"
              placeholderTextColor={theme.colors.textMuted}
            />

            <View style={styles.dialogButtons}>
              <TouchableOpacity
                style={styles.dialogBtnCancel}
                onPress={() => setIsRenameVisible(false)}
              >
                <Text style={styles.dialogBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dialogBtnSubmit}
                onPress={handleSaveAsSubmit}
              >
                <Text style={styles.dialogBtnSubmitText}>Save As</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
    padding: theme.spacing.xl,
  },
  headerTitle: {
    alignItems: 'center',
  },
  headerFileName: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    maxWidth: 200,
  },
  headerFileType: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 4,
  },
  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surface,
  },
  headerButtonText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  loadingText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
    marginTop: theme.spacing.md,
  },
  progressBarContainer: {
    width: 200,
    height: 4,
    backgroundColor: theme.colors.surface,
    borderRadius: 2,
    marginTop: theme.spacing.md,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: theme.colors.accent,
    borderRadius: 2,
  },
  progressText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing.xs,
  },
  errorIcon: {
    fontSize: 56,
    marginBottom: theme.spacing.md,
  },
  errorTitle: {
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  errorMessage: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  retryButton: {
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.full,
  },
  retryText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: theme.fontSize.md,
  },
  modalCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.overlay,
  },
  dialogCard: {
    width: SCREEN_WIDTH * 0.85,
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    elevation: 10,
  },
  dialogTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  dialogSubtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  dialogInput: {
    width: '100%',
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.sm,
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    marginBottom: theme.spacing.lg,
  },
  dialogButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: '100%',
    gap: 12,
  },
  dialogBtnCancel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.sm,
  },
  dialogBtnCancelText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm + 1,
    fontWeight: '700',
  },
  dialogBtnSubmit: {
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.sm,
  },
  dialogBtnSubmitText: {
    color: '#000000',
    fontSize: theme.fontSize.sm + 1,
    fontWeight: '700',
  },
});
