import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform, Alert } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { getFileExtension } from '../utils/fileTypes';

const HISTORY_KEY = '@docview_history_files_v2';
const MAX_HISTORY = 30;
const DOCS_DIR = `${FileSystem.documentDirectory}DocView_Docs/`;

const HistoryContext = createContext();

export function useHistory() {
  return useContext(HistoryContext);
}

export function HistoryProvider({ children }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // Initialize directory and load history
  useEffect(() => {
    const init = async () => {
      try {
        // Ensure permanent directory exists
        const dirInfo = await FileSystem.getInfoAsync(DOCS_DIR);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(DOCS_DIR, { intermediates: true });
        }

        const stored = await AsyncStorage.getItem(HISTORY_KEY);
        if (stored) {
          setHistory(JSON.parse(stored));
        }
      } catch (e) {
        console.log('Error initializing history context:', e);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // Save history helper
  const saveHistoryList = async (list) => {
    try {
      setHistory(list);
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    } catch (e) {
      console.log('Error saving history list:', e);
    }
  };

  // Add/Update file in history
  const addToHistory = async (file) => {
    try {
      if (!file || !file.uri) return null;

      const timestamp = Date.now();
      const ext = getFileExtension(file.name);
      const isRemote = file.uri.startsWith('http://') || file.uri.startsWith('https://');
      
      let finalUri = file.uri;

      // If the file is NOT already in our permanent DocView docs directory, copy it there!
      // This prevents the OS from clearing it from cache (e.g. content:// or picked cache uris)
      if (!isRemote && !file.uri.includes('DocView_Docs/')) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const destPath = `${DOCS_DIR}doc_${timestamp}_${safeName}`;
        
        try {
          if (file.uri.startsWith('file://')) {
            await FileSystem.copyAsync({ from: file.uri, to: destPath });
          } else if (file.uri.startsWith('content://')) {
            // Use react-native-blob-util cp for content resolver reliability
            const destRaw = destPath.replace('file://', '');
            await ReactNativeBlobUtil.fs.cp(file.uri, destRaw);
          } else {
            await FileSystem.copyAsync({ from: file.uri, to: destPath });
          }
          finalUri = destPath;
        } catch (copyErr) {
          console.log('Failed to copy file to permanent storage:', copyErr.message);
          // Fallback to original uri
          finalUri = file.uri;
        }
      }

      const fileEntry = {
        uri: finalUri,
        originalUri: file.uri, // keep original reference if needed
        name: file.name,
        size: file.size || null,
        mimeType: file.mimeType || null,
        openedAt: new Date().toISOString(),
      };

      // Filter out duplicate URIs or matching names
      const filtered = history.filter((item) => item.uri !== finalUri && item.name !== file.name);
      const newList = [fileEntry, ...filtered].slice(0, MAX_HISTORY);
      
      await saveHistoryList(newList);
      return fileEntry;
    } catch (e) {
      console.log('Error adding to history:', e);
      return null;
    }
  };

  // Remove single file from history and disk
  const removeFromHistory = async (uri) => {
    try {
      // If it is stored in our custom folder, delete it from disk
      if (uri.includes('DocView_Docs/')) {
        try {
          await FileSystem.deleteAsync(uri, { idempotent: true });
        } catch (err) {
          console.log('Error deleting file from disk:', err.message);
        }
      }
      const filtered = history.filter((item) => item.uri !== uri);
      await saveHistoryList(filtered);
    } catch (e) {
      console.log('Error removing from history:', e);
    }
  };

  // Clear all history
  const clearHistory = async () => {
    try {
      // Delete all files in VFS directory
      const files = await FileSystem.readDirectoryAsync(DOCS_DIR);
      for (const file of files) {
        try {
          await FileSystem.deleteAsync(`${DOCS_DIR}${file}`, { idempotent: true });
        } catch {}
      }
      await saveHistoryList([]);
    } catch (e) {
      console.log('Error clearing history:', e);
    }
  };

  // Custom "Save As" / Export function
  const saveAs = async (file, customName) => {
    try {
      if (!file || !file.uri) return false;

      const ext = getFileExtension(file.name);
      const cleanCustomName = customName.trim().replace(/[/\\?%*:|"<>]/g, '');
      if (!cleanCustomName) throw new Error('Invalid file name');

      const finalName = ext ? `${cleanCustomName}.${ext}` : cleanCustomName;
      const sourcePath = file.uri.replace('file://', '');

      if (Platform.OS === 'android') {
        const downloadDir = ReactNativeBlobUtil.fs.dirs.DownloadDir;
        const destPath = `${downloadDir}/${finalName}`;

        // Verify source file exists
        const fileExists = await ReactNativeBlobUtil.fs.exists(sourcePath);
        if (!fileExists) {
          throw new Error('Source file no longer exists in cache.');
        }

        // Copy to Downloads directory
        await ReactNativeBlobUtil.fs.cp(sourcePath, destPath);
        
        // Scan the file so it shows up in media store/file explorer immediately
        await ReactNativeBlobUtil.MediaCollection.scanFile(destPath);
        
        Alert.alert(
          'File Saved Successfully',
          `Document saved to your Downloads folder as:\n"${finalName}"`,
          [{ text: 'OK' }]
        );
        return true;
      } else {
        // iOS: Copy to a temporary location with the custom name and trigger Sharing sheet
        // iOS will show "Save to Files" dialog showing the chosen custom name!
        const tempPath = `${FileSystem.cacheDirectory}${finalName}`;
        await FileSystem.copyAsync({ from: file.uri, to: tempPath });

        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(tempPath, {
            dialogTitle: 'Save / Export Document',
            mimeType: file.mimeType,
          });
          // Clean up temp file after share sheet finishes
          setTimeout(() => {
            FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => {});
          }, 10000);
          return true;
        } else {
          throw new Error('Sharing is not available on this device.');
        }
      }
    } catch (err) {
      console.log('Save As error:', err);
      Alert.alert('Save Failed', err.message || 'Could not save the document.');
      return false;
    }
  };

  // Toggle starred status
  const toggleStar = async (uri) => {
    try {
      const newList = history.map((item) => {
        if (item.uri === uri) {
          return { ...item, starred: !item.starred };
        }
        return item;
      });
      await saveHistoryList(newList);
    } catch (e) {
      console.log('Error toggling star:', e);
    }
  };

  return (
    <HistoryContext.Provider
      value={{
        history,
        loading,
        addToHistory,
        removeFromHistory,
        clearHistory,
        saveAs,
        toggleStar,
      }}
    >
      {children}
    </HistoryContext.Provider>
  );
}
