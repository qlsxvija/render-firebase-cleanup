// server.js
import express from 'express';
import { DateTime } from 'luxon';
import { db } from './firebase.js';

const app = express();
const PORT = process.env.PORT || 3000;

// ===== DANH SÁCH ROOT CẦN DỌN =====
const CLEANUP_ROOTS = [
  { path: 'BESAUNTCT', skip: ['SetRuContent'] },
  { path: 'SetDevicesNV', skip: ['SetRuContent'] },
  { path: 'SetDevicesNV2', skip: ['SetRuContent'] },
  { path: 'SetDevicesVNGDH', skip: ['SetRuContent'] }
];

// ===== HÀM KIỂM TRA THỜI GIAN updateTime =====
function shouldDeleteNode(value, now) {
  let v = value;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return { deletable: false, reason: 'invalid_json' }; }
  }

  // Với các root thường thì updateTime nằm trực tiếp,
  // còn riêng VNGDH1 thì updateTime nằm trong Devices
  const ut = v?.Devices?.updateTime || v?.updateTime;
  if (!ut) return { deletable: false, reason: 'no_updateTime' };

  const updated = DateTime.fromISO(String(ut), { zone: 'Asia/Ho_Chi_Minh' });
  if (!updated.isValid) return { deletable: false, reason: 'invalid_time' };

  const diffH = now.diff(updated, 'hours').hours;
  return { deletable: diffH > 3, hours: diffH };
}

// ===== HÀM DỌN CÁC ROOT TRONG DANH SÁCH =====
async function cleanupMultipleRoots() {
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

      // bỏ qua các key trong danh sách skip (nếu có)
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

  // Nếu có node cần xóa, thực hiện multi-path update 1 lần
  if (Object.keys(updates).length > 0)
    await db.ref().update(updates);

  // ✅ DỌN THÊM ROOT VNGDH1
  const vngdh1 = await cleanupVNGDH1();
  report.push(vngdh1);

  // Tổng kết toàn bộ
  const total = report.reduce((acc, r) => {
    acc.deleted += r.deleted || 0;
    acc.kept += r.kept || 0;
    acc.skipped += r.skipped || 0;
    return acc;
  }, { deleted: 0, kept: 0, skipped: 0 });

  return { report, total };
}

// ===== HÀM DỌN RIÊNG NODE VNGDH1 =====
async function cleanupVNGDH1() {
  const now = DateTime.now().setZone('Asia/Ho_Chi_Minh');
  const ref = db.ref('VNGDH1');
  const snap = await ref.get();

  if (!snap.exists()) return { root: 'VNGDH1', deleted: 0, kept: 0, note: 'empty' };

  const updates = {};
  let deleted = 0, kept = 0;

  snap.forEach(child => {
    const value = child.val();
    const ut = value?.Devices?.updateTime;

    if (!ut) {
      kept++;
      return;
    }

    const updated = DateTime.fromISO(String(ut), { zone: 'Asia/Ho_Chi_Minh' });
    if (!updated.isValid) {
      kept++;
      return;
    }

    const diffH = now.diff(updated, 'hours').hours;
    if (diffH > 3) {
      updates[`VNGDH1/${child.key}`] = null;
      deleted++;
    } else {
      kept++;
    }
  });

  if (Object.keys(updates).length > 0)
    await db.ref().update(updates);

  return { root: 'VNGDH1', deleted, kept };
}

// ===== ENDPOINTS =====

// Kiểm tra service
app.get('/healthz', (_req, res) => res.status(200).json({ ok: true, dbReady: true, error: null }));
app.get('/', (_req, res) => res.send('Service is up'));

// Endpoint cleanup (cho cron job)
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

// ===== KHỞI ĐỘNG SERVER =====
app.listen(PORT, '0.0.0.0', () =>
  console.log(`Listening on :${PORT} - GET ${cleanupPath}`)
);
