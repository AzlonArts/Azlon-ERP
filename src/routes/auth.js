// src/routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/schema');
const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session && req.session.userId) return res.redirect('/');
  res.sendFile('login.html', { root: 'public/pages' });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.fullName = user.full_name;
  req.session.role = user.role;
  req.session.department = user.department;

  db.prepare(`INSERT INTO audit_log (user_id, action, entity, detail) VALUES (?,?,?,?)`)
    .run(user.id, 'auth.login', 'user', `Login from ${req.ip}`);

  res.json({ ok: true, role: user.role });
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

router.post('/change-password', (req, res) => {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  const { currentPassword, newPassword } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!bcrypt.compareSync(currentPassword, user.password)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.session.userId);
  res.json({ ok: true });
});

module.exports = router;
