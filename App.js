import React, { useEffect, useRef } from 'react';
import { StatusBar, Platform, NativeModules, AppState } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as FileSystem from 'expo-file-system';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import HomeScreen from './src/screens/HomeScreen';
import ViewerScreen from './src/screens/ViewerScreen';
import { theme } from './src/utils/theme';
import { HistoryProvider } from './src/contexts/HistoryContext';

const Stack = createNativeStackNavigator();

const darkTheme = {
  dark: true,
  colors: {
    primary: theme.colors.accent,
    background: theme.colors.background,
    card: theme.colors.surface,
    text: theme.colors.text,
    border: theme.colors.border,
    notification: theme.colors.accent,
  },
  fonts: DefaultTheme.fonts,
};

// Try to guess extension from MIME type when filename has no extension
const mimeToExt = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/json': 'json',
  'application/xml': 'xml',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'text/html': 'html',
  'text/xml': 'xml',
  'text/markdown': 'md',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
};

// Detect Office format from ZIP contents using JSZip for reliable detection
const detectOfficeFormat = async (filePath) => {
  try {
    const JSZip = require('jszip');
    const base64 = await ReactNativeBlobUtil.fs.readFile(filePath, 'base64');
    const zip = await JSZip.loadAsync(base64, { base64: true });
    const paths = [];
    zip.forEach((p) => paths.push(p.toLowerCase()));

    if (paths.some(p => p.startsWith('ppt/') || p.includes('/slides/'))) return 'pptx';
    if (paths.some(p => p.startsWith('xl/') || p.includes('/worksheets/'))) return 'xlsx';
    if (paths.some(p => p.startsWith('word/') || p.includes('/document.xml'))) return 'docx';
    return 'zip';
  } catch (e) {
    console.log('ZIP format detection failed:', e.message);
    return 'zip';
  }
};

// Resolve a file URI to a name with extension detection
const resolveFileForViewer = async (fileUri, fileName) => {
  // If we already have a good name with extension, use it
  if (fileName && fileName.includes('.')) {
    return { uri: fileUri, name: fileName };
  }

  // Copy to local cache if needed
  const timestamp = Date.now();
  let localUri = fileUri;

  if (fileUri.startsWith('content://')) {
    const destUri = `${FileSystem.cacheDirectory}incoming_${timestamp}_${fileName || 'file'}`;
    try {
      await FileSystem.copyAsync({ from: fileUri, to: destUri });
      localUri = destUri;
    } catch (copyErr) {
      console.log('FileSystem.copyAsync failed, trying blob-util:', copyErr.message);
      const destPath = destUri.replace('file://', '');
      await ReactNativeBlobUtil.fs.cp(fileUri, destPath);
      localUri = destUri;
    }
  }

  // Try to detect file type from content
  try {
    const localPath = localUri.replace('file://', '');
    const exists = await ReactNativeBlobUtil.fs.exists(localPath);
    if (exists) {
      const header = await ReactNativeBlobUtil.fs.readFile(localPath, 'base64');
      const headerStr = atob(header.substring(0, 24));

      if (headerStr.startsWith('%PDF')) {
        return { uri: localUri, name: (fileName || 'document') + '.pdf' };
      }
      if (headerStr.substring(0, 2) === 'PK') {
        const format = await detectOfficeFormat(localPath);
        const nameMap = { pptx: 'presentation', xlsx: 'spreadsheet', docx: 'document', zip: 'archive' };
        return { uri: localUri, name: (fileName || nameMap[format] || 'document') + '.' + format };
      }
      if (headerStr.charCodeAt(0) === 0xD0 && headerStr.charCodeAt(1) === 0xCF) {
        return { uri: localUri, name: (fileName || 'document') + '.doc' };
      }
    }
  } catch (e) {
    console.log('Header detection failed:', e.message);
  }

  return { uri: localUri, name: fileName || `file_${timestamp}` };
};

