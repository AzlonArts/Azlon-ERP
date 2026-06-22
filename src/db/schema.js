const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '../../data');
const DB_PATH = path.join(DB_DIR, 'azlon.db');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT NOT NULL UNIQUE,
    password    TEXT NOT NULL,
    full_name   TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'entry',
    department  TEXT,
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS buyers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    code          TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    address       TEXT,
    country       TEXT,
    contact_name  TEXT,
    email         TEXT,
    phone         TEXT,
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    unit        TEXT DEFAULT 'Pcs',
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no            TEXT NOT NULL UNIQUE,
    buyer_id            INTEGER REFERENCES buyers(id),
    buyer_name          TEXT NOT NULL,
    consignee_text      TEXT NOT NULL,
    buyer_text          TEXT,
    country_destination TEXT,
    invoice_no          TEXT,
    invoice_date        TEXT,
    email_dated         TEXT,
    order_date          TEXT DEFAULT (date('now')),
    delivery_date       TEXT,
    port_loading        TEXT DEFAULT 'Any Indian Port',
    port_discharge      TEXT,
    final_destination   TEXT,
    delivery_terms      TEXT DEFAULT 'FOB By Sea',
    payment_terms       TEXT,
    payment_method      TEXT,
    currency            TEXT DEFAULT 'Euro',
    partial_shipment    TEXT DEFAULT 'Allowed',
    transhipment        TEXT DEFAULT 'Allowed',
    delivery_note       TEXT,
    qty_variation_note  TEXT DEFAULT 'Plus / Minus 10% Quantity Variation per Design and Colours are acceptable',
    status              TEXT DEFAULT 'draft',
    created_by          INTEGER REFERENCES users(id),
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_groups (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    sort_order  INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS order_lines (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id        INTEGER NOT NULL REFERENCES order_groups(id) ON DELETE CASCADE,
    order_id        INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    description     TEXT,
    product         TEXT,
    size            TEXT,
    pcs_per_ctn     REAL DEFAULT 0,
    num_ctns        INTEGER DEFAULT 0,
    packing_detail  TEXT,
    hs_codes        TEXT,
    barcode         TEXT,
    quantity        REAL DEFAULT 0,
    unit_label      TEXT DEFAULT 'Pcs',
    rate            REAL DEFAULT 0,
    amount          REAL GENERATED ALWAYS AS (quantity * rate) STORED,
    sort_order      INTEGER DEFAULT 0,
    product_id      INTEGER REFERENCES products(id),
    status          TEXT DEFAULT 'pending'
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER REFERENCES users(id),
    action      TEXT NOT NULL,
    entity      TEXT,
    entity_id   INTEGER,
    detail      TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );
`);

const existing = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
if (!existing) {
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(`INSERT INTO users (username, password, full_name, role) VALUES ('admin', ?, 'Administrator', 'admin')`).run(hash);
  console.log('Default admin created: username=admin password=admin123');
}

module.exports = db;
