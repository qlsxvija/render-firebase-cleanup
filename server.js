// server.js (đoạn chính liên quan)
import express from 'express';
import { DateTime } from 'luxon';
import { db } from './firebase.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Khai báo các root cần dọn
// - Với BESAUNTCT: skip 'SetRuContent'
// - Với SetDevicesNV2/SetDevicesNV3: không skip gì (có thể thêm sau)
const CLEANUP_ROOTS = [
  { path: 'BESAUNTCT', skip: ['SetRuContent'] },
  { path: 'SetDevicesNV2', skip: ['SetRuContent'] }
];

// Hàm parse updateTime + rule > 3 giờ (dùng lại cho mọi root)
function shouldDeleteNode(value, now) {
  // value có thể là object hoặc string JSON
  let v = value;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return { deletable: false, reason: 'invalid_json' }; }
  }
  const ut = v?.updateTime;
  if (!ut) return { deletable: false, reason: 'no_updateTime' };

  const updated = DateTime.fromISO(String(ut), { zone: 'Asia/Ho_Chi_Minh' });
  if (!updated.isValid) return { deletable: false, reason: 'invalid_time' };

  const diffH = now.diff(updated, 'hours').hours;
  return { deletable: diffH > 3, hours: diffH };
}

// Dọn nhiều root trong MỘT lần bằng multi-path update
async function cleanupMultipleRoots() {
  const now = DateTime.now().setZone('Asia/Ho_Chi_Minh');

  // Sẽ gom các đường dẫn cần xóa vào đây: { "root/key": null, ... }
  const updates = {};
  const report = []; // báo cáo theo từng root

  for (const root of CLEANUP_ROOTS) {
    const ref = db.ref(root.path);
    const snap = await ref.get();

    let deleted = 0, kept = 0, skipped = 0;

    if (!snap.exists()) {
      report.push({ root: root.path, deleted, kept, skipped, note: 'empty' });
      continue;
    }

    snap.forEach(child => {
      const key = child.key;

      // skip theo tên key (ví dụ SetRuContent)
      if (root.skip?.some(s => s.toLowerCase() === String(key).toLowerCase())) {
        skipped++;
        return;
      }

      const { deletable } = shouldDeleteNode(child.val(), now);
      if (deletable) {
        // Multi-path update: xóa bằng cách set null
        updates[`${root.path}/${key}`] = null;
        deleted++;
      } else {
        kept++;
      }
    });

    report.push({ root: root.path, deleted, kept, skipped });
  }

  // Thực hiện xóa hàng loạt nếu có gì để xóa
  if (Object.keys(updates).length > 0) {
    await db.ref().update(updates); // 1 request cho tất cả
  }

  // Tính tổng
  const total = report.reduce((acc, r) => {
    acc.deleted += r.deleted;
    acc.kept += r.kept;
    acc.skipped += r.skipped;
    return acc;
  }, { deleted: 0, kept: 0, skipped: 0 });

  return { report, total };
}

// Health & Home
app.get('/healthz', (_req, res) => res.status(200).json({ ok: true, dbReady: true, error: null }));
app.get('/', (_req, res) => res.send('Service is up'));

// Endpoint cleanup không cần POST/token (dành cho Cron GET)
// Bạn có thể đổi path bí mật bằng env CRON_PATH nếu muốn (vd: abc123 → /cron/abc123)
const CRON_PATH = process.env.CRON_PATH || '';
const cleanupPath = CRON_PATH ? `/cron/${CRON_PATH}` : '/cleanup';

app.get(cleanupPath, async (_req, res) => {
  try {
    const result = await cleanupMultipleRoots();
    res.json({ ok: true, via: 'GET', path: cleanupPath, ...result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Listening on :${PORT} - GET ${cleanupPath}`));
