// src/routes/orders.js
const express = require('express');
const db = require('../db/schema');
const { requireLogin } = require('../middleware/auth');
const router = express.Router();

// ── List all orders ──────────────────────────────────────────────
router.get('/', requireLogin, (req, res) => {
  const orders = db.prepare(`
    SELECT o.*, u.full_name as created_by_name,
      (SELECT COUNT(*) FROM order_lines WHERE order_id = o.id) as line_count,
      (SELECT SUM(amount) FROM order_lines WHERE order_id = o.id) as total_amount
    FROM orders o
    LEFT JOIN users u ON u.id = o.created_by
    ORDER BY o.created_at DESC
  `).all();
  res.json(orders);
});

// ── Get single order with groups and lines ───────────────────────
router.get('/:id', requireLogin, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const groups = db.prepare(`
    SELECT * FROM order_groups WHERE order_id = ? ORDER BY sort_order, id
  `).all(order.id);

  groups.forEach(g => {
    g.items = db.prepare(`
      SELECT * FROM order_lines WHERE group_id = ? ORDER BY sort_order, id
    `).all(g.id);
  });

  order.groups = groups;
  res.json(order);
});

// ── Create new order ─────────────────────────────────────────────
router.post('/', requireLogin, (req, res) => {
  const d = req.body;

  // Auto-generate order_no if not provided
  if (!d.order_no) {
    const year = new Date().getFullYear();
    const last = db.prepare(`
      SELECT order_no FROM orders WHERE order_no LIKE ? ORDER BY id DESC LIMIT 1
    `).get(`AZL-${year}-%`);
    let seq = 1;
    if (last) {
      const parts = last.order_no.split('-');
      seq = parseInt(parts[parts.length - 1]) + 1;
    }
    d.order_no = `AZL-${year}-${String(seq).padStart(3,'0')}`;
  }

  const stmt = db.prepare(`
    INSERT INTO orders (
      order_no, buyer_name, consignee_text, buyer_text,
      country_destination, invoice_no, invoice_date, email_dated,
      order_date, delivery_date, port_loading, port_discharge,
      final_destination, delivery_terms, payment_terms, payment_method,
      currency, partial_shipment, transhipment, delivery_note,
      qty_variation_note, status, created_by
    ) VALUES (
      @order_no, @buyer_name, @consignee_text, @buyer_text,
      @country_destination, @invoice_no, @invoice_date, @email_dated,
      @order_date, @delivery_date, @port_loading, @port_discharge,
      @final_destination, @delivery_terms, @payment_terms, @payment_method,
      @currency, @partial_shipment, @transhipment, @delivery_note,
      @qty_variation_note, @status, @created_by
    )
  `);

  const result = stmt.run({ ...d, created_by: req.session.userId, status: d.status || 'draft' });
  const orderId = result.lastInsertRowid;

  // Save groups and lines
  if (d.groups && Array.isArray(d.groups)) {
    saveGroupsAndLines(orderId, d.groups);
  }

  db.prepare(`INSERT INTO audit_log (user_id, action, entity, entity_id, detail) VALUES (?,?,?,?,?)`)
    .run(req.session.userId, 'order.create', 'order', orderId, `Order ${d.order_no} created`);

  res.json({ ok: true, id: orderId, order_no: d.order_no });
});

// ── Update existing order ────────────────────────────────────────
router.put('/:id', requireLogin, (req, res) => {
  const d = req.body;
  const orderId = parseInt(req.params.id);

  const existing = db.prepare('SELECT id FROM orders WHERE id = ?').get(orderId);
  if (!existing) return res.status(404).json({ error: 'Order not found' });

  db.prepare(`
    UPDATE orders SET
      buyer_name=@buyer_name, consignee_text=@consignee_text, buyer_text=@buyer_text,
      country_destination=@country_destination, invoice_no=@invoice_no,
      invoice_date=@invoice_date, email_dated=@email_dated,
      delivery_date=@delivery_date, port_loading=@port_loading,
      port_discharge=@port_discharge, final_destination=@final_destination,
      delivery_terms=@delivery_terms, payment_terms=@payment_terms,
      payment_method=@payment_method, currency=@currency,
      partial_shipment=@partial_shipment, transhipment=@transhipment,
      delivery_note=@delivery_note, qty_variation_note=@qty_variation_note,
      status=@status, updated_at=datetime('now')
    WHERE id=@id
  `).run({ ...d, id: orderId });

  // Replace groups and lines
  if (d.groups && Array.isArray(d.groups)) {
    db.prepare('DELETE FROM order_groups WHERE order_id = ?').run(orderId);
    saveGroupsAndLines(orderId, d.groups);
  }

  db.prepare(`INSERT INTO audit_log (user_id, action, entity, entity_id, detail) VALUES (?,?,?,?,?)`)
    .run(req.session.userId, 'order.update', 'order', orderId, `Order updated`);

  res.json({ ok: true });
});

// ── Delete order ─────────────────────────────────────────────────
router.delete('/:id', requireLogin, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'draft' && req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Only draft orders can be deleted by non-admin users' });
  }
  db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Update order status ──────────────────────────────────────────
router.patch('/:id/status', requireLogin, (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE orders SET status=?, updated_at=datetime("now") WHERE id=?')
    .run(status, req.params.id);
  res.json({ ok: true });
});

// ── Helper: save groups + lines ──────────────────────────────────
function saveGroupsAndLines(orderId, groups) {
  groups.forEach((grp, gi) => {
    const groupRes = db.prepare(`
      INSERT INTO order_groups (order_id, name, sort_order) VALUES (?, ?, ?)
    `).run(orderId, grp.name || '', gi);

    const groupId = groupRes.lastInsertRowid;
    if (grp.items && Array.isArray(grp.items)) {
      grp.items.forEach((item, li) => {
        db.prepare(`
          INSERT INTO order_lines (
            group_id, order_id, description, packing_detail, hs_codes,
            quantity, unit_label, rate, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          groupId, orderId,
          item.description || '',
          item.packing_detail || '',
          item.hs_codes || '',
          parseFloat(item.quantity) || 0,
          item.unit_label || 'Pcs',
          parseFloat(item.rate) || 0,
          li
        );
      });
    }
  });
}

module.exports = router;
