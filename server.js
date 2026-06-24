/* =========================================================
   FORMAT CMS — backend (Express + node:sqlite)
   Serves the static site from /public and exposes a content API.
   - Content overrides are stored in a real SQLite database (cms.db).
   - Admin auth: credentials are hashed (scrypt) in the DB; login issues
     a random bearer token stored in a sessions table.
   ========================================================= */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const { DatabaseSync } = require('node:sqlite');

const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const PORT = process.env.PORT || 4322;
// Admin credentials come from environment variables so they are NOT committed
// to source control. Set ADMIN_USER / ADMIN_PASS before first run to seed the
// admin account (defaults are placeholders — change them in production).
const SEED_USER = process.env.ADMIN_USER || 'admin';
const SEED_PASS = process.env.ADMIN_PASS || 'changeme';
const SESSION_MS = 1000 * 60 * 60 * 8; // 8 hours

/* ---------- database ---------- */
const db = new DatabaseSync(path.join(__dirname, 'cms.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS content  (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER);
  CREATE TABLE IF NOT EXISTS users    (username TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, username TEXT NOT NULL, expires INTEGER NOT NULL);
`);

const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');

// seed the admin user once
if (!db.prepare('SELECT 1 FROM users WHERE username = ?').get(SEED_USER)) {
  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare('INSERT INTO users (username, salt, hash) VALUES (?, ?, ?)')
    .run(SEED_USER, salt, hashPw(SEED_PASS, salt));
  console.log('Seeded admin user:', SEED_USER);
}

/* ---------- app ---------- */
const app = express();
app.use(express.json({ limit: '20mb' }));

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const s = token && db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!s || s.expires < Date.now()) return res.status(401).json({ error: 'unauthorized' });
  req.user = s.username;
  next();
}

// login → bearer token
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = username && db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!u || hashPw(String(password || ''), u.salt) !== u.hash) {
    return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + SESSION_MS;
  db.prepare('INSERT INTO sessions (token, username, expires) VALUES (?, ?, ?)').run(token, username, expires);
  db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now()); // cleanup
  res.json({ token, expires });
});

app.post('/api/logout', auth, (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.json({ ok: true });
});

// who am I (used by the client to confirm a stored token is still valid)
app.get('/api/me', auth, (req, res) => res.json({ user: req.user }));

// public: read all content overrides
app.get('/api/content', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM content').all();
  const out = {};
  rows.forEach((r) => { out[r.key] = r.value; });
  res.json(out);
});

// protected: MERGE the given fields into the stored overrides.
// Only upserts the keys provided — never deletes others, so a save can
// never wipe previously-saved content. (Use /api/reset to clear everything.)
app.put('/api/content', auth, (req, res) => {
  const data = req.body && typeof req.body === 'object' ? req.body : {};
  const upsert = db.prepare(
    'INSERT INTO content (key, value, updated_at) VALUES (?, ?, ?) ' +
    'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
  );
  const now = Date.now();
  db.exec('BEGIN');
  try {
    for (const k of Object.keys(data)) upsert.run(k, String(data[k]), now);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'save failed' });
  }
  const total = db.prepare('SELECT COUNT(*) AS n FROM content').get().n;
  res.json({ ok: true, saved: Object.keys(data).length, total });
});

// protected: delete a single override (revert one field to its default)
app.delete('/api/content/:key', auth, (req, res) => {
  db.prepare('DELETE FROM content WHERE key = ?').run(req.params.key);
  res.json({ ok: true });
});

// protected: clear all overrides
app.post('/api/reset', auth, (req, res) => {
  db.prepare('DELETE FROM content').run();
  res.json({ ok: true });
});

// protected: upload an image (sent as a base64 data URL) → saved under /public/uploads
app.post('/api/upload', auth, (req, res) => {
  const data = req.body && req.body.data;
  const m = typeof data === 'string' && data.match(/^data:image\/([a-z0-9.+-]+);base64,(.+)$/i);
  if (!m) return res.status(400).json({ error: 'קובץ לא תקין (נדרשת תמונה)' });
  const ext = m[1].toLowerCase().replace('jpeg', 'jpg').replace('svg+xml', 'svg');
  if (!['png', 'jpg', 'webp', 'gif', 'avif'].includes(ext)) return res.status(400).json({ error: 'סוג קובץ לא נתמך' });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 10 * 1024 * 1024) return res.status(413).json({ error: 'הקובץ גדול מדי (מקסימום 10MB)' });
  const name = 'cube_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(UPLOADS_DIR, name), buf);
  res.json({ url: '/uploads/' + name });
});

/* ---------- static site ---------- */
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-store'), // always serve fresh (dev)
}));

app.listen(PORT, () => console.log(`FORMAT CMS running → http://localhost:${PORT}`));