// Inner app component that has access to share intent context
function AppInner() {
  const navigationRef = useRef(null);
  const pendingFile = useRef(null);
  const lastHandledUrl = useRef(null);
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();

  const navigateToFile = (file) => {
    if (navigationRef.current?.isReady()) {
      navigationRef.current.navigate('Viewer', { file });
    } else {
      pendingFile.current = file;
    }
  };

  // Handle a file URI from ACTION_VIEW intent ("Open with" from file managers, WhatsApp, etc.)
  const handleIncomingFileUrl = async (url, mimeType) => {
    if (!url) return;

    // Skip our own scheme URLs (deep links, not file intents)
    if (url.startsWith('docview://') || url.startsWith('exp+docview://')) return;

    // Only handle file:// and content:// URIs (these are actual file intents)
    if (!url.startsWith('file://') && !url.startsWith('content://')) return;

    // Prevent double-processing the same URL
    if (lastHandledUrl.current === url) return;
    lastHandledUrl.current = url;

    try {
      // Try to extract a filename from the URI path
      let fileName = null;
      try {
        const pathSegments = url.split('/');
        const lastSegment = pathSegments.pop() || '';
        const decoded = decodeURIComponent(lastSegment);
        // Only use it as a name if it looks like a filename (non-empty, not a query param)
        if (decoded && decoded.length > 0 && !decoded.startsWith('?')) {
          fileName = decoded;
        }
      } catch (e) {
        console.log('Could not extract filename from URI:', e.message);
      }

      // If no good filename, use a generic one
      if (!fileName || fileName.length === 0) {
        fileName = 'Opened File';
      }

      // If no extension in the filename, try to add one from the MIME type
      if (!fileName.includes('.') && mimeType && mimeToExt[mimeType]) {
        fileName = fileName + '.' + mimeToExt[mimeType];
      }

      // Resolve the file (copy from content:// if needed, detect type from content)
      const resolved = await resolveFileForViewer(url, fileName);

      navigateToFile({
        uri: resolved.uri,
        name: resolved.name,
        openedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.log('Error handling incoming file URL:', err);
    }
  };

  // Handle share intent from WhatsApp / file managers / other apps (ACTION_SEND)
  useEffect(() => {
    if (!hasShareIntent || !shareIntent) return;

    const processShareIntent = async () => {
      try {
        // shareIntent.files is an array of shared files
        const files = shareIntent.files;
        if (files && files.length > 0) {
          const sharedFile = files[0];
          const fileUri = sharedFile.path || sharedFile.uri;
          const fileName = sharedFile.fileName || sharedFile.name;
          const mimeType = sharedFile.mimeType || sharedFile.type;

          if (fileUri) {
            let resolvedName = fileName;

            // If no name, try to extract from URI
            if (!resolvedName) {
              resolvedName = decodeURIComponent(fileUri.split('/').pop() || 'Shared File');
            }

            // If no extension in name, try from MIME type
            if (resolvedName && !resolvedName.includes('.') && mimeType && mimeToExt[mimeType]) {
              resolvedName = resolvedName + '.' + mimeToExt[mimeType];
            }

            // Mark this URL as handled so the Linking handler doesn't double-process it
            lastHandledUrl.current = fileUri;

            // Resolve the file (copy from content:// if needed, detect type)
            const resolved = await resolveFileForViewer(fileUri, resolvedName);

            navigateToFile({
              uri: resolved.uri,
              name: resolved.name,
              openedAt: new Date().toISOString(),
            });
          }
        } else if (shareIntent.text) {
          // Text/URL sharing — just open as text
          navigateToFile({
            uri: shareIntent.text,
            name: 'Shared Text.txt',
            openedAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.log('Error processing share intent:', err);
      } finally {
        resetShareIntent();
      }
    };

    processShareIntent();
  }, [hasShareIntent, shareIntent]);

  // Handle ACTION_VIEW intents ("Open with" from file managers, WhatsApp open, etc.)
  // Uses native IntentDataModule to read intent.data directly from the Android activity
  useEffect(() => {
    const { IntentDataModule } = NativeModules;

    // Check for intent data (works for both cold-start and warm-start)
    const checkIntentData = async () => {
      try {
        if (!IntentDataModule) {
          console.log('IntentDataModule not available (non-Android or module not registered)');
          return;
        }

        const intentData = await IntentDataModule.getIntentData();
        if (intentData && intentData.uri) {
          const uri = intentData.uri;
          const mimeType = intentData.type || '';

          // Prevent double-processing
          if (lastHandledUrl.current === uri) return;

          // Handle the incoming file URL
          await handleIncomingFileUrl(uri, mimeType);

          // Clear the intent data so it won't be re-processed
          IntentDataModule.clearIntentData();
        }
      } catch (err) {
        console.log('Error reading intent data:', err);
      }
    };

    // Cold start: check on mount with a small delay to let navigation & share-intent settle
    const timer = setTimeout(() => {
      checkIntentData();
    }, 600);

    // Warm start: check whenever app comes to foreground (singleTask onNewIntent updates the intent)
    const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        // Small delay to ensure the new intent is set
        setTimeout(() => {
          checkIntentData();
        }, 300);
      }
    });

    return () => {
      clearTimeout(timer);
      appStateSubscription?.remove();
    };
  }, []);

  const onNavigationReady = () => {
    if (pendingFile.current) {
      const file = pendingFile.current;
      pendingFile.current = null;
      setTimeout(() => {
        navigationRef.current?.navigate('Viewer', { file });
      }, 100);
    }
  };

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <NavigationContainer
        ref={navigationRef}
        onReady={onNavigationReady}
        theme={darkTheme}
      >
        <Stack.Navigator
          initialRouteName="Home"
          screenOptions={{
            headerStyle: {
              backgroundColor: theme.colors.surface,
            },
            headerTintColor: theme.colors.text,
            headerTitleStyle: {
              fontWeight: '600',
            },
            headerShadowVisible: false,
            animation: 'slide_from_right',
            contentStyle: {
              backgroundColor: theme.colors.background,
            },
          }}
        >
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Viewer"
            component={ViewerScreen}
            options={{
              headerBackTitle: 'Back',
              title: '',
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}

export default function App() {
  return (
    <ShareIntentProvider
      options={{
        debug: __DEV__,
        resetOnBackground: true,
      }}
    >
      <HistoryProvider>
        <AppInner />
      </HistoryProvider>
    </ShareIntentProvider>
  );
}
