import React, { useEffect, useRef } from 'react';
import { StatusBar, Linking, Platform, NativeModules } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as FileSystem from 'expo-file-system/legacy';
import ReactNativeBlobUtil from 'react-native-blob-util';
import HomeScreen from './src/screens/HomeScreen';
import ViewerScreen from './src/screens/ViewerScreen';
import { theme } from './src/utils/theme';

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

// Get a real filename for a content:// URI
const resolveContentUri = async (contentUri) => {
  const timestamp = Date.now();

  // First, try to get file info which may include the display name and MIME type
  let displayName = null;
  let mimeType = null;

  try {
    const stat = await ReactNativeBlobUtil.fs.stat(contentUri);
    if (stat && stat.filename) {
      displayName = stat.filename;
    }
  } catch (e) {
    console.log('stat failed:', e.message);
  }

  // Copy content:// to cache — try expo first, fallback to blob-util
  const tempName = displayName || `file_${timestamp}`;
  const destUri = `${FileSystem.cacheDirectory}incoming_${timestamp}_${tempName}`;
  try {
    await FileSystem.copyAsync({ from: contentUri, to: destUri });
  } catch (copyErr) {
    console.log('FileSystem.copyAsync failed, trying blob-util:', copyErr.message);
    const destPath = destUri.replace('file://', '');
    await ReactNativeBlobUtil.fs.cp(contentUri, destPath);
  }

  // If we got a display name with a valid extension, use it
  if (displayName && displayName.includes('.')) {
    return { uri: destUri, name: displayName };
  }

  // Try to detect file type from content
  try {
    const localPath = destUri.replace('file://', '');
    const header = await ReactNativeBlobUtil.fs.readFile(localPath, 'base64');
    const headerStr = atob(header.substring(0, 24));

    if (headerStr.startsWith('%PDF')) {
      return { uri: destUri, name: (displayName || 'document') + '.pdf' };
    }
    if (headerStr.substring(0, 2) === 'PK') {
      // ZIP-based Office file — use JSZip for reliable detection
      const format = await detectOfficeFormat(localPath);
      const nameMap = { pptx: 'presentation', xlsx: 'spreadsheet', docx: 'document', zip: 'archive' };
      return { uri: destUri, name: (displayName || nameMap[format] || 'document') + '.' + format };
    }
    if (headerStr.charCodeAt(0) === 0xD0 && headerStr.charCodeAt(1) === 0xCF) {
      return { uri: destUri, name: (displayName || 'document') + '.doc' };
    }
    if (headerStr.startsWith('\x89PNG')) {
      return { uri: destUri, name: (displayName || 'image') + '.png' };
    }
    if (headerStr.startsWith('\xFF\xD8\xFF')) {
      return { uri: destUri, name: (displayName || 'image') + '.jpg' };
    }
    if (headerStr.startsWith('GIF8')) {
      return { uri: destUri, name: (displayName || 'image') + '.gif' };
    }
  } catch (e) {
    console.log('Header detection failed:', e.message);
  }

  return { uri: destUri, name: displayName || `file_${timestamp}` };
};

export default function App() {
  const navigationRef = useRef(null);
  const pendingFile = useRef(null);

  const navigateToFile = (file) => {
    if (navigationRef.current?.isReady()) {
      navigationRef.current.navigate('Viewer', { file });
    } else {
      pendingFile.current = file;
    }
  };

  const handleIncomingUrl = async (url) => {
    if (!url) return;
    // Skip expo dev client URLs
    if (url.includes('expo-development-client')) return;
    try {
      let fileUri = url;
      let fileName = null;

      if (Platform.OS === 'android' && url.startsWith('content://')) {
        const result = await resolveContentUri(url);
        fileUri = result.uri;
        fileName = result.name;
      } else if (url.startsWith('http://') || url.startsWith('https://')) {
        // Remote URL — pass it through directly, ViewerScreen handles downloading
        fileUri = url;
        const urlPath = url.split('?')[0].split('#')[0];
        fileName = decodeURIComponent(urlPath.split('/').pop() || 'Remote File');
      } else {
        fileName = decodeURIComponent(fileUri.split('/').pop() || 'Unknown');
      }

      navigateToFile({
        uri: fileUri,
        name: fileName,
        openedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.log('Error handling incoming file:', err);
    }
  };

  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (url) handleIncomingUrl(url);
    });

    const subscription = Linking.addEventListener('url', (event) => {
      if (event?.url) handleIncomingUrl(event.url);
    });

    return () => subscription?.remove();
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
