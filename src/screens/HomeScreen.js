import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  StatusBar,
  RefreshControl,
  Alert,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { theme } from '../utils/theme';
import { getFileType, getFileExtension, formatFileSize } from '../utils/fileTypes';
import FileIcon from '../components/FileIcon';

const RECENT_FILES_KEY = '@docview_recent_files';
const MAX_RECENT = 20;

export default function HomeScreen({ navigation }) {
  const [recentFiles, setRecentFiles] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadRecentFiles();
  }, []);

  const loadRecentFiles = async () => {
    try {
      const stored = await AsyncStorage.getItem(RECENT_FILES_KEY);
      if (stored) {
        setRecentFiles(JSON.parse(stored));
      }
    } catch (e) {
      console.log('Error loading recent files:', e);
    }
  };

  const saveRecentFile = async (file) => {
    try {
      const newRecent = [
        file,
        ...recentFiles.filter((f) => f.uri !== file.uri),
      ].slice(0, MAX_RECENT);
      setRecentFiles(newRecent);
      await AsyncStorage.setItem(RECENT_FILES_KEY, JSON.stringify(newRecent));
    } catch (e) {
      console.log('Error saving recent file:', e);
    }
  };

  const clearRecentFiles = async () => {
    Alert.alert('Clear History', 'Remove all recent files?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          setRecentFiles([]);
          await AsyncStorage.removeItem(RECENT_FILES_KEY);
        },
      },
    ]);
  };

  const openFilePicker = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        const fileInfo = {
          uri: file.uri,
          name: file.name,
          size: file.size,
          mimeType: file.mimeType,
          openedAt: new Date().toISOString(),
        };
        await saveRecentFile(fileInfo);
        navigation.navigate('Viewer', { file: fileInfo });
      }
    } catch (err) {
      Alert.alert('Error', 'Could not open file picker');
      console.log('Picker error:', err);
    }
  };

  const openRecentFile = async (file) => {
    const updatedFile = { ...file, openedAt: new Date().toISOString() };
    // Remote URLs and content:// URIs don't need existence checks
    const isRemote = file.uri.startsWith('http://') || file.uri.startsWith('https://');
    const isContent = file.uri.startsWith('content://');
    if (!isRemote && !isContent) {
      try {
        const info = await FileSystem.getInfoAsync(file.uri);
        if (!info.exists) {
          Alert.alert('File Not Found', 'This file has been moved or deleted.', [
            { text: 'OK' },
            {
              text: 'Remove from History',
              style: 'destructive',
              onPress: async () => {
                const filtered = recentFiles.filter((f) => f.uri !== file.uri);
                setRecentFiles(filtered);
                await AsyncStorage.setItem(RECENT_FILES_KEY, JSON.stringify(filtered));
              },
            },
          ]);
          return;
        }
      } catch {}
    }
    saveRecentFile(updatedFile);
    navigation.navigate('Viewer', { file: updatedFile });
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadRecentFiles();
    setRefreshing(false);
  }, []);

  const renderRecentFile = ({ item }) => {
    const fileType = getFileType(item.name);
    const timeAgo = getTimeAgo(item.openedAt);

    return (
      <TouchableOpacity style={styles.fileItem} onPress={() => openRecentFile(item)} activeOpacity={0.6}>
        <FileIcon filename={item.name} size={48} />
        <View style={styles.fileInfo}>
          <Text style={styles.fileName} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.fileMeta}>
            <View style={[styles.typeBadge, { backgroundColor: fileType.color + '20' }]}>
              <Text style={[styles.typeText, { color: fileType.color }]}>{fileType.label}</Text>
            </View>
            {item.size && <Text style={styles.fileSize}>{formatFileSize(item.size)}</Text>}
            <Text style={styles.fileTime}>{timeAgo}</Text>
          </View>
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.appName}>DocView</Text>
          <Text style={styles.subtitle}>Open any file, anywhere</Text>
        </View>
      </View>

      {/* Open File Button */}
      <TouchableOpacity style={styles.openButton} onPress={openFilePicker} activeOpacity={0.7}>
        <View style={styles.openButtonInner}>
          <Text style={styles.openButtonIcon}>+</Text>
          <View>
            <Text style={styles.openButtonText}>Open File</Text>
            <Text style={styles.openButtonHint}>Browse your device</Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Supported formats hint */}
      <View style={styles.formatsRow}>
        {['PDF', 'DOCX', 'XLSX', 'PPTX', 'JSON', 'MD', 'IMG'].map((fmt) => (
          <View key={fmt} style={styles.formatChip}>
            <Text style={styles.formatChipText}>{fmt}</Text>
          </View>
        ))}
        <View style={styles.formatChip}>
          <Text style={styles.formatChipText}>+20</Text>
        </View>
      </View>

      {/* Recent Files */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Files</Text>
        {recentFiles.length > 0 && (
          <TouchableOpacity onPress={clearRecentFiles}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {recentFiles.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📂</Text>
          <Text style={styles.emptyTitle}>No recent files</Text>
          <Text style={styles.emptySubtitle}>
            Open a file or use "Open With" from any app
          </Text>
        </View>
      ) : (
        <FlatList
          data={recentFiles}
          renderItem={renderRecentFile}
          keyExtractor={(item, index) => `${item.uri}-${index}`}
          style={styles.fileList}
          contentContainerStyle={styles.fileListContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

function getTimeAgo(dateString) {
  if (!dateString) return '';
  const now = new Date();
  const date = new Date(dateString);
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xxl + 10,
    paddingBottom: theme.spacing.md,
  },
  appName: {
    fontSize: theme.fontSize.hero,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  openButton: {
    marginHorizontal: theme.spacing.lg,
    marginVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
  },
  openButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    gap: 16,
  },
  openButtonIcon: {
    fontSize: 32,
    fontWeight: '300',
    color: '#FFFFFF',
    width: 48,
    height: 48,
    lineHeight: 48,
    textAlign: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 14,
    overflow: 'hidden',
  },
  openButtonText: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  openButtonHint: {
    fontSize: theme.fontSize.sm,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 1,
  },
  formatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: theme.spacing.lg,
    gap: 6,
    marginBottom: theme.spacing.lg,
  },
  formatChip: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  formatChipText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  sectionTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.text,
  },
  clearText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.accent,
    fontWeight: '600',
  },
  fileList: {
    flex: 1,
  },
  fileListContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  fileInfo: {
    flex: 1,
    marginLeft: theme.spacing.md,
  },
  fileName: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 4,
  },
  fileMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  fileSize: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textMuted,
  },
  fileTime: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textMuted,
  },
  chevron: {
    fontSize: 24,
    color: theme.colors.textMuted,
    marginLeft: theme.spacing.sm,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: theme.spacing.xxl,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: theme.spacing.md,
  },
  emptyTitle: {
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  emptySubtitle: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
});
