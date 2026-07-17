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

  const isPresentation = html && html.includes('class="slide"');

  const wrappedHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          background-color: ${theme.colors.background};
          /* Center the document page container */
          display: flex;
          justify-content: center;
          padding: 16px 8px;
          min-height: 100vh;
        }
        .document-page {
          background-color: #FFFFFF;
          color: #000000;
          font-family: 'Times New Roman', Times, serif;
          font-size: 16px;
          line-height: 1.5;
          padding: 16px;
          width: 100%;
          max-width: 100%;
          box-shadow: 0 4px 6px rgba(0,0,0,0.3);
          border-radius: 4px;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }
        h1, h2, h3, h4, h5, h6 { 
          color: #000000; 
          margin: 20px 0 10px; 
          font-family: Arial, Helvetica, sans-serif;
        }
        h1 { font-size: 2em; }
        h2 { font-size: 1.5em; }
        h3 { font-size: 1.17em; }
        p { margin-bottom: 16px; }
        a { color: #0000EE; text-decoration: underline; }
        img { max-width: 100%; height: auto; margin: 10px 0; display: block; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        th, td { border: 1px solid #000000; padding: 6px 10px; text-align: left; vertical-align: top; }
        th { background-color: #F0F0F0; font-weight: bold; }
        pre, code { font-family: monospace; }
        ul, ol { padding-left: 30px; margin-bottom: 16px; }
        li { margin-bottom: 6px; }

        /* PowerPoint slide styles overrides */
        .presentation-container {
          width: 100%;
          max-width: 900px;
          display: flex;
          flex-direction: column;
        }
        .slide {
          background: #FFFFFF;
          border-radius: 8px;
          padding: 30px;
          margin-bottom: 24px;
          box-shadow: 0 4px 8px rgba(0,0,0,0.4);
          border: 1px solid #CCCCCC;
          aspect-ratio: 16 / 9; /* Force slide ratio */
          display: flex;
          flex-direction: column;
          position: relative;
        }
        .slide-number {
          position: absolute;
          bottom: 10px;
          right: 15px;
          color: #666666;
          font-size: 12px;
          font-family: Arial, sans-serif;
        }
        .slide h2, .slide h3 { font-family: Arial, sans-serif; }
      </style>
    </head>
    <body>
      ${isPresentation 
        ? `<div class="presentation-container">${html}</div>` 
        : `<div class="document-page">${html}</div>`
      }
    </body>
    </html>
  `;

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html: wrappedHtml }}
        style={styles.webview}
        originWhitelist={['*']}
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
