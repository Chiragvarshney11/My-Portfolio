const express = require('express');
const multer  = require('multer');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Paths ───────────────────────────────────────────────────────────────────
const DATA_FILE    = path.join(__dirname, 'data', 'certificates.json');
const CONTENT_FILE = path.join(__dirname, 'data', 'content.json');
const UPLOADS_DIR  = path.join(__dirname, 'public', 'uploads');
const ADMIN_PASS   = process.env.ADMIN_PASSWORD || '';
const ADMIN_TOKEN  = 'cv-admin-secret-2026'; // simple static token for demo

// ─── LeetCode cache ───────────────────────────────────────────────────────────
let lcCache = null;
let lcCacheTime = 0;
const LC_CACHE_TTL = 1000 * 60 * 60 * 6; // 6 hours
const LC_USERNAME  = 'Chiragvarshney_official24';

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


app.post("/api/leetcode", async (req, res) => {
  try {
    const response = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Multer setup ─────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOADS_DIR),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, uuidv4() + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_, file, cb) => {
    const ok = /image\/(jpeg|png|gif|webp)/.test(file.mimetype);
    cb(ok ? null : new Error('Only image files allowed'), ok);
  }
});

// ─── Helper: read / write certificates ───────────────────────────────────────
function readCerts() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}
function writeCerts(certs) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(certs, null, 2));
}

// ─── Auth middleware ──────────────────────────────────────────────────────────
function authRequired(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ── POST /api/auth/login ──────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASS) {
    return res.json({ token: ADMIN_TOKEN, message: 'Login successful' });
  }
  return res.status(401).json({ error: 'Wrong password' });
});

// ── GET /api/leetcode-stats ───────────────────────────────────────────────────
app.get('/api/leetcode-stats', async (req, res) => {
  try {
    const now = Date.now();
    if (lcCache && now - lcCacheTime < LC_CACHE_TTL) {
      return res.json({ ...lcCache, cached: true });
    }

    // Query 1 — problem counts + ranking
    const q1 = `query userStats($username: String!) {
      allQuestionsCount { difficulty count }
      matchedUser(username: $username) {
        submitStats { acSubmissionNum { difficulty count submissions } }
        profile { ranking }
      }
    }`;

    // Query 2 — submission calendar for streak calculation
    const q2 = `query userCalendar($username: String!) {
      matchedUser(username: $username) { submissionCalendar }
    }`;

    const [r1, r2] = await Promise.all([
      fetch('https://leetcode.com/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q1, variables: { username: LC_USERNAME } })
      }),
      fetch('https://leetcode.com/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q2, variables: { username: LC_USERNAME } })
      })
    ]);

    const d1 = await r1.json();
    const d2 = await r2.json();

    const mu   = d1.data?.matchedUser;
    const ac   = mu?.submitStats?.acSubmissionNum || [];
    const aqc  = d1.data?.allQuestionsCount || [];

    const getCount  = (arr, diff) => arr.find(x => x.difficulty === diff)?.count ?? 0;
    const totalQ    = (diff) => aqc.find(x => x.difficulty === diff)?.count ?? 0;

    // ── Streak calculation from calendar ─────────────────────────────────────
    let currentStreak = 0;
    let maxStreak = 0;
    try {
      const calendar = JSON.parse(d2.data?.matchedUser?.submissionCalendar || '{}');
      const dayMs = 86400;
      const today = Math.floor(Date.now() / 1000 / dayMs) * dayMs;

      // Build a set of days with submissions
      const activeDays = new Set(
        Object.keys(calendar).map(ts => Math.floor(Number(ts) / dayMs) * dayMs)
      );

      // Current streak: count backwards from today
      let d = today;
      while (activeDays.has(d)) { currentStreak++; d -= dayMs; }

      // Max streak
      const sortedDays = [...activeDays].sort((a, b) => a - b);
      let streak = 0;
      for (let i = 0; i < sortedDays.length; i++) {
        if (i === 0 || sortedDays[i] - sortedDays[i - 1] === dayMs) {
          streak++;
        } else {
          streak = 1;
        }
        maxStreak = Math.max(maxStreak, streak);
      }
    } catch (_) { /* ignore calendar parse errors */ }

    lcCache = {
      username: LC_USERNAME,
      ranking: mu?.profile?.ranking ?? 0,
      totalSolved: getCount(ac, 'All'),
      easySolved: getCount(ac, 'Easy'),
      mediumSolved: getCount(ac, 'Medium'),
      hardSolved: getCount(ac, 'Hard'),
      totalEasy: totalQ('Easy'),
      totalMedium: totalQ('Medium'),
      totalHard: totalQ('Hard'),
      totalAll: totalQ('All'),
      currentStreak,
      maxStreak,
      lastUpdated: new Date().toISOString()
    };
    lcCacheTime = now;

    res.json(lcCache);
  } catch (err) {
    console.error('LeetCode fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch LeetCode stats' });
  }
});

// ── GET /api/content ─────────────────────────────────────────────────────────
app.get('/api/content', (req, res) => {
  try {
    const content = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));
    res.json(content);
  } catch {
    res.json({});
  }
});

// ── POST /api/content (admin only) ───────────────────────────────────────────
app.post('/api/content', authRequired, (req, res) => {
  try {
    const current = (() => {
      try { return JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8')); } catch { return {}; }
    })();
    const updated = { ...current, ...req.body };
    fs.writeFileSync(CONTENT_FILE, JSON.stringify(updated, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save content' });
  }
});

// ── GET /api/certificates ─────────────────────────────────────────────────────
app.get('/api/certificates', (req, res) => {
  res.json(readCerts());
});

// ── POST /api/certificates (admin only) ───────────────────────────────────────
app.post('/api/certificates', authRequired, upload.single('image'), (req, res) => {
  const { title, issuer, date, link } = req.body;
  if (!req.file) return res.status(400).json({ error: 'Image required' });

  const cert = {
    id: uuidv4(),
    title: title || 'Certificate',
    issuer: issuer || '',
    date: date || '',
    link: link || '',
    filename: req.file.filename
  };

  const certs = readCerts();
  certs.push(cert);
  writeCerts(certs);

  res.status(201).json(cert);
});

// ── DELETE /api/certificates/:id (admin only) ─────────────────────────────────
app.delete('/api/certificates/:id', authRequired, (req, res) => {
  let certs = readCerts();
  const cert = certs.find(c => c.id === req.params.id);
  if (!cert) return res.status(404).json({ error: 'Certificate not found' });

  // Delete file only if it's in uploads (don't delete original static assets)
  const filePath = path.join(UPLOADS_DIR, cert.filename);
  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch (_) {}
  }

  certs = certs.filter(c => c.id !== req.params.id);
  writeCerts(certs);
  res.json({ success: true });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  Portfolio server running at http://localhost:${PORT}`);
  console.log(`📋  Admin panel → http://localhost:${PORT}/admin.html`);
  console.log(`🔑  Admin password → ${ADMIN_PASS}\n`);
});

module.exports = app;
