// server.js
import express from 'express';
import { DateTime } from 'luxon';
import { db1, db2 } from './firebase.js';

const app = express();
const PORT = process.env.PORT || 3000;

// ===== DANH SÁCH ROOT CẦN DỌN =====
const CLEANUP_ROOTS = [
  { path: 'BESAUNTCT', skip: ['SetRuContent'] },
  { path: 'SetDevicesNV', skip: ['SetRuContent'] },
  { path: 'SetDevicesNV2', skip: ['SetRuContent'] },
  { path: 'SetDevicesVNGDH', skip: ['SetRuContent'] }
];

// ===== HÀM KIỂM TRA THỜI GIAN =====
function shouldDeleteNode(value, now) {
  let v = value;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } 
    catch { return { deletable: false, reason: 'invalid_json' }; }
  }

  const ut = v?.Devices?.updateTime || v?.updateTime;
  if (!ut) return { deletable: false, reason: 'no_updateTime' };

  const updated = DateTime.fromISO(String(ut), { zone: 'Asia/Ho_Chi_Minh' });
  if (!updated.isValid) return { deletable: false, reason: 'invalid_time' };

  const diffH = now.diff(updated, 'hours').hours;
  return { deletable: diffH > 3, hours: diffH };
}

// ===== DỌN CÁC ROOT =====
async function cleanupMultipleRoots(db, label) {
  const now = DateTime.now().setZone('Asia/Ho_Chi_Minh');
  const updates = {};
  const report = [];

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

      if (root.skip?.some(s => s.toLowerCase() === String(key).toLowerCase())) {
        skipped++;
        return;
      }

      const { deletable } = shouldDeleteNode(child.val(), now);
      if (deletable) {
        updates[`${root.path}/${key}`] = null;
        deleted++;
      } else {
        kept++;
      }
    });

    report.push({ root: root.path, deleted, kept, skipped });
  }

  // Multi update Firebase
  if (Object.keys(updates).length > 0)
    await db.ref().update(updates);

  // Dọn riêng VNGDH1
  const vngdh1 = await cleanupVNGDH1(db);
  report.push(vngdh1);

  // Tổng
  const total = report.reduce((acc, r) => {
    acc.deleted += r.deleted || 0;
    acc.kept += r.kept || 0;
    acc.skipped += r.skipped || 0;
    return acc;
  }, { deleted: 0, kept: 0, skipped: 0 });

  return { firebase: label, report, total };
}

// ===== DỌN RIÊNG VNGDH1 =====
async function cleanupVNGDH1(db) {
  const now = DateTime.now().setZone('Asia/Ho_Chi_Minh');
  const ref = db.ref('VNGDH1');
  const snap = await ref.get();

  if (!snap.exists()) 
    return { root: 'VNGDH1', deleted: 0, kept: 0, note: 'empty' };

  const updates = {};
  let deleted = 0, kept = 0, skipped = 0;

  snap.forEach(child => {
    const key = child.key;

    // Bỏ qua SetRuContents
    if (String(key).toLowerCase() === 'setrucontents') {
      skipped++;
      return;
    }

    const value = child.val();
    const ut = value?.Devices?.updateTime;

    if (!ut) { kept++; return; }

    const updated = DateTime.fromISO(String(ut), { zone: 'Asia/Ho_Chi_Minh' });
    if (!updated.isValid) { kept++; return; }

    const diffH = now.diff(updated, 'hours').hours;
    if (diffH > 3) {
      updates[`VNGDH1/${key}`] = null;
      deleted++;
    } else {
      kept++;
    }
  });

  if (Object.keys(updates).length > 0)
    await db.ref().update(updates);

  return { root: 'VNGDH1', deleted, kept, skipped };
}

// ===== ENDPOINT =====

// Health check
app.get('/healthz', (_req, res) => 
  res.status(200).json({ ok: true, db1: true, db2: true })
);

// Home
app.get('/', (_req, res) => res.send('Service is running'));

// Cleanup
const CRON_PATH = process.env.CRON_PATH || '';
const cleanupPath = CRON_PATH ? `/cron/${CRON_PATH}` : '/cleanup';

app.get(cleanupPath, async (_req, res) => {
  try {
    const [firebase1, firebase2] = await Promise.all([
      cleanupMultipleRoots(db1, 'firebase1'),
      cleanupMultipleRoots(db2, 'firebase2')
    ]);

    res.json({ ok: true, via: 'GET', path: cleanupPath, firebase1, firebase2 });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () =>
  console.log(`Listening on :${PORT} - GET ${cleanupPath}`)
);
