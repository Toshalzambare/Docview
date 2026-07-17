import React from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { theme } from '../utils/theme';

/**
 * CodeViewer — Fully Offline Syntax-Highlighted Code Display
 *
 * Uses a self-contained keyword-based highlighter embedded directly
 * in the HTML/CSS/JS. No external CDN or network resources needed.
 *
 * Supports: JavaScript, TypeScript, Python, Java, C, C++, CSS, HTML/XML,
 *           JSON, Bash/Shell, Markdown, and generic C-like languages.
 */
export default function CodeViewer({ content, language }) {
  // Map common file extensions to language identifiers
  const mapExtToLang = (ext) => {
    const l = (ext || '').toLowerCase();
    if (l === 'js' || l === 'jsx') return 'javascript';
    if (l === 'ts' || l === 'tsx') return 'typescript';
    if (l === 'py') return 'python';
    if (l === 'json') return 'json';
    if (l === 'html' || l === 'htm') return 'html';
    if (l === 'css') return 'css';
    if (l === 'xml') return 'xml';
    if (l === 'cpp' || l === 'cc') return 'cpp';
    if (l === 'c') return 'c';
    if (l === 'java') return 'java';
    if (l === 'sh' || l === 'bash') return 'bash';
    if (l === 'md' || l === 'markdown') return 'markdown';
    return 'clike'; // fallback
  };

  const lang = mapExtToLang(language);

  const escapedContent = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          background-color: #131314;
          margin: 0;
          padding: 0;
          font-family: Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace;
        }
        .code-container {
          padding: 16px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        table.code-table {
          border-collapse: collapse;
          width: 100%;
          font-size: 13px;
          line-height: 1.55;
        }
        .code-table td {
          padding: 0;
          vertical-align: top;
          white-space: pre;
          font-family: Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace;
        }
        .line-num {
          width: 1px;
          white-space: nowrap;
          padding-right: 12px;
          padding-left: 4px;
          text-align: right;
          color: #8E918F;
          border-right: 1px solid #444746;
          user-select: none;
          -webkit-user-select: none;
        }
        .line-code {
          padding-left: 12px;
          color: #E3E3E3;
        }

        /* Syntax colors — Okaidia / One Dark inspired */
        .kw  { color: #F92672; font-weight: 500; }   /* keywords */
        .str { color: #A6E22E; }                      /* strings */
        .num { color: #AE81FF; }                      /* numbers */
        .cmt { color: #75715E; font-style: italic; }  /* comments */
        .fn  { color: #66D9EF; }                      /* functions/built-ins */
        .op  { color: #F8F8F2; }                      /* operators */
        .typ { color: #66D9EF; font-style: italic; }  /* types */
        .dec { color: #E6DB74; }                      /* decorators/annotations */
        .tag { color: #F92672; }                      /* HTML/XML tags */
        .atn { color: #A6E22E; }                      /* HTML attributes */
        .atv { color: #E6DB74; }                      /* attribute values */
        .pun { color: #F8F8F2; }                      /* punctuation */
      </style>
    </head>
    <body>
      <div class="code-container">
        <table class="code-table" id="code-table"></table>
      </div>

      <script>
        (function() {
          var lang = ${JSON.stringify(lang)};
          var raw = ${JSON.stringify(content)};
          var lines = raw.split('\\n');

          // ---- Language keyword sets ----
          var KW = {
            javascript: /\\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|from|default|async|await|try|catch|finally|throw|typeof|instanceof|in|of|delete|void|yield|super|static|get|set|null|undefined|true|false|NaN|Infinity)\\b/g,
            typescript: /\\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|from|default|async|await|try|catch|finally|throw|typeof|instanceof|in|of|delete|void|yield|super|static|get|set|null|undefined|true|false|NaN|Infinity|type|interface|enum|implements|declare|namespace|module|abstract|as|is|keyof|readonly|private|protected|public|any|never|unknown|string|number|boolean|bigint|symbol|object|void|infer|satisfies)\\b/g,
            python: /\\b(def|class|return|if|elif|else|for|while|break|continue|pass|import|from|as|try|except|finally|raise|with|yield|lambda|del|global|nonlocal|assert|and|or|not|is|in|True|False|None|self|async|await|print)\\b/g,
            java: /\\b(public|private|protected|static|final|abstract|class|interface|extends|implements|new|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|throws|import|package|void|int|long|double|float|boolean|char|byte|short|null|true|false|this|super|instanceof|synchronized|volatile|transient|native|enum)\\b/g,
            c: /\\b(auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|inline|int|long|register|restrict|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while|NULL|true|false)\\b/g,
            cpp: /\\b(auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|inline|int|long|register|restrict|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while|NULL|true|false|class|namespace|using|public|private|protected|virtual|override|template|typename|new|delete|this|throw|try|catch|nullptr|bool|string|vector|map|set|cout|cin|endl|include|define)\\b/g,
            bash: /\\b(if|then|else|elif|fi|for|while|do|done|case|esac|in|function|return|exit|echo|export|source|local|readonly|declare|set|unset|shift|cd|pwd|ls|grep|sed|awk|cat|true|false|test)\\b/g,
            css: /\\b(color|background|margin|padding|border|font|display|position|top|left|right|bottom|width|height|max|min|flex|grid|align|justify|text|line|overflow|opacity|transform|transition|animation|z-index|box|cursor|content|none|auto|inherit|initial|important|solid|dashed|dotted|hidden|visible|relative|absolute|fixed|sticky|block|inline|flex|grid|nowrap|wrap|center|start|end|stretch|row|column|!important)\\b/g,
            clike: /\\b(if|else|for|while|do|switch|case|break|continue|return|function|class|new|this|null|true|false|var|const|let|void|int|string|bool|float|double)\\b/g,
          };

          // Detect built-in function names
          var BUILTINS = {
            javascript: /\\b(console|log|warn|error|parseInt|parseFloat|setTimeout|setInterval|clearTimeout|clearInterval|Math|JSON|Array|Object|String|Number|Boolean|Date|Promise|Map|Set|WeakMap|WeakSet|Symbol|RegExp|Error|TypeError|RangeError|fetch|require|module|exports|process|Buffer)\\b/g,
            typescript: /\\b(console|log|warn|error|parseInt|parseFloat|setTimeout|setInterval|Math|JSON|Array|Object|String|Number|Boolean|Date|Promise|Map|Set|Symbol|RegExp|Error|fetch|require|keyof|Partial|Required|Record|Pick|Omit|Exclude|Extract|ReturnType|Awaited)\\b/g,
            python: /\\b(print|len|range|int|str|float|list|dict|set|tuple|bool|type|input|open|map|filter|zip|enumerate|sorted|reversed|sum|min|max|abs|round|format|isinstance|issubclass|hasattr|getattr|setattr|super|property|staticmethod|classmethod|__init__|__str__|__repr__|__name__|__main__)\\b/g,
            java: /\\b(System|out|println|String|Integer|Double|Float|Boolean|List|ArrayList|HashMap|Map|Set|HashSet|Arrays|Collections|Math|Object|Override|Deprecated|SuppressWarnings|Thread|Runnable|IOException|Exception)\\b/g,
          };

          function esc(s) {
            return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
          }

          // ---- Highlighter ----
          function highlight(line) {
            if (!line) return ' ';

            var tokens = [];
            var i = 0;

            while (i < line.length) {
              // --- Comments ---
              // Single-line comment //
              if ((lang !== 'python' && lang !== 'bash') && line[i] === '/' && line[i+1] === '/') {
                tokens.push({type:'cmt', text: esc(line.substring(i))});
                i = line.length;
                continue;
              }
              // Python/Bash single-line comment #
              if ((lang === 'python' || lang === 'bash') && line[i] === '#') {
                tokens.push({type:'cmt', text: esc(line.substring(i))});
                i = line.length;
                continue;
              }
              // CSS/HTML comment <!-- or /*
              if (line[i] === '/' && line[i+1] === '*') {
                var end = line.indexOf('*/', i+2);
                if (end === -1) end = line.length - 2;
                tokens.push({type:'cmt', text: esc(line.substring(i, end+2))});
                i = end + 2;
                continue;
              }

              // --- Strings ---
              if (line[i] === '"' || line[i] === "'" || line[i] === '\`') {
                var q = line[i];
                var j = i + 1;
                while (j < line.length && !(line[j] === q && line[j-1] !== '\\\\')) j++;
                if (j < line.length) j++;
                tokens.push({type:'str', text: esc(line.substring(i, j))});
                i = j;
                continue;
              }

              // --- Numbers ---
              if (/[0-9]/.test(line[i]) && (i === 0 || /[^a-zA-Z_$]/.test(line[i-1]))) {
                var j = i;
                while (j < line.length && /[0-9a-fA-FxXbBoO._eE+\\-]/.test(line[j])) j++;
                tokens.push({type:'num', text: esc(line.substring(i, j))});
                i = j;
                continue;
              }

              // --- Decorators / Annotations ---
              if (line[i] === '@' && (lang === 'python' || lang === 'java' || lang === 'typescript')) {
                var j = i + 1;
                while (j < line.length && /[a-zA-Z0-9_.]/.test(line[j])) j++;
                tokens.push({type:'dec', text: esc(line.substring(i, j))});
                i = j;
                continue;
              }

              // --- HTML/XML tags ---
              if ((lang === 'html' || lang === 'xml') && line[i] === '<') {
                var j = line.indexOf('>', i);
                if (j === -1) j = line.length - 1;
                var tagContent = line.substring(i, j + 1);
                // Highlight tag name, attributes, and values
                var highlighted = tagContent
                  .replace(/(&lt;\\/?)(\\w[\\w-]*)/g, function(m, p1, p2) { return '<span class="pun">' + esc(p1) + '</span><span class="tag">' + esc(p2) + '</span>'; })
                  .replace(/(\\w[\\w-]*)\\s*=\\s*("[^"]*"|'[^']*')/g, function(m, attr, val) { return '<span class="atn">' + esc(attr) + '</span>=<span class="atv">' + esc(val) + '</span>'; });
                // Simpler: just color the whole thing
                tokens.push({type:'tag', text: esc(tagContent)});
                i = j + 1;
                continue;
              }

              // --- Identifiers / Keywords ---
              if (/[a-zA-Z_$]/.test(line[i])) {
                var j = i;
                while (j < line.length && /[a-zA-Z0-9_$]/.test(line[j])) j++;
                var word = line.substring(i, j);
                var kwRegex = KW[lang] || KW['clike'];
                kwRegex.lastIndex = 0;
                var biRegex = BUILTINS[lang];

                if (kwRegex.test(word)) {
                  tokens.push({type:'kw', text: esc(word)});
                } else if (biRegex && (biRegex.lastIndex = 0, biRegex.test(word))) {
                  tokens.push({type:'fn', text: esc(word)});
                } else if (j < line.length && line[j] === '(') {
                  tokens.push({type:'fn', text: esc(word)});
                } else {
                  tokens.push({type:'', text: esc(word)});
                }
                i = j;
                continue;
              }

              // --- Default: operators/punctuation ---
              tokens.push({type:'', text: esc(line[i])});
              i++;
            }

            return tokens.map(function(t) {
              if (t.type) return '<span class="' + t.type + '">' + t.text + '</span>';
              return t.text;
            }).join('');
          }

          // ---- Render ----
          var table = document.getElementById('code-table');
          var buf = '';
          for (var n = 0; n < lines.length; n++) {
            buf += '<tr><td class="line-num">' + (n + 1) + '</td><td class="line-code">' + highlight(lines[n]) + '</td></tr>';
          }
          table.innerHTML = buf;
        })();
      </script>
    </body>
    </html>
  `;

  return (
    <View style={styles.container}>
      <WebView
        source={{ html }}
        style={styles.webview}
        originWhitelist={['*']}
        scalesPageToFit={false}
        scrollEnabled={true}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        renderLoading={() => (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color={theme.colors.accent} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#131314',
  },
  webview: {
    flex: 1,
    backgroundColor: '#131314',
  },
  loaderContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#131314',
  },
});
