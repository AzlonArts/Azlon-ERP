// src/db/schema.js
// Single source of truth for the database.
// Designed to grow — each module (purchasing, production, stock, accounts)
// will add tables here without touching existing ones.

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
  -- ─────────────────────────────────────────────
  -- USERS & AUTH
  -- ─────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT NOT NULL UNIQUE,
    password    TEXT NOT NULL,
    full_name   TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'entry',  -- 'admin' | 'entry'
    department  TEXT,                           -- null = all departments (admin)
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  -- ─────────────────────────────────────────────
  -- MASTER DATA  (grows with ERP)
  -- ─────────────────────────────────────────────
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

  -- ─────────────────────────────────────────────
  -- ORDERS  (the core of the ERP)
  -- ─────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS orders (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no            TEXT NOT NULL UNIQUE,   -- e.g. AZL-2026-001
    buyer_id            INTEGER REFERENCES buyers(id),
    buyer_name          TEXT NOT NULL,          -- denormalised for speed / buyer not always in master
    consignee_text      TEXT NOT NULL,          -- full address block (multiline)
    buyer_text          TEXT,                   -- if different from consignee
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
    status              TEXT DEFAULT 'draft',   -- draft | confirmed | shipped | closed
    created_by          INTEGER REFERENCES users(id),
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now'))
  );

  -- Each order has groups (style/design references like "Noel 01 / 2026")
  CREATE TABLE IF NOT EXISTS order_groups (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,    -- e.g. "Noel 01 / 2026"
    sort_order  INTEGER DEFAULT 0
  );

  -- Each group has line items
  CREATE TABLE IF NOT EXISTS order_lines (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id        INTEGER NOT NULL REFERENCES order_groups(id) ON DELETE CASCADE,
    order_id        INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    description     TEXT NOT NULL,
    packing_detail  TEXT,
    hs_codes        TEXT,         -- comma-separated
    quantity        REAL DEFAULT 0,
    unit_label      TEXT DEFAULT 'Pcs',
    rate            REAL DEFAULT 0,
    amount          REAL GENERATED ALWAYS AS (quantity * rate) STORED,
    sort_order      INTEGER DEFAULT 0,
    -- Future ERP fields (nullable now, used later):
    product_id      INTEGER REFERENCES products(id),
    status          TEXT DEFAULT 'pending'  -- pending | in_production | shipped
  );

  -- ─────────────────────────────────────────────
  -- AUDIT LOG  (grows automatically — every module logs here)
  -- ─────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER REFERENCES users(id),
    action      TEXT NOT NULL,   -- e.g. 'order.create', 'order.update', 'pi.generate'
    entity      TEXT,            -- e.g. 'order'
    entity_id   INTEGER,
    detail      TEXT,            -- JSON or free text
    created_at  TEXT DEFAULT (datetime('now'))
  );

  -- ─────────────────────────────────────────────
  -- FUTURE MODULE PLACEHOLDERS  (tables added later, schema ready)
  -- purchase_orders, production_stages, stock_movements, invoices, payments
  -- ─────────────────────────────────────────────
`);

// Seed a default admin user if none exists
const existing = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
if (!existing) {
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(`
    INSERT INTO users (username, password, full_name, role)
    VALUES ('admin', ?, 'Administrator', 'admin')
  `).run(hash);
  console.log('Default admin created: username=admin password=admin123 (change after first login)');
}

module.exports = db;
