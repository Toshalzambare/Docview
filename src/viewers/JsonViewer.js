import React, { useState, memo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { theme } from '../utils/theme';

const MAX_DEPTH = 20;

const JsonNode = memo(function JsonNode({ data, depth = 0, expanded = true, seen }) {
  const [isExpanded, setIsExpanded] = useState(expanded && depth < 2);

  if (data === null) return <Text style={styles.null}>null</Text>;
  if (data === undefined) return <Text style={styles.null}>undefined</Text>;
  if (typeof data === 'boolean') return <Text style={styles.boolean}>{data.toString()}</Text>;
  if (typeof data === 'number') return <Text style={styles.number}>{data}</Text>;
  if (typeof data === 'string') return <Text style={styles.string}>"{data}"</Text>;

  // Circular reference protection
  const seenSet = seen || new WeakSet();
  if (typeof data === 'object') {
    if (seenSet.has(data)) {
      return <Text style={styles.null}>[Circular Reference]</Text>;
    }
    seenSet.add(data);
  }

  // Max depth protection
  if (depth > MAX_DEPTH) {
    return <Text style={styles.collapsed}>[Max depth reached]</Text>;
  }

  const isArray = Array.isArray(data);
  const allEntries = isArray ? data.map((v, i) => [i, v]) : Object.entries(data);
  const MAX_ENTRIES = 100;
  const entries = allEntries.length > MAX_ENTRIES ? allEntries.slice(0, MAX_ENTRIES) : allEntries;
  const truncated = allEntries.length > MAX_ENTRIES;
  const bracketOpen = isArray ? '[' : '{';
  const bracketClose = isArray ? ']' : '}';

  if (entries.length === 0) {
    return <Text style={styles.bracket}>{bracketOpen}{bracketClose}</Text>;
  }

  return (
    <View>
      <TouchableOpacity onPress={() => setIsExpanded(!isExpanded)} style={styles.row}>
        <Text style={styles.toggle}>{isExpanded ? '▼' : '▶'}</Text>
        <Text style={styles.bracket}>
          {bracketOpen}
          {!isExpanded && <Text style={styles.collapsed}> ...{allEntries.length} items </Text>}
          {!isExpanded && bracketClose}
        </Text>
      </TouchableOpacity>
      {isExpanded && (
        <View style={[styles.indent, { marginLeft: depth < 6 ? 20 : 10 }]}>
          {entries.map(([key, value], i) => (
            <View key={i} style={styles.entry}>
              {!isArray && <Text style={styles.key}>{key}: </Text>}
              {isArray && <Text style={styles.index}>{key}: </Text>}
              <JsonNode data={value} depth={depth + 1} seen={seenSet} />
              {i < entries.length - 1 && <Text style={styles.comma}>,</Text>}
            </View>
          ))}
          {truncated && (
            <Text style={styles.collapsed}>... {allEntries.length - MAX_ENTRIES} more items</Text>
          )}
        </View>
      )}
      {isExpanded && <Text style={styles.bracket}>{bracketClose}</Text>}
    </View>
  );
});

export default function JsonViewer({ content }) {
  let parsed;
  let parseError = null;

  try {
    parsed = JSON.parse(content);
  } catch (e) {
    parseError = e.message;
  }

  if (parseError) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.errorBanner}>
          <Text style={styles.errorTitle}>Invalid JSON</Text>
          <Text style={styles.errorMsg}>{parseError}</Text>
        </View>
        <View style={styles.rawContainer}>
          <Text style={styles.rawText}>{content}</Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <JsonNode data={parsed} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggle: {
    color: theme.colors.accent,
    fontSize: 10,
    marginRight: 6,
    width: 14,
  },
  bracket: {
    color: theme.colors.textSecondary,
    fontFamily: 'monospace',
    fontSize: theme.fontSize.sm,
  },
  collapsed: {
    color: theme.colors.textMuted,
    fontStyle: 'italic',
  },
  indent: {
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.border,
    paddingLeft: 8,
  },
  entry: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: 1,
  },
  key: {
    color: theme.colors.accent,
    fontFamily: 'monospace',
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  index: {
    color: theme.colors.textMuted,
    fontFamily: 'monospace',
    fontSize: theme.fontSize.sm,
  },
  string: {
    color: '#4ADE80',
    fontFamily: 'monospace',
    fontSize: theme.fontSize.sm,
  },
  number: {
    color: '#FBBF24',
    fontFamily: 'monospace',
    fontSize: theme.fontSize.sm,
  },
  boolean: {
    color: '#F87171',
    fontFamily: 'monospace',
    fontSize: theme.fontSize.sm,
  },
  null: {
    color: '#A855F7',
    fontFamily: 'monospace',
    fontSize: theme.fontSize.sm,
    fontStyle: 'italic',
  },
  comma: {
    color: theme.colors.textMuted,
    fontFamily: 'monospace',
  },
  errorBanner: {
    margin: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.error + '15',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.error + '40',
  },
  errorTitle: {
    color: theme.colors.error,
    fontWeight: '700',
    fontSize: theme.fontSize.md,
    marginBottom: 4,
  },
  errorMsg: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
  },
  rawContainer: {
    margin: theme.spacing.md,
    padding: theme.spacing.md,
  },
  rawText: {
    color: theme.colors.text,
    fontFamily: 'monospace',
    fontSize: theme.fontSize.sm,
  },
});
