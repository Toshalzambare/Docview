import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../utils/theme';
import { getFileType } from '../utils/fileTypes';

export default function FileIcon({ filename, size = 48 }) {
  const fileType = getFileType(filename);

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size * 0.25 }]}>
      <View style={[styles.iconBg, { backgroundColor: fileType.color + '20' }]}>
        <Text style={[styles.iconText, { fontSize: size * 0.35, color: fileType.color }]}>
          {fileType.icon}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBg: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontWeight: '700',
  },
});
