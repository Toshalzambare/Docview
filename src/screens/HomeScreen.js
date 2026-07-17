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
  TextInput,
  Modal,
  ScrollView,
  Dimensions,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useHistory } from '../contexts/HistoryContext';
import { theme } from '../utils/theme';
import { getFileType, getFileExtension, formatFileSize } from '../utils/fileTypes';
import FileIcon from '../components/FileIcon';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function HomeScreen({ navigation }) {
  const { history, loading, addToHistory, removeFromHistory, clearHistory, saveAs, toggleStar } = useHistory();
  
  // Navigation & Search State
  const [activeTab, setActiveTab] = useState('home'); // 'home', 'files', 'starred', 'info'
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all'); // 'all', 'pdf', 'document', 'spreadsheet', 'presentation', 'image', 'code'
  
  // UI State
  const [refreshing, setRefreshing] = useState(false);
  const [isGridView, setIsGridView] = useState(false);
  const [sortBy, setSortBy] = useState('date'); // 'name', 'date', 'size'
  
  // Bottom Sheet File Menu State
  const [selectedFile, setSelectedFile] = useState(null);
  const [isFileMenuVisible, setIsFileMenuVisible] = useState(false);
  
  // Save As Modal State
  const [isSaveAsVisible, setIsSaveAsVisible] = useState(false);
  const [customSaveName, setCustomSaveName] = useState('');
  
  // Web URL Import Modal State
  const [isUrlModalVisible, setIsUrlModalVisible] = useState(false);
  const [webImportUrl, setWebImportUrl] = useState('');

  // Info Modal State
  const [isUsageModalVisible, setIsUsageModalVisible] = useState(false);

  // Trigger refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // VFS items reload dynamically from context hooks
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  // Launch File Picker
  const openFilePicker = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const pickedFile = result.assets[0];
        const newFile = await addToHistory({
          uri: pickedFile.uri,
          name: pickedFile.name,
          size: pickedFile.size,
          mimeType: pickedFile.mimeType,
        });

        if (newFile) {
          navigation.navigate('Viewer', { file: newFile });
        }
      }
    } catch (err) {
      Alert.alert('Error', 'Could not open file picker');
      console.log('Picker error:', err);
    }
  };

  // Launch Web URL Loader
  const handleWebImport = async () => {
    const url = webImportUrl.trim();
    if (!url) return;

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      Alert.alert('Invalid URL', 'Please enter a valid URL starting with http:// or https://');
      return;
    }

    setIsUrlModalVisible(false);
    setWebImportUrl('');

    // Deduce filename
    const cleanUrl = url.split('?')[0].split('#')[0];
    const name = decodeURIComponent(cleanUrl.split('/').pop() || 'Remote Document');

    const newFile = await addToHistory({
      uri: url,
      name: name,
      size: null,
      mimeType: null,
    });

    if (newFile) {
      navigation.navigate('Viewer', { file: newFile });
    }
  };

  // Trigger "Save As" rename flow
  const triggerSaveAs = () => {
    if (!selectedFile) return;
    const baseName = selectedFile.name.replace(/\.[^/.]+$/, ""); // strip extension
    setCustomSaveName(baseName);
    setIsFileMenuVisible(false);
    setIsSaveAsVisible(true);
  };

  const handleSaveAsSubmit = async () => {
    if (!selectedFile || !customSaveName.trim()) return;
    setIsSaveAsVisible(false);
    await saveAs(selectedFile, customSaveName.trim());
    setSelectedFile(null);
  };

  // Handle document sharing
  const handleShare = async (file) => {
    setIsFileMenuVisible(false);
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.uri);
      } else {
        Alert.alert('Error', 'Sharing is not supported on this device.');
      }
    } catch (e) {
      console.log('Sharing error:', e);
    }
  };

  // Render quick Category filter chips
  const renderCategoryChips = () => {
    const categories = [
      { id: 'all', label: 'All' },
      { id: 'pdf', label: 'PDFs' },
      { id: 'document', label: 'Docs' },
      { id: 'spreadsheet', label: 'Sheets' },
      { id: 'presentation', label: 'Slides' },
      { id: 'image', label: 'Images' },
      { id: 'code', label: 'Code' },
    ];

    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chipsContent}>
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            style={[
              styles.chip,
              categoryFilter === cat.id && styles.chipActive,
            ]}
            onPress={() => setCategoryFilter(cat.id)}
          >
            <Text
              style={[
                styles.chipText,
                categoryFilter === cat.id && styles.chipTextActive,
              ]}
            >
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  // Filter & Sort History items
  const getProcessedItems = () => {
    let items = [...history];

    // 1. Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter((f) => f.name.toLowerCase().includes(q));
    }

    // 2. Category Filter
    if (categoryFilter !== 'all') {
      items = items.filter((f) => getFileType(f.name).category === categoryFilter);
    }

    // 3. Tab Context Filter
    if (activeTab === 'starred') {
      items = items.filter((f) => f.starred);
    }

    // 4. Sort (Used in Files tab)
    if (activeTab === 'files') {
      items.sort((a, b) => {
        if (sortBy === 'name') {
          return a.name.localeCompare(b.name);
        } else if (sortBy === 'size') {
          return (b.size || 0) - (a.size || 0);
        } else {
          // date
          return new Date(b.openedAt) - new Date(a.openedAt);
        }
      });
    }

    return items;
  };

  const processedItems = getProcessedItems();

  // Render individual file list row or grid card
  const renderFileItem = ({ item }) => {
    const fileType = getFileType(item.name);
    const timeAgo = getTimeAgo(item.openedAt);

    if (isGridView && activeTab === 'files') {
      // Grid style card
      return (
        <TouchableOpacity
          style={styles.gridCard}
          onPress={() => navigation.navigate('Viewer', { file: item })}
          activeOpacity={0.7}
        >
          <View style={styles.gridIconContainer}>
            <FileIcon filename={item.name} size={64} uri={item.uri} />
            {item.starred && (
              <View style={styles.starredPin}>
                <Text style={styles.starredPinText}>⭐</Text>
              </View>
            )}
          </View>
          <View style={styles.gridCardInfo}>
            <Text style={styles.gridCardName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.gridCardMeta} numberOfLines={1}>
              {fileType.label} {item.size ? `• ${formatFileSize(item.size)}` : ''}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.gridCardMenu}
            onPress={() => {
              setSelectedFile(item);
              setIsFileMenuVisible(true);
            }}
          >
            <Text style={styles.threeDotsText}>⋮</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      );
    }

    // Standard list row layout (used in Home and List Files)
    return (
      <TouchableOpacity
        style={styles.listRow}
        onPress={() => navigation.navigate('Viewer', { file: item })}
        activeOpacity={0.7}
      >
        <FileIcon filename={item.name} size={42} uri={item.uri} />
        <View style={styles.listRowInfo}>
          <Text style={styles.listRowName} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.listRowMeta}>
            {item.starred && <Text style={styles.starredIndicator}>⭐</Text>}
            <Text style={styles.listRowMetaText}>
              {fileType.label} • {item.size ? formatFileSize(item.size) : 'Unknown size'} • {timeAgo}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.listRowMenu}
          onPress={() => {
            setSelectedFile(item);
            setIsFileMenuVisible(true);
          }}
        >
          <Text style={styles.threeDotsText}>⋮</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  // Render storage and metadata info statistics
  const renderInfoTab = () => {
    const totalFiles = history.length;
    const starredFiles = history.filter(f => f.starred).length;
    
    // Group sizes by category
    const stats = history.reduce(
      (acc, file) => {
        const cat = getFileType(file.name).category;
        acc[cat] = (acc[cat] || 0) + 1;
        if (file.size) acc.totalSize += file.size;
        return acc;
      },
      { pdf: 0, document: 0, spreadsheet: 0, presentation: 0, image: 0, code: 0, unknown: 0, totalSize: 0 }
    );

    return (
      <ScrollView style={styles.infoScroll} contentContainerStyle={styles.infoContent}>
        {/* Storage Meter Circle Card */}
        <View style={styles.usageCard}>
          <Text style={styles.usageTitle}>Storage Cleanliness</Text>
          <Text style={styles.usageSize}>{formatFileSize(stats.totalSize)} Used</Text>
          <Text style={styles.usageSubtitle}>History database limit capped at 30 items</Text>
          
          <View style={styles.usageProgressBg}>
            <View style={[styles.usageProgressFill, { width: `${Math.min(100, (totalFiles / 30) * 100)}%` }]} />
          </View>
          <Text style={styles.usageRatioText}>{totalFiles} of 30 files registered</Text>
        </View>

        {/* Categories statistics list */}
        <Text style={styles.infoSectionHeader}>File Breakdown</Text>
        <View style={styles.statsList}>
          {[
            { label: 'PDF Documents', count: stats.pdf, icon: '📄', color: '#EA4335' },
            { label: 'Word Documents', count: stats.document, icon: '📝', color: '#4285F4' },
            { label: 'Spreadsheets', count: stats.spreadsheet, icon: '📊', color: '#0F9D58' },
            { label: 'Presentations', count: stats.presentation, icon: '📽️', color: '#F4B400' },
            { label: 'Images', count: stats.image, icon: '🖼️', color: '#3F51B5' },
            { label: 'Code & Script Files', count: stats.code, icon: '{ }', color: '#8E918F' },
          ].map((stat, i) => (
            <View key={i} style={styles.statRow}>
              <Text style={[styles.statIcon, { color: stat.color }]}>{stat.icon}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
              <Text style={styles.statCount}>{stat.count}</Text>
            </View>
          ))}
        </View>

        {/* Clear buttons and settings actions */}
        <Text style={styles.infoSectionHeader}>Actions</Text>
        <TouchableOpacity
          style={styles.actionRow}
          onPress={() => {
            Alert.alert('Clear Cache', 'Remove all recently viewed documents from persistent cache? This cannot be undone.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Clear All',
                style: 'destructive',
                onPress: async () => {
                  await clearHistory();
                  Alert.alert('Success', 'Viewer cache cleared.');
                },
              },
            ]);
          }}
        >
          <Text style={styles.actionRowIcon}>🗑️</Text>
          <View style={styles.actionRowTexts}>
            <Text style={styles.actionRowTitle}>Wipe View Cache</Text>
            <Text style={styles.actionRowSubtitle}>Deletes all local document files from device</Text>
          </View>
        </TouchableOpacity>
        
        <View style={styles.appCreditsCard}>
          <Text style={styles.creditsText}>DocView App v2.0</Text>
          <Text style={styles.creditsSub}>Premium document viewing clone with direct sharing and custom save capability</Text>
        </View>
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />

      {/* Floating Google Drive-style Top Search Bar */}
      <View style={styles.searchBarWrapper}>
        <View style={styles.searchBar}>
          <TouchableOpacity onPress={() => setIsUsageModalVisible(true)} style={styles.searchIconContainer}>
            <Text style={styles.menuIcon}>☰</Text>
          </TouchableOpacity>
          
          <TextInput
            style={styles.searchInput}
            placeholder="Search viewed files..."
            placeholderTextColor={theme.colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          
          <TouchableOpacity onPress={() => setIsUsageModalVisible(true)} style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>U</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Category filter chips */}
      {renderCategoryChips()}

      {/* Primary tab views body switcher */}
      {activeTab === 'info' ? (
        renderInfoTab()
      ) : (
        <View style={styles.listContainer}>
          {/* Section Headers with Grid/List/Sort controllers (Files view context) */}
          {activeTab === 'files' && (
            <View style={styles.controllersHeader}>
              <View style={styles.sortOptions}>
                {['date', 'name', 'size'].map((sort) => (
                  <TouchableOpacity
                    key={sort}
                    onPress={() => setSortBy(sort)}
                    style={[styles.sortButton, sortBy === sort && styles.sortButtonActive]}
                  >
                    <Text style={[styles.sortButtonText, sortBy === sort && styles.sortButtonTextActive]}>
                      {sort.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity onPress={() => setIsGridView(!isGridView)} style={styles.gridToggle}>
                <Text style={styles.gridToggleText}>{isGridView ? '🟰 List' : '🔳 Grid'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {processedItems.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📂</Text>
              <Text style={styles.emptyTitle}>
                {searchQuery ? 'No search results' : activeTab === 'starred' ? 'No starred files' : 'No history yet'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery
                  ? 'Try searching for another query or keyword'
                  : activeTab === 'starred'
                  ? 'Tap the three-dots next to a file to mark it as starred'
                  : 'Import a file using the + button below'}
              </Text>
            </View>
          ) : (
            <FlatList
              key={isGridView && activeTab === 'files' ? 'grid' : 'list'}
              data={processedItems}
              renderItem={renderFileItem}
              keyExtractor={(item) => item.uri}
              numColumns={isGridView && activeTab === 'files' ? 2 : 1}
              contentContainerStyle={[
                styles.listContent,
                isGridView && activeTab === 'files' && styles.gridListContent
              ]}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />
              }
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      )}

      {/* Floating Action Button (FAB) */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          Alert.alert('Import File', 'Choose document import source:', [
            { text: 'Browse Device Files', onPress: openFilePicker },
            { text: 'Open from Web URL', onPress: () => setIsUrlModalVisible(true) },
            { text: 'Cancel', style: 'cancel' },
          ]);
        }}
        activeOpacity={0.8}
      >
        <Text style={styles.fabPlus}>+</Text>
      </TouchableOpacity>

      {/* Bottom Navigation Bar */}
      <View style={styles.bottomNav}>
        {[
          { id: 'home', label: 'Home', icon: '🏠' },
          { id: 'files', label: 'Files', icon: '📁' },
          { id: 'starred', label: 'Starred', icon: '⭐' },
          { id: 'info', label: 'Info', icon: 'ℹ️' },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={styles.navTab}
            onPress={() => setActiveTab(tab.id)}
          >
            <Text style={[styles.navTabIcon, activeTab === tab.id && styles.navTabActive]}>
              {tab.icon}
            </Text>
            <Text style={[styles.navTabLabel, activeTab === tab.id && styles.navTabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ================= MODALS & OVERLAYS ================= */}

      {/* 1. Bottom Sheet File Action Menu */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isFileMenuVisible}
        onRequestClose={() => setIsFileMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsFileMenuVisible(false)}
        >
          <View style={styles.bottomSheet}>
            <View style={styles.bottomSheetHandle} />
            {selectedFile && (
              <>
                {/* Header info */}
                <View style={styles.sheetHeader}>
                  <FileIcon filename={selectedFile.name} size={44} uri={selectedFile.uri} />
                  <View style={styles.sheetHeaderTexts}>
                    <Text style={styles.sheetFileName} numberOfLines={1}>{selectedFile.name}</Text>
                    <Text style={styles.sheetFileMeta}>
                      {getFileType(selectedFile.name).label}
                      {selectedFile.size ? ` • ${formatFileSize(selectedFile.size)}` : ''}
                    </Text>
                  </View>
                </View>
                
                <View style={styles.sheetDivider} />

                {/* Options List */}
                <TouchableOpacity
                  style={styles.sheetRow}
                  onPress={() => {
                    setIsFileMenuVisible(false);
                    navigation.navigate('Viewer', { file: selectedFile });
                  }}
                >
                  <Text style={styles.sheetRowIcon}>👁️</Text>
                  <Text style={styles.sheetRowLabel}>Open Document</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.sheetRow}
                  onPress={async () => {
                    setIsFileMenuVisible(false);
                    await toggleStar(selectedFile.uri);
                  }}
                >
                  <Text style={styles.sheetRowIcon}>⭐</Text>
                  <Text style={styles.sheetRowLabel}>
                    {selectedFile.starred ? 'Remove from Starred' : 'Star/Favorite File'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.sheetRow} onPress={triggerSaveAs}>
                  <Text style={styles.sheetRowIcon}>💾</Text>
                  <Text style={styles.sheetRowLabel}>Save As (Custom Name)</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.sheetRow} onPress={() => handleShare(selectedFile)}>
                  <Text style={styles.sheetRowIcon}>📤</Text>
                  <Text style={styles.sheetRowLabel}>Share to other apps (WhatsApp, etc.)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.sheetRow, styles.sheetDeleteRow]}
                  onPress={() => {
                    setIsFileMenuVisible(false);
                    Alert.alert('Remove File', 'Delete this file from cache and history?', [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Remove',
                        style: 'destructive',
                        onPress: async () => {
                          await removeFromHistory(selectedFile.uri);
                          setSelectedFile(null);
                        },
                      },
                    ]);
                  }}
                >
                  <Text style={[styles.sheetRowIcon, styles.deleteColor]}>🗑️</Text>
                  <Text style={[styles.sheetRowLabel, styles.deleteColor]}>Remove from View Cache</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 2. Custom Rename / Save As Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isSaveAsVisible}
        onRequestClose={() => setIsSaveAsVisible(false)}
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
                onPress={() => {
                  setIsSaveAsVisible(false);
                  setSelectedFile(null);
                }}
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

      {/* 3. Open Web URL Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isUrlModalVisible}
        onRequestClose={() => setIsUrlModalVisible(false)}
      >
        <View style={styles.modalCentered}>
          <View style={styles.dialogCard}>
            <Text style={styles.dialogTitle}>Open from Web URL</Text>
            <Text style={styles.dialogSubtitle}>Enter document URL link (PDF, XLSX, etc.):</Text>
            
            <TextInput
              style={styles.dialogInput}
              value={webImportUrl}
              onChangeText={setWebImportUrl}
              autoFocus={true}
              keyboardType="url"
              placeholder="https://example.com/file.pdf"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.dialogButtons}>
              <TouchableOpacity
                style={styles.dialogBtnCancel}
                onPress={() => {
                  setIsUrlModalVisible(false);
                  setWebImportUrl('');
                }}
              >
                <Text style={styles.dialogBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dialogBtnSubmit}
                onPress={handleWebImport}
              >
                <Text style={styles.dialogBtnSubmitText}>Load URL</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 4. Side Info/Profile Storage Drawer Info Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isUsageModalVisible}
        onRequestClose={() => setIsUsageModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsUsageModalVisible(false)}
        >
          <View style={styles.modalCentered} pointerEvents="none">
            <View style={[styles.dialogCard, { pointerEvents: 'auto' }]}>
              <View style={styles.avatarLarge}>
                <Text style={styles.avatarLargeText}>U</Text>
              </View>
              <Text style={styles.profileName}>DocView User Account</Text>
              <Text style={styles.profileEmail}>offline-sharing@docview.local</Text>
              
              <View style={styles.sheetDivider} />
              
              <Text style={styles.storageMeterTitle}>App Local Storage Usage</Text>
              <Text style={styles.storageMeterText}>
                Total cache slots: {history.length} / 30 slots used
              </Text>
              <Text style={styles.storageDetailInfo}>
                Documents are saved permanently inside your app documents folder. Delete files from history to free space.
              </Text>

              <TouchableOpacity
                style={styles.profileCloseBtn}
                onPress={() => setIsUsageModalVisible(false)}
              >
                <Text style={styles.profileCloseText}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
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
  searchBarWrapper: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xxl + 10,
    paddingBottom: theme.spacing.xs,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs + 2,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchIconContainer: {
    paddingRight: theme.spacing.sm,
  },
  menuIcon: {
    fontSize: 20,
    color: theme.colors.textMuted,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
  },
  profileAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0F9D58',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: theme.spacing.xs,
  },
  profileAvatarText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  chipsScroll: {
    maxHeight: 46,
    flexGrow: 0,
    marginVertical: theme.spacing.sm,
  },
  chipsContent: {
    paddingHorizontal: theme.spacing.md,
    gap: 8,
  },
  chip: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipActive: {
    backgroundColor: 'rgba(138, 180, 248, 0.15)',
    borderColor: theme.colors.accent,
  },
  chipText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  chipTextActive: {
    color: theme.colors.accent,
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: 100,
  },
  gridListContent: {
    paddingHorizontal: theme.spacing.sm,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border + '50',
  },
  listRowInfo: {
    flex: 1,
    marginLeft: theme.spacing.md,
  },
  listRowName: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 4,
  },
  listRowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  starredIndicator: {
    fontSize: 10,
  },
  listRowMetaText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textMuted,
  },
  listRowMenu: {
    padding: theme.spacing.sm,
  },
  threeDotsText: {
    fontSize: 20,
    color: theme.colors.textMuted,
    fontWeight: '700',
  },
  controllersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  sortOptions: {
    flexDirection: 'row',
    gap: 6,
  },
  sortButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: theme.colors.surface,
  },
  sortButtonActive: {
    backgroundColor: theme.colors.accent + '20',
  },
  sortButtonText: {
    fontSize: 10,
    color: theme.colors.textMuted,
    fontWeight: '700',
  },
  sortButtonTextActive: {
    color: theme.colors.accent,
  },
  gridToggle: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  gridToggleText: {
    fontSize: 12,
    color: theme.colors.accent,
    fontWeight: '600',
  },
  gridCard: {
    width: (SCREEN_WIDTH - 32) / 2,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginHorizontal: 4,
    marginBottom: 10,
    position: 'relative',
  },
  gridIconContainer: {
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  starredPin: {
    position: 'absolute',
    top: 0,
    right: 15,
  },
  starredPinText: {
    fontSize: 12,
  },
  gridCardInfo: {
    marginTop: theme.spacing.sm,
  },
  gridCardName: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  gridCardMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    textAlign: 'center',
    marginTop: 2,
  },
  gridCardMenu: {
    position: 'absolute',
    top: 6,
    right: 10,
    padding: 4,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: 80,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: theme.spacing.md,
  },
  emptyTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  emptySubtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 86,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  fabPlus: {
    fontSize: 32,
    color: '#4285F4', // Google standard blue
    fontWeight: '300',
    lineHeight: 36,
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 64,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  navTab: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    height: '100%',
  },
  navTabIcon: {
    fontSize: 20,
    color: theme.colors.textMuted,
  },
  navTabActive: {
    color: theme.colors.accent,
    transform: [{ scale: 1.15 }],
  },
  navTabLabel: {
    fontSize: theme.fontSize.xs - 1,
    color: theme.colors.textMuted,
    marginTop: 2,
    fontWeight: '600',
  },
  navTabLabelActive: {
    color: theme.colors.accent,
    fontWeight: '700',
  },
  // Modal Overlays
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: theme.colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: theme.spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: theme.spacing.md,
  },
  sheetHeaderTexts: {
    flex: 1,
    marginLeft: theme.spacing.md,
  },
  sheetFileName: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontWeight: '700',
  },
  sheetFileMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    marginTop: 2,
  },
  sheetDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.sm,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md - 2,
  },
  sheetRowIcon: {
    fontSize: 18,
    color: theme.colors.textSecondary,
    width: 32,
  },
  sheetRowLabel: {
    fontSize: theme.fontSize.md - 1,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  sheetDeleteRow: {
    marginTop: theme.spacing.xs,
  },
  deleteColor: {
    color: '#F2B8B5',
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
  // Profile Stats Modal styles
  avatarLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#0F9D58',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
  },
  avatarLargeText: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: '800',
  },
  profileName: {
    fontSize: theme.fontSize.md + 1,
    fontWeight: '800',
    color: theme.colors.text,
  },
  profileEmail: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.sm,
  },
  storageMeterTitle: {
    fontSize: theme.fontSize.sm + 1,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    width: '100%',
    textAlign: 'left',
    marginTop: theme.spacing.sm,
  },
  storageMeterText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textMuted,
    width: '100%',
    textAlign: 'left',
    marginTop: 4,
    marginBottom: theme.spacing.md,
  },
  storageDetailInfo: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textMuted,
    lineHeight: 16,
    textAlign: 'left',
    width: '100%',
  },
  profileCloseBtn: {
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.surfaceLight,
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.sm,
    width: '100%',
    alignItems: 'center',
  },
  profileCloseText: {
    color: theme.colors.text,
    fontWeight: '700',
  },
  // Info Scroll tab
  infoScroll: {
    flex: 1,
  },
  infoContent: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: 100,
  },
  usageCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginVertical: theme.spacing.md,
  },
  usageTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontWeight: '700',
  },
  usageSize: {
    fontSize: theme.fontSize.xl,
    color: theme.colors.accent,
    fontWeight: '800',
    marginTop: 4,
  },
  usageSubtitle: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  usageProgressBg: {
    height: 6,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: 3,
    marginTop: theme.spacing.md,
    overflow: 'hidden',
  },
  usageProgressFill: {
    height: '100%',
    backgroundColor: theme.colors.accent,
    borderRadius: 3,
  },
  usageRatioText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    marginTop: theme.spacing.xs,
    textAlign: 'right',
  },
  infoSectionHeader: {
    fontSize: theme.fontSize.sm + 1,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statsList: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing.xs,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border + '30',
  },
  statIcon: {
    fontSize: 16,
    width: 28,
  },
  statLabel: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm + 1,
    fontWeight: '600',
  },
  statCount: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm + 1,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  actionRowIcon: {
    fontSize: 22,
    width: 36,
  },
  actionRowTexts: {
    flex: 1,
  },
  actionRowTitle: {
    color: '#F2B8B5', // soft error/delete color
    fontWeight: '700',
    fontSize: theme.fontSize.md - 1,
  },
  actionRowSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    marginTop: 2,
  },
  appCreditsCard: {
    alignItems: 'center',
    marginVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.md,
  },
  creditsText: {
    color: theme.colors.textMuted,
    fontWeight: '700',
    fontSize: theme.fontSize.sm,
  },
  creditsSub: {
    color: theme.colors.textMuted + '80',
    fontSize: theme.fontSize.xs,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
});
