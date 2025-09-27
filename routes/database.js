const express = require('express');
const router = express.Router();
const database = require('../config/database');

// Database viewer endpoint
router.get('/viewer', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>POS Database Viewer</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; text-align: center; }
        .table-section { margin: 20px 0; }
        .table-name { font-size: 18px; font-weight: bold; color: #2196f3; margin: 15px 0 10px 0; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; font-weight: bold; }
        tr:nth-child(even) { background-color: #f9f9f9; }
        .refresh-btn { background: #4CAF50; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; margin-bottom: 20px; }
        .refresh-btn:hover { background: #45a049; }
        .status { text-align: center; color: #666; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🗄️ POS Database Viewer</h1>
        <button class="refresh-btn" onclick="window.location.reload()">🔄 Refresh Data</button>
        <div id="tables"></div>
      </div>
      
      <script>
        async function loadTables() {
          try {
            const response = await fetch('/api/database/tables');
            const data = await response.json();
            
            const tablesDiv = document.getElementById('tables');
            tablesDiv.innerHTML = '';
            
            for (const table of data.tables) {
              const tableDiv = document.createElement('div');
              tableDiv.className = 'table-section';
              
              const tableName = document.createElement('div');
              tableName.className = 'table-name';
              tableName.textContent = '📊 ' + table.name.toUpperCase();
              tableDiv.appendChild(tableName);
              
              const tableElement = document.createElement('table');
              
              if (table.data.length > 0) {
                // Create header
                const thead = document.createElement('thead');
                const headerRow = document.createElement('tr');
                Object.keys(table.data[0]).forEach(key => {
                  const th = document.createElement('th');
                  th.textContent = key;
                  headerRow.appendChild(th);
                });
                thead.appendChild(headerRow);
                tableElement.appendChild(thead);
                
                // Create body
                const tbody = document.createElement('tbody');
                table.data.forEach(row => {
                  const tr = document.createElement('tr');
                  Object.values(row).forEach(value => {
                    const td = document.createElement('td');
                    td.textContent = value || 'NULL';
                    tr.appendChild(td);
                  });
                  tbody.appendChild(tr);
                });
                tableElement.appendChild(tbody);
              } else {
                tableElement.innerHTML = '<tr><td colspan="100%">No data available</td></tr>';
              }
              
              tableDiv.appendChild(tableElement);
              tablesDiv.appendChild(tableDiv);
            }
          } catch (error) {
            document.getElementById('tables').innerHTML = '<div class="status">❌ Error loading database: ' + error.message + '</div>';
          }
        }
        
        loadTables();
      </script>
    </body>
    </html>
  `);
});

// API endpoint to get all tables data
router.get('/tables', (req, res) => {
  const db = database.getConnection();
  
  // Get all table names
  db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    const tableData = [];
    let completed = 0;
    
    if (tables.length === 0) {
      return res.json({ tables: [] });
    }
    
    tables.forEach(table => {
      db.all(`SELECT * FROM ${table.name}`, (err, rows) => {
        tableData.push({
          name: table.name,
          data: err ? [] : rows
        });
        
        completed++;
        if (completed === tables.length) {
          res.json({ tables: tableData });
        }
      });
    });
  });
});

module.exports = router;
