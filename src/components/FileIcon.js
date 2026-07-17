import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { theme } from '../utils/theme';
import { getFileType, getFileExtension } from '../utils/fileTypes';

export default function FileIcon({ filename, size = 48, uri = null }) {
  const fileType = getFileType(filename);
  const ext = getFileExtension(filename).toUpperCase();
  const isImage = fileType.category === 'image';

  // If it's an image and we have a valid local uri, show the actual thumbnail!
  if (isImage && uri && !uri.startsWith('http')) {
    return (
      <View style={[styles.container, { width: size, height: size }]}>
        <Image
          source={{ uri }}
          style={[styles.thumbnail, { borderRadius: size * 0.2 }]}
          resizeMode="cover"
        />
        <View style={[styles.imageBadge, { backgroundColor: theme.colors.surfaceLight }]}>
          <Text style={styles.imageBadgeText}>🖼️</Text>
        </View>
      </View>
    );
  }

  // Define custom styles for different types
  const getBadgeStyle = () => {
    switch (ext) {
      case 'PDF':
        return { bg: '#EA4335', text: 'PDF', labelColor: '#FFF' };
      case 'DOC':
      case 'DOCX':
        return { bg: '#4285F4', text: 'DOC', labelColor: '#FFF' };
      case 'XLS':
      case 'XLSX':
      case 'CSV':
        return { bg: '#0F9D58', text: 'XLS', labelColor: '#FFF' };
      case 'PPT':
      case 'PPTX':
        return { bg: '#F4B400', text: 'PPT', labelColor: '#FFF' };
      case 'JSON':
      case 'JS':
      case 'TS':
      case 'PY':
      case 'HTML':
      case 'CSS':
      case 'XML':
      case 'CPP':
      case 'C':
        return { bg: '#3F51B5', text: ext, labelColor: '#FFF' };
      case 'MD':
      case 'MARKDOWN':
        return { bg: '#607D8B', text: 'MD', labelColor: '#FFF' };
      case 'TXT':
        return { bg: '#757575', text: 'TXT', labelColor: '#FFF' };
      default:
        return { bg: fileType.color || '#9AA0A6', text: ext || 'FILE', labelColor: '#FFF' };
    }
  };

  const badge = getBadgeStyle();
  const fontSize = size * 0.22;

  return (
    <View style={[styles.container, { width: size, height: size, backgroundColor: badge.bg + '15', borderRadius: size * 0.2 }]}>
      {/* Visual representation of a file */}
      <View style={[styles.documentCard, { borderColor: badge.bg }]}>
        {/* Corner fold simulation */}
        <View style={[styles.cornerFold, { borderBottomColor: badge.bg, borderLeftColor: 'transparent' }]} />
        
        {/* Emoji centered in document */}
        <Text style={[styles.mainIcon, { fontSize: size * 0.35 }]}>
          {fileType.icon}
        </Text>

        {/* Bottom solid badge showing the file extension */}
        <View style={[styles.extensionBadge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.extensionText, { fontSize: fontSize, color: badge.labelColor }]} numberOfLines={1}>
            {badge.text}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  imageBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    padding: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  imageBadgeText: {
    fontSize: 9,
  },
  documentCard: {
    width: '80%',
    height: '90%',
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    paddingBottom: 8,
  },
  cornerFold: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 0,
    height: 0,
    borderStyle: 'solid',
    borderRightWidth: 10,
    borderTopWidth: 10,
    borderRightColor: 'transparent',
    borderTopColor: 'transparent',
    borderBottomWidth: 10,
    borderLeftWidth: 10,
    borderBottomColor: '#FFF',
    borderLeftColor: 'transparent',
    borderTopRightRadius: 4,
  },
  mainIcon: {
    marginBottom: 4,
  },
  extensionBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 1,
    alignItems: 'center',
    borderBottomLeftRadius: 4.5,
    borderBottomRightRadius: 4.5,
  },
  extensionText: {
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
