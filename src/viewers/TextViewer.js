import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { theme } from '../utils/theme';

export default function TextViewer({ content, language, searchQuery, currentMatch }) {
  const lines = useMemo(() => content.split('\n'), [content]);
  const lineNumWidth = useMemo(() => Math.max(30, String(lines.length).length * 10 + 10), [lines.length]);
  const flatListRef = useRef(null);

  // Find matching line indices for search
  const matchingLines = useMemo(() => {
    if (!searchQuery) return [];
    const q = searchQuery.toLowerCase();
    const matches = [];
    lines.forEach((line, idx) => {
      if (line.toLowerCase().includes(q)) {
        matches.push(idx);
      }
    });
    return matches;
  }, [lines, searchQuery]);

  // Scroll to current match
  useEffect(() => {
    if (matchingLines.length > 0 && currentMatch != null) {
      const lineIdx = matchingLines[currentMatch % matchingLines.length];
      if (lineIdx != null && flatListRef.current) {
        flatListRef.current.scrollToIndex({ index: lineIdx, animated: true, viewPosition: 0.3 });
      }
    }
  }, [currentMatch, matchingLines]);

  const highlightText = useCallback((text, query) => {
    if (!query) return <Text style={styles.codeLine}>{text || ' '}</Text>;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const parts = [];
    let lastEnd = 0;
    let pos = 0;
    while ((pos = lowerText.indexOf(lowerQuery, lastEnd)) !== -1) {
      if (pos > lastEnd) {
        parts.push(<Text key={`t${lastEnd}`} style={styles.codeLine}>{text.substring(lastEnd, pos)}</Text>);
      }
      parts.push(
        <Text key={`h${pos}`} style={styles.highlight}>
          {text.substring(pos, pos + query.length)}
        </Text>
      );
      lastEnd = pos + query.length;
    }
    if (lastEnd < text.length) {
      parts.push(<Text key={`t${lastEnd}`} style={styles.codeLine}>{text.substring(lastEnd)}</Text>);
    }
    if (parts.length === 0) return <Text style={styles.codeLine}>{text || ' '}</Text>;
    return <Text style={styles.codeLine}>{parts}</Text>;
  }, []);

  const renderLine = useCallback(({ item, index }) => {
    const isMatch = searchQuery && item.toLowerCase().includes(searchQuery.toLowerCase());
    return (
      <View style={[styles.row, isMatch && styles.matchRow]}>
        <Text style={[styles.lineNumber, { width: lineNumWidth }]}>
          {index + 1}
        </Text>
        {searchQuery ? highlightText(item, searchQuery) : <Text style={styles.codeLine}>{item || ' '}</Text>}
      </View>
    );
  }, [lineNumWidth, searchQuery, highlightText]);

  const keyExtractor = useCallback((_, index) => String(index), []);

  return (
    <FlatList
      ref={flatListRef}
      data={lines}
      renderItem={renderLine}
      keyExtractor={keyExtractor}
      style={styles.container}
      contentContainerStyle={styles.listContent}
      initialNumToRender={40}
      maxToRenderPerBatch={30}
      windowSize={7}
      removeClippedSubviews={true}
      getItemLayout={(_, index) => ({ length: 22, offset: 22 * index, index })}
      onScrollToIndexFailed={(info) => {
        flatListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  listContent: {
    padding: theme.spacing.md,
  },
  row: {
    flexDirection: 'row',
    minHeight: 22,
  },
  matchRow: {
    backgroundColor: theme.colors.accent + '18',
  },
  lineNumber: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: 'monospace',
    lineHeight: 22,
    textAlign: 'right',
    marginRight: theme.spacing.sm,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    paddingRight: theme.spacing.sm,
  },
  codeLine: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: 'monospace',
    lineHeight: 22,
    flex: 1,
  },
  highlight: {
    color: '#000000',
    backgroundColor: '#FBBF24',
    fontFamily: 'monospace',
    fontSize: theme.fontSize.sm,
    lineHeight: 22,
    borderRadius: 2,
  },
});
