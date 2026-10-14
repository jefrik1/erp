import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import axios from 'axios';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let mainWindow;
let db;

// Init SQLite local database
function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'pos.db');
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('DB init error:', err);
    else console.log('Local SQLite initialized at:', dbPath);
    createLocalTables();
  });
}

// Create local schema (minimal)
function createLocalTables() {
  db.serialize(() => {
    // Local cache: products
    db.run(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY,
        sku TEXT UNIQUE,
        name TEXT,
        price_per_kg REAL,
        price_per_bar REAL,
        stock_qty REAL,
        synced INTEGER DEFAULT 0
      )
    `);

    // Local cart
    db.run(`
      CREATE TABLE IF NOT EXISTS cart_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER,
        qty REAL,
        unit TEXT,
        price_per_unit REAL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Local transactions (sync to server later)
    db.run(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_number TEXT UNIQUE,
        items TEXT,
        total REAL,
        paid_amount REAL,
        payment_method TEXT,
        cashier_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        synced INTEGER DEFAULT 0
      )
    `);

    console.log('Local tables created');
  });
}

// Create window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Load from Vite dev server (dev) atau from file (prod)
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webDevTools.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

// IPC: Product lookup (local cache + server sync)
ipcMain.handle('product-lookup', async (event, query) => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM products WHERE sku LIKE ? OR name LIKE ? LIMIT 10`,
      [`%${query}%`, `%${query}%`],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
});

// IPC: Add to cart
ipcMain.handle('cart-add', async (event, item) => {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO cart_items (product_id, qty, unit, price_per_unit) VALUES (?, ?, ?, ?)`,
      [item.product_id, item.qty, item.unit, item.price_per_unit],
      function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      }
    );
  });
});

// IPC: Get cart
ipcMain.handle('cart-list', async (event) => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT c.*, p.sku, p.name FROM cart_items c
       LEFT JOIN products p ON p.id = c.product_id
       ORDER BY c.timestamp`,
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
});

// IPC: Clear cart
ipcMain.handle('cart-clear', async (event) => {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM cart_items`, function(err) {
      if (err) reject(err);
      else resolve(true);
    });
  });
});

// IPC: Checkout (local save + sync later)
ipcMain.handle('checkout', async (event, transaction) => {
  return new Promise((resolve, reject) => {
    const txn_number = 'TXN-' + Date.now();
    const itemsJSON = JSON.stringify(transaction.items);
    
    db.run(
      `INSERT INTO transactions (transaction_number, items, total, paid_amount, payment_method, cashier_id, synced)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [txn_number, itemsJSON, transaction.total, transaction.paid_amount, transaction.payment_method, transaction.cashier_id],
      function(err) {
        if (err) reject(err);
        else {
          // Clear cart
          db.run(`DELETE FROM cart_items`, () => {
            resolve({ transaction_number: txn_number, id: this.lastID });
          });
        }
      }
    );
  });
});

// IPC: Sync to server (when online)
ipcMain.handle('sync', async (event, serverUrl, token) => {
  return new Promise((resolve, reject) => {
    // Get unsynced transactions
    db.all(
      `SELECT * FROM transactions WHERE synced = 0 LIMIT 50`,
      async (err, rows) => {
        if (err) {
          reject(err);
          return;
        }

        let synced = 0;
        for (const txn of rows) {
          try {
            const items = JSON.parse(txn.items);
            const response = await axios.post(
              `${serverUrl}/api/pos/transaction`,
              {
                items,
                total: txn.total,
                paid_amount: txn.paid_amount,
                payment_method: txn.payment_method,
                cashier_id: txn.cashier_id,
                register_id: 1
              },
              { headers: { Authorization: `Bearer ${token}` } }
            );

            // Mark as synced
            db.run(`UPDATE transactions SET synced = 1 WHERE id = ?`, [txn.id]);
            synced++;
          } catch (e) {
            console.error('Sync error:', e.message);
          }
        }
        resolve({ synced, total: rows.length });
      }
    );
  });
});

// App lifecycle
app.on('ready', () => {
  initDatabase();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

console.log('POS App initialized');
