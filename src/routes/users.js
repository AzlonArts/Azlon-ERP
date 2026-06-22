// src/routes/users.js
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/schema');
const { requireLogin, requireAdmin } = require('../middleware/auth');
const router = express.Router();

router.get('/', requireLogin, requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, full_name, role, department, active, created_at FROM users ORDER BY created_at').all();
  res.json(users);
});

router.post('/', requireLogin, requireAdmin, (req, res) => {
  const { username, password, full_name, role, department } = req.body;
  const hash = bcrypt.hashSync(password, 10);
  try {
    const result = db.prepare(`
      INSERT INTO users (username, password, full_name, role, department)
      VALUES (?, ?, ?, ?, ?)
    `).run(username, hash, full_name, role || 'entry', department || null);
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: 'Username already exists' });
  }
});

router.put('/:id', requireLogin, requireAdmin, (req, res) => {
  const { full_name, role, department, active } = req.body;
  db.prepare('UPDATE users SET full_name=?, role=?, department=?, active=? WHERE id=?')
    .run(full_name, role, department || null, active ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

router.post('/:id/reset-password', requireLogin, requireAdmin, (req, res) => {
  const { newPassword } = req.body;
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password=? WHERE id=?').run(hash, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
