// src/server.js
require('dotenv').config();
const express = require('express');
const cookieSession = require('cookie-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'azlon-erp-change-this-secret-in-production';

// ── Middleware ───────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieSession({
  name: 'azlon_session',
  secret: SESSION_SECRET,
  maxAge: 8 * 60 * 60 * 1000, // 8 hours
  httpOnly: true,
  sameSite: 'lax'
}));

// Session user info available to all routes
app.use((req, res, next) => {
  res.locals.user = req.session ? {
    id: req.session.userId,
    username: req.session.username,
    fullName: req.session.fullName,
    role: req.session.role
  } : null;
  next();
});

// ── Static files ─────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public')));

// ── API Routes ───────────────────────────────────────────────────
app.use('/', require('./routes/auth'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/users', require('./routes/users'));

// Current user info endpoint (used by frontend)
app.get('/api/me', (req, res) => {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  res.json({
    id: req.session.userId,
    username: req.session.username,
    fullName: req.session.fullName,
    role: req.session.role,
    department: req.session.department
  });
});

// ── Page routes (serve HTML for all non-API routes) ───────────────
const { requireLogin } = require('./middleware/auth');

app.get('/', requireLogin, (req, res) => res.sendFile('dashboard.html', { root: 'public/pages' }));
app.get('/orders', requireLogin, (req, res) => res.sendFile('orders.html', { root: 'public/pages' }));
app.get('/orders/new', requireLogin, (req, res) => res.sendFile('order-form.html', { root: 'public/pages' }));
app.get('/orders/:id/edit', requireLogin, (req, res) => res.sendFile('order-form.html', { root: 'public/pages' }));
app.get('/orders/:id', requireLogin, (req, res) => res.sendFile('order-view.html', { root: 'public/pages' }));
app.get('/admin/users', requireLogin, (req, res) => res.sendFile('users.html', { root: 'public/pages' }));

// ── Start ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\nAzlon Arts ERP running at http://localhost:${PORT}`);
  console.log(`Default login: admin / admin123\n`);
});
