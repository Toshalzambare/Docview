import React, { useState, useRef, useEffect } from 'react';
import { View, TextInput, Text, TouchableOpacity, StyleSheet, Keyboard } from 'react-native';
import { theme } from '../utils/theme';

export default function SearchBar({ onSearch, onClose, matchCount, currentMatch, onNext, onPrev }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleChange = (text) => {
    setQuery(text);
    onSearch(text);
  };

  const handleClose = () => {
    setQuery('');
    onSearch('');
    onClose();
    Keyboard.dismiss();
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <View style={styles.inputWrapper}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={query}
            onChangeText={handleChange}
            placeholder="Search in document..."
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && matchCount != null && (
            <Text style={styles.matchInfo}>
              {matchCount > 0 ? `${currentMatch + 1}/${matchCount}` : 'No results'}
            </Text>
          )}
        </View>
        {matchCount > 1 && (
          <View style={styles.navButtons}>
            <TouchableOpacity onPress={onPrev} style={styles.navBtn}>
              <Text style={styles.navBtnText}>{'\u25B2'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onNext} style={styles.navBtn}>
              <Text style={styles.navBtnText}>{'\u25BC'}</Text>
            </TouchableOpacity>
          </View>
        )}
        <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>X</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 14,
    paddingVertical: 8,
  },
  matchInfo: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginLeft: 8,
  },
  navButtons: {
    flexDirection: 'row',
    gap: 2,
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnText: {
    color: theme.colors.accent,
    fontSize: 12,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
});
