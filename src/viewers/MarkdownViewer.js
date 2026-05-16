import React from 'react';
import { ScrollView, StyleSheet, Linking } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { theme } from '../utils/theme';

const markdownStyles = {
  body: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    lineHeight: 24,
  },
  heading1: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 12,
    marginTop: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingBottom: 8,
  },
  heading2: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 10,
    marginTop: 16,
  },
  heading3: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 14,
  },
  heading4: {
    color: theme.colors.textSecondary,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 12,
  },
  paragraph: {
    marginBottom: 10,
  },
  link: {
    color: theme.colors.accent,
    textDecorationLine: 'none',
  },
  blockquote: {
    backgroundColor: theme.colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginVertical: 8,
    borderRadius: 4,
  },
  code_inline: {
    backgroundColor: theme.colors.surface,
    color: theme.colors.accentLight,
    fontFamily: 'monospace',
    fontSize: 13,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  code_block: {
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    fontFamily: 'monospace',
    fontSize: 13,
    padding: 14,
    borderRadius: 8,
    marginVertical: 8,
  },
  fence: {
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    fontFamily: 'monospace',
    fontSize: 13,
    padding: 14,
    borderRadius: 8,
    marginVertical: 8,
  },
  list_item: {
    marginBottom: 4,
  },
  bullet_list_icon: {
    color: theme.colors.accent,
  },
  ordered_list_icon: {
    color: theme.colors.accent,
  },
  table: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    marginVertical: 8,
  },
  thead: {
    backgroundColor: theme.colors.surface,
  },
  th: {
    padding: 8,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderColor: theme.colors.border,
  },
  td: {
    padding: 8,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderColor: theme.colors.border,
  },
  hr: {
    backgroundColor: theme.colors.border,
    height: 1,
    marginVertical: 16,
  },
  strong: {
    fontWeight: '700',
    color: theme.colors.text,
  },
  em: {
    fontStyle: 'italic',
    color: theme.colors.textSecondary,
  },
  image: {
    borderRadius: 8,
  },
};

const handleLinkPress = (url) => {
  if (url) {
    Linking.openURL(url).catch(() => {});
  }
  return false;
};

export default function MarkdownViewer({ content }) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Markdown style={markdownStyles} onLinkPress={handleLinkPress}>{content}</Markdown>
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
    paddingBottom: theme.spacing.xxl,
  },
});
