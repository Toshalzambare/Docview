import React, { useRef, useEffect, forwardRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { theme } from '../utils/theme';

const WebViewer = forwardRef(function WebViewer({ html, searchQuery }, ref) {
  const webViewRef = useRef(null);

  // Inject search highlight JS when query changes
  useEffect(() => {
    if (!webViewRef.current) return;
    if (!searchQuery) {
      // Clear highlights
      webViewRef.current.injectJavaScript(`
        document.querySelectorAll('.dv-search-hl').forEach(el => {
          el.outerHTML = el.textContent;
        });
        true;
      `);
      return;
    }
    // Highlight matches
    webViewRef.current.injectJavaScript(`
      (function() {
        // Remove old highlights
        document.querySelectorAll('.dv-search-hl').forEach(el => {
          el.outerHTML = el.textContent;
        });
        var query = ${JSON.stringify(searchQuery)};
        if (!query) return;
        var body = document.body;
        var walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null);
        var nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        var lq = query.toLowerCase();
        var first = true;
        for (var n of nodes) {
          var text = n.textContent;
          var lower = text.toLowerCase();
          var idx = lower.indexOf(lq);
          if (idx === -1) continue;
          var frag = document.createDocumentFragment();
          var lastEnd = 0;
          while (idx !== -1) {
            if (idx > lastEnd) frag.appendChild(document.createTextNode(text.substring(lastEnd, idx)));
            var span = document.createElement('span');
            span.className = 'dv-search-hl';
            span.style.cssText = 'background:#FBBF24;color:#000;border-radius:2px;padding:0 1px;';
            span.textContent = text.substring(idx, idx + query.length);
            frag.appendChild(span);
            if (first) { span.scrollIntoView({behavior:'smooth',block:'center'}); first = false; }
            lastEnd = idx + query.length;
            idx = lower.indexOf(lq, lastEnd);
          }
          if (lastEnd < text.length) frag.appendChild(document.createTextNode(text.substring(lastEnd)));
          n.parentNode.replaceChild(frag, n);
        }
      })();
      true;
    `);
  }, [searchQuery]);

  const wrappedHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          background-color: ${theme.colors.background};
          color: ${theme.colors.text};
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 15px;
          line-height: 1.6;
          padding: 16px;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }
        h1, h2, h3, h4, h5, h6 { color: ${theme.colors.text}; margin: 16px 0 8px; }
        p { margin-bottom: 12px; }
        a { color: ${theme.colors.accent}; }
        img { max-width: 100%; height: auto; border-radius: 8px; }
        table { width: 100%; border-collapse: collapse; margin: 12px 0; }
        th, td { border: 1px solid ${theme.colors.border}; padding: 8px 12px; text-align: left; }
        th { background-color: ${theme.colors.surface}; color: ${theme.colors.accentLight}; font-weight: 600; }
        tr:nth-child(even) { background-color: ${theme.colors.surface}40; }
        pre, code { background-color: ${theme.colors.surface}; border-radius: 4px; font-family: monospace; }
        pre { padding: 12px; overflow-x: auto; }
        code { padding: 2px 6px; }
        blockquote { border-left: 3px solid ${theme.colors.accent}; padding-left: 12px; margin: 8px 0; color: ${theme.colors.textSecondary}; }
        ul, ol { padding-left: 24px; margin-bottom: 12px; }
        li { margin-bottom: 4px; }

        /* PowerPoint slide styles */
        .slide {
          background: ${theme.colors.surface};
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 16px;
          border: 1px solid ${theme.colors.border};
        }
        .slide-number {
          color: ${theme.colors.textMuted};
          font-size: 12px;
          margin-bottom: 8px;
        }
        .slide h2 { color: ${theme.colors.accent}; }
      </style>
    </head>
    <body>
      ${html}
    </body>
    </html>
  `;

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html: wrappedHtml }}
        style={styles.webview}
        originWhitelist={['about:blank', 'about:srcdoc']}
        scrollEnabled={true}
        scalesPageToFit={false}
        javaScriptEnabled={true}
      />
    </View>
  );
});

export default WebViewer;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  webview: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
});
