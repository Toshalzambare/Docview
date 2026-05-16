import React, { useState } from 'react';
import { View, Image, StyleSheet, Dimensions, ScrollView, Text } from 'react-native';
import { theme } from '../utils/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function ImageViewer({ uri }) {
  const [dimensions, setDimensions] = useState(null);
  const [error, setError] = useState(false);

  const onLoad = (e) => {
    const { width, height } = e.nativeEvent.source;
    const ratio = Math.min(SCREEN_WIDTH / width, (SCREEN_HEIGHT - 150) / height);
    setDimensions({
      width: width * ratio,
      height: height * ratio,
      originalWidth: width,
      originalHeight: height,
    });
  };

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorText}>Could not load image</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      maximumZoomScale={5}
      minimumZoomScale={1}
      bouncesZoom={true}
    >
      <Image
        source={{ uri }}
        style={[
          styles.image,
          dimensions ? { width: dimensions.width, height: dimensions.height } : { width: SCREEN_WIDTH, height: SCREEN_WIDTH },
        ]}
        resizeMode="contain"
        onLoad={onLoad}
        onError={() => setError(true)}
      />
      {dimensions && (
        <Text style={styles.dimensionText}>
          {dimensions.originalWidth} x {dimensions.originalHeight}
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.md,
  },
  image: {
    borderRadius: theme.borderRadius.sm,
  },
  dimensionText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    marginTop: theme.spacing.sm,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: theme.spacing.md,
  },
  errorText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
  },
});
