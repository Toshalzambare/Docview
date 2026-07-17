import React from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { theme } from '../utils/theme';

export default function SpreadsheetViewer({ data, sheetNames }) {
  // Generate HTML letters for Excel headers (A, B, C, ..., Z, AA, AB, ...)
  const getColLabel = (index) => {
    let label = '';
    let temp = index;
    while (temp >= 0) {
      label = String.fromCharCode((temp % 26) + 65) + label;
      temp = Math.floor(temp / 26) - 1;
    }
    return label;
  };

  // Compile sheets data into a format suitable for direct script injection or loading
  const sheetsJson = JSON.stringify(data || []);
  const sheetNamesJson = JSON.stringify(sheetNames || ['Sheet1']);

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body, html {
          width: 100%;
          height: 100%;
          background-color: #FFFFFF;
          color: #000000;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          overflow: hidden;
        }

        #app {
          display: flex;
          flex-direction: column;
          width: 100%;
          height: 100%;
        }

        /* Container allowing simultaneous horizontal and vertical scroll */
        .sheet-container {
          flex: 1;
          overflow: auto;
          position: relative;
          -webkit-overflow-scrolling: touch;
        }

        table {
          border-collapse: collapse;
          border-spacing: 0;
          font-size: 14px;
          min-width: 100%;
        }

        td, th {
          border-right: 1px solid #D4D4D4;
          border-bottom: 1px solid #D4D4D4;
          padding: 6px 10px;
          min-width: 80px;
          max-width: 300px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Sticky Row/Column Headers CSS */
        
        /* Corner empty header cell (top-left) */
        th.corner-header {
          position: sticky;
          top: 0;
          left: 0;
          z-index: 4;
          background-color: #F3F3F3;
          border-right: 1px solid #C0C0C0;
          border-bottom: 1px solid #C0C0C0;
          min-width: 45px;
          width: 45px;
        }

        /* Sticky top column letters (A, B, C...) */
        th.col-header {
          position: sticky;
          top: 0;
          z-index: 2;
          background-color: #F3F3F3;
          color: #333333;
          font-weight: 500;
          border-bottom: 1px solid #C0C0C0;
          text-align: center;
        }

        /* Sticky left row numbers (1, 2, 3...) */
        td.row-header {
          position: sticky;
          left: 0;
          z-index: 2;
          background-color: #F3F3F3;
          color: #333333;
          font-weight: 500;
          border-right: 1px solid #C0C0C0;
          text-align: center;
          min-width: 45px;
          width: 45px;
        }

        td {
          background-color: #FFFFFF;
        }

        /* Bottom Tab Bar Switcher styling */
        .tab-bar {
          height: 48px;
          background-color: #F3F3F3;
          border-top: 1px solid #C0C0C0;
          display: flex;
          overflow-x: auto;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
        }

        .tab-bar::-webkit-scrollbar {
          display: none;
        }

        .tab-btn {
          padding: 0 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #333333;
          font-size: 14px;
          font-weight: 500;
          border: none;
          background: none;
          white-space: nowrap;
          border-bottom: 3px solid transparent;
          outline: none;
          cursor: pointer;
        }

        .tab-btn.active {
          color: #107C41; /* Excel Green */
          border-bottom-color: #107C41;
          font-weight: 700;
          background-color: #FFFFFF;
        }

        .info-bar {
          background-color: #107C41;
          font-size: 12px;
          color: #FFFFFF;
          padding: 6px 12px;
          text-align: right;
        }
      </style>
    </head>
    <body>
      <div id="app">
        <div class="sheet-container" id="sheet-container">
          <!-- Render Table Dynamically -->
          <table id="sheet-table">
            <!-- Table contents are injected dynamically -->
          </table>
        </div>
        <div class="info-bar" id="info-bar">Loading spreadsheet...</div>
        <div class="tab-bar" id="tab-bar">
          <!-- Tabs are injected dynamically -->
        </div>
      </div>

      <script>
        const sheetsData = ${sheetsJson};
        const sheetNames = ${sheetNamesJson};
        let activeSheetIndex = 0;

        function getColLabel(index) {
          let label = '';
          let temp = index;
          while (temp >= 0) {
            label = String.fromCharCode((temp % 26) + 65) + label;
            temp = Math.floor(temp / 26) - 1;
          }
          return label;
        }

        function renderSheet(sheetIndex) {
          const sheet = sheetsData[sheetIndex] || [];
          const table = document.getElementById('sheet-table');
          table.innerHTML = '';

          if (sheet.length === 0) {
            table.innerHTML = '<tr><td style="text-align:center;padding:24px;color:#8E918F;">No data inside this sheet</td></tr>';
            document.getElementById('info-bar').innerText = '0 rows × 0 columns';
            return;
          }

          // Calculate dimensions
          const rowCount = sheet.length;
          let maxCols = 0;
          for (let r = 0; r < rowCount; r++) {
            if (sheet[r] && sheet[r].length > maxCols) {
              maxCols = sheet[r].length;
            }
          }

          // 1. Create header row (letters: A, B, C...)
          const headerRow = document.createElement('tr');
          const cornerTh = document.createElement('th');
          cornerTh.className = 'corner-header';
          headerRow.appendChild(cornerTh);

          for (let c = 0; c < maxCols; c++) {
            const colTh = document.createElement('th');
            colTh.className = 'col-header';
            colTh.innerText = getColLabel(c);
            headerRow.appendChild(colTh);
          }
          table.appendChild(headerRow);

          // 2. Create rows with data
          for (let r = 0; r < rowCount; r++) {
            const tr = document.createElement('tr');
            
            // Row number cell (sticky left)
            const rowTd = document.createElement('td');
            rowTd.className = 'row-header';
            rowTd.innerText = r + 1;
            tr.appendChild(rowTd);

            const rowData = sheet[r] || [];
            for (let c = 0; c < maxCols; c++) {
              const val = rowData[c] !== undefined && rowData[c] !== null ? String(rowData[c]) : '';
              const td = document.createElement('td');
              td.innerText = val;
              // Add a title attribute to allow hover inspect if text wraps
              if (val) td.title = val;
              tr.appendChild(td);
            }
            table.appendChild(tr);
          }

          document.getElementById('info-bar').innerText = rowCount + ' rows × ' + maxCols + ' columns';
        }

        function renderTabs() {
          const tabBar = document.getElementById('tab-bar');
          tabBar.innerHTML = '';
          
          if (sheetNames.length <= 1) {
            tabBar.style.display = 'none';
            return;
          }

          sheetNames.forEach((name, index) => {
            const button = document.createElement('button');
            button.className = 'tab-btn' + (index === activeSheetIndex ? ' active' : '');
            button.innerText = name;
            button.onclick = () => {
              document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
              button.classList.add('active');
              activeSheetIndex = index;
              renderSheet(index);
              // Scroll sheet view to top-left when switching tabs
              document.getElementById('sheet-container').scrollLeft = 0;
              document.getElementById('sheet-container').scrollTop = 0;
            };
            tabBar.appendChild(button);
          });
        }

        // Run on startup
        renderSheet(0);
        renderTabs();
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
