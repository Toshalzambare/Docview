import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList } from 'react-native';
import { theme } from '../utils/theme';

export default function SpreadsheetViewer({ data, sheetNames }) {
  const [activeSheet, setActiveSheet] = useState(0);
  const currentData = data[activeSheet] || [];

  const maxCols = useMemo(
    () => Math.max(...currentData.map((row) => (row ? row.length : 0)), 0),
    [currentData]
  );

  const renderRow = useCallback(({ item: row, index: rowIdx }) => (
    <View style={[styles.row, rowIdx === 0 && styles.headerRow, rowIdx % 2 === 1 && styles.altRow]}>
      <View style={styles.rowNumCell}>
        <Text style={styles.rowNumText}>{rowIdx + 1}</Text>
      </View>
      {Array.from({ length: maxCols }, (_, colIdx) => {
        const cellValue = row && row[colIdx] != null ? String(row[colIdx]) : '';
        return (
          <View key={colIdx} style={[styles.cell, rowIdx === 0 && styles.headerCell]}>
            <Text
              style={[styles.cellText, rowIdx === 0 && styles.headerCellText]}
              numberOfLines={3}
            >
              {cellValue}
            </Text>
          </View>
        );
      })}
    </View>
  ), [maxCols]);

  const keyExtractor = useCallback((_, index) => String(index), []);

  if (!currentData.length) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No data in this sheet</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Sheet tabs */}
      {sheetNames && sheetNames.length > 1 && (
        <ScrollView horizontal style={styles.tabBar} showsHorizontalScrollIndicator={false}>
          {sheetNames.map((name, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.tab, activeSheet === i && styles.tabActive]}
              onPress={() => setActiveSheet(i)}
            >
              <Text style={[styles.tabText, activeSheet === i && styles.tabTextActive]}>
                {name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Table */}
      <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.tableScroll}>
        <FlatList
          data={currentData}
          renderItem={renderRow}
          keyExtractor={keyExtractor}
          initialNumToRender={25}
          maxToRenderPerBatch={20}
          windowSize={7}
          removeClippedSubviews={true}
          getItemLayout={(_, index) => ({ length: 42, offset: 42 * index, index })}
        />
      </ScrollView>

      {/* Info bar */}
      <View style={styles.infoBar}>
        <Text style={styles.infoText}>
          {currentData.length} rows × {maxCols} columns
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
  tabBar: {
    flexGrow: 0,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tab: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: theme.colors.accent,
  },
  tabText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: '500',
  },
  tabTextActive: {
    color: theme.colors.accent,
    fontWeight: '700',
  },
  tableScroll: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    height: 42,
  },
  headerRow: {
    backgroundColor: theme.colors.surfaceLight,
  },
  altRow: {
    backgroundColor: theme.colors.surface + '40',
  },
  rowNumCell: {
    width: 45,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  rowNumText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: 'monospace',
  },
  cell: {
    minWidth: 120,
    maxWidth: 250,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    justifyContent: 'center',
  },
  headerCell: {
    backgroundColor: theme.colors.surfaceLight,
  },
  cellText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
  },
  headerCellText: {
    fontWeight: '700',
    color: theme.colors.accentLight,
  },
  infoBar: {
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    alignItems: 'center',
  },
  infoText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
  },
});
