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
    console.log('[DocView] navigateToFile called:', JSON.stringify({ name: file.name, uri: file.uri?.substring(0, 80) }));
    if (navigationRef.current?.isReady()) {
      console.log('[DocView] Navigation is ready → navigating to Viewer');
      navigationRef.current.navigate('Viewer', { file });
    } else {
      console.log('[DocView] Navigation NOT ready → queuing as pendingFile');
      pendingFile.current = file;
    }
  };

  // Handle a file URI from ACTION_VIEW intent ("Open with" from file managers, WhatsApp, etc.)
  const handleIncomingFileUrl = async (url, mimeType) => {
    console.log('[DocView] handleIncomingFileUrl called with:', { url: url?.substring(0, 100), mimeType });

    if (!url) {
      console.log('[DocView] ❌ URL is null/empty, skipping');
      return;
    }

    // Skip our own scheme URLs (deep links, not file intents)
    if (url.startsWith('docview://') || url.startsWith('exp+docview://')) {
      console.log('[DocView] ❌ Skipping own scheme URL:', url.substring(0, 50));
      return;
    }

    // Only handle file:// and content:// URIs (these are actual file intents)
    if (!url.startsWith('file://') && !url.startsWith('content://')) {
      console.log('[DocView] ❌ Not a file/content URI, skipping. Scheme:', url.split('://')[0]);
      return;
    }

    // Prevent double-processing the same URL
    if (lastHandledUrl.current === url) {
      console.log('[DocView] ❌ Already handled this URL, skipping (dedup)');
      return;
    }
    lastHandledUrl.current = url;
    console.log('[DocView] ✅ Proceeding to handle file URI');

    try {
      // Try to extract a filename from the URI path
      let fileName = null;
      try {
        const pathSegments = url.split('/');
        const lastSegment = pathSegments.pop() || '';
        const decoded = decodeURIComponent(lastSegment);
        if (decoded && decoded.length > 0 && !decoded.startsWith('?')) {
          fileName = decoded;
        }
        console.log('[DocView] Extracted filename from URI:', fileName);
      } catch (e) {
        console.log('[DocView] Could not extract filename from URI:', e.message);
      }

      // If no good filename, use a generic one
      if (!fileName || fileName.length === 0) {
        fileName = 'Opened File';
        console.log('[DocView] No filename found, using generic:', fileName);
      }

      // If no extension in the filename, try to add one from the MIME type
      if (!fileName.includes('.') && mimeType && mimeToExt[mimeType]) {
        fileName = fileName + '.' + mimeToExt[mimeType];
        console.log('[DocView] Added extension from MIME type:', fileName);
      }

      console.log('[DocView] Resolving file for viewer... (fileName=' + fileName + ')');
      // Resolve the file (copy from content:// if needed, detect type from content)
      const resolved = await resolveFileForViewer(url, fileName);
      console.log('[DocView] ✅ Resolved:', JSON.stringify({ uri: resolved.uri?.substring(0, 80), name: resolved.name }));

      navigateToFile({
        uri: resolved.uri,
        name: resolved.name,
        openedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.log('[DocView] ❌ Error handling incoming file URL:', err.message, err);
    }
  };

  // Handle share intent from WhatsApp / file managers / other apps (ACTION_SEND)
  useEffect(() => {
    console.log('[DocView] Share intent check: hasShareIntent=' + hasShareIntent + ', shareIntent=' + (shareIntent ? 'present' : 'null'));
    if (!hasShareIntent || !shareIntent) return;

    const processShareIntent = async () => {
      try {
        console.log('[DocView] Processing share intent:', JSON.stringify(shareIntent).substring(0, 200));
        const files = shareIntent.files;
        if (files && files.length > 0) {
          const sharedFile = files[0];
          const fileUri = sharedFile.path || sharedFile.uri;
          const fileName = sharedFile.fileName || sharedFile.name;
          const mimeType = sharedFile.mimeType || sharedFile.type;
          console.log('[DocView] Share intent file:', { fileUri: fileUri?.substring(0, 80), fileName, mimeType });

          if (fileUri) {
            let resolvedName = fileName;

            if (!resolvedName) {
              resolvedName = decodeURIComponent(fileUri.split('/').pop() || 'Shared File');
            }

            if (resolvedName && !resolvedName.includes('.') && mimeType && mimeToExt[mimeType]) {
              resolvedName = resolvedName + '.' + mimeToExt[mimeType];
            }

            lastHandledUrl.current = fileUri;

            const resolved = await resolveFileForViewer(fileUri, resolvedName);
            console.log('[DocView] ✅ Share intent resolved:', resolved.name);

            navigateToFile({
              uri: resolved.uri,
              name: resolved.name,
              openedAt: new Date().toISOString(),
            });
          }
        } else if (shareIntent.text) {
          console.log('[DocView] Share intent is text:', shareIntent.text?.substring(0, 50));
          navigateToFile({
            uri: shareIntent.text,
            name: 'Shared Text.txt',
            openedAt: new Date().toISOString(),
          });
        } else {
          console.log('[DocView] ❌ Share intent has no files and no text');
        }
      } catch (err) {
        console.log('[DocView] ❌ Error processing share intent:', err.message, err);
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
    console.log('[DocView] IntentDataModule available:', !!IntentDataModule);

    // Check for intent data (works for both cold-start and warm-start)
    const checkIntentData = async (trigger) => {
      try {
        if (!IntentDataModule) {
          console.log('[DocView] ❌ IntentDataModule is NOT available in NativeModules');
          console.log('[DocView] Available NativeModules:', Object.keys(NativeModules).join(', '));
          return;
        }

        console.log('[DocView] Calling IntentDataModule.getIntentData() (trigger: ' + trigger + ')...');
        const intentData = await IntentDataModule.getIntentData();
        console.log('[DocView] IntentDataModule result:', intentData ? JSON.stringify(intentData) : 'null');

        if (intentData && intentData.uri) {
          const uri = intentData.uri;
          const mimeType = intentData.type || '';
          console.log('[DocView] ✅ Got intent data: uri=' + uri.substring(0, 80) + ', type=' + mimeType);

          // Prevent double-processing
          if (lastHandledUrl.current === uri) {
            console.log('[DocView] ❌ Already handled this URI (dedup), skipping');
            return;
          }

          // Handle the incoming file URL
          await handleIncomingFileUrl(uri, mimeType);

          // Clear the intent data so it won't be re-processed
          IntentDataModule.clearIntentData();
          console.log('[DocView] Intent data cleared after handling');
        } else {
          console.log('[DocView] No intent data found (normal app launch or already cleared)');
        }
      } catch (err) {
        console.log('[DocView] ❌ Error reading intent data:', err.message, err);
      }
    };

    // Cold start: check on mount with a small delay to let navigation & share-intent settle
    console.log('[DocView] Setting up cold-start intent check (600ms delay)...');
    const timer = setTimeout(() => {
      checkIntentData('cold-start');
    }, 600);

    // Warm start: check whenever app comes to foreground (singleTask onNewIntent updates the intent)
    const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      console.log('[DocView] AppState changed to:', nextAppState);
      if (nextAppState === 'active') {
        setTimeout(() => {
          checkIntentData('warm-start-appstate');
        }, 300);
      }
    });

    return () => {
      clearTimeout(timer);
      appStateSubscription?.remove();
    };
  }, []);

  const onNavigationReady = () => {
    console.log('[DocView] onNavigationReady fired, pendingFile:', pendingFile.current ? pendingFile.current.name : 'none');
    if (pendingFile.current) {
      const file = pendingFile.current;
      pendingFile.current = null;
      console.log('[DocView] ✅ Processing pending file:', file.name);
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
