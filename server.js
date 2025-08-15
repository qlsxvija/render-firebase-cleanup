// server.js (ESM)
import express from 'express';
import { DateTime } from 'luxon';
import { db } from './firebase.js';

const app = express();
const PORT = process.env.PORT || 3000;

// ---- helper: cleanup logic dùng lại cho cả GET/POST
async function cleanupOldNodes() {
  const ref = db.ref('BESAUNTCT');
  const snap = await ref.get();
  if (!snap.exists()) return { deleted: 0, kept: 0, skipped: 0 };

  const now = DateTime.now().setZone('Asia/Ho_Chi_Minh');
  let deleted = 0, kept = 0, skipped = 0;
  const toDelete = [];

  snap.forEach(child => {
    const key = child.key;
    if (String(key).toLowerCase() === 'setrucontent') { skipped++; return; }

    let v = child.val();
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }

    const ut = v?.updateTime;
    if (!ut) { skipped++; return; }

    const updated = DateTime.fromISO(String(ut), { zone: 'Asia/Ho_Chi_Minh' });
    if (!updated.isValid) { skipped++; return; }

    if (now.diff(updated, 'hours').hours > 3) toDelete.push(key);
    else kept++;
  });

  await Promise.all(toDelete.map(k => ref.child(k).remove()));
  deleted = toDelete.length;
  return { deleted, kept, skipped };
}

// Health check
app.get('/healthz', (req, res) => res.status(200).json({ ok: true, dbReady: true, error: null }));

// Trang chủ
app.get('/', (req, res) => res.send('Service is up'));

// ---- GET cleanup không cần token
// Để an toàn hơn, bạn có thể đặt CRON_PATH, ví dụ "abc123", để đường dẫn là /cron/abc123.
// Nếu không đặt, mặc định là "/cleanup".
const CRON_PATH = process.env.CRON_PATH || ''; // ví dụ: abc123
const cleanupPath = CRON_PATH ? `/cron/${CRON_PATH}` : '/cleanup';

app.get(cleanupPath, async (req, res) => {
  try {
    const result = await cleanupOldNodes();
    res.json({ ok: true, via: 'GET', path: cleanupPath, ...result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// (giữ nguyên POST /cleanup nếu bạn muốn)
app.post('/cleanup', async (req, res) => {
  try {
    const result = await cleanupOldNodes();
    res.json({ ok: true, via: 'POST', ...result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Listening on :${PORT} - GET ${cleanupPath}`));

process.on('unhandledRejection', err => console.error('unhandledRejection', err));
process.on('uncaughtException', err => console.error('uncaughtException', err));
