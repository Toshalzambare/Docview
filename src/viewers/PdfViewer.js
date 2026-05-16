import React, { useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Pdf from 'react-native-pdf';
import { theme } from '../utils/theme';

const { width, height } = Dimensions.get('window');

export default function PdfViewer({ uri }) {
  const [pageInfo, setPageInfo] = useState({ current: 1, total: 1 });

  return (
    <View style={styles.container}>
      <Pdf
        source={{ uri }}
        style={styles.pdf}
        enablePaging={false}
        horizontal={false}
        fitPolicy={0}
        spacing={8}
        onLoadComplete={(numberOfPages) => {
          setPageInfo((prev) => ({ ...prev, total: numberOfPages }));
        }}
        onPageChanged={(page) => {
          setPageInfo((prev) => ({ ...prev, current: page }));
        }}
        onError={(error) => {
          console.log('PDF Error:', error);
        }}
        trustAllCerts={false}
      />
      <View style={styles.pageIndicator}>
        <Text style={styles.pageText}>
          {pageInfo.current} / {pageInfo.total}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  pdf: {
    flex: 1,
    width,
    backgroundColor: theme.colors.background,
  },
  pageIndicator: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pageText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
});
