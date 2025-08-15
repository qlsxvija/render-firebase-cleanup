// server.js (ESM)
import express from 'express';

// ĐỂ Ý: import firebase sau để nếu thiếu ENV thì log rõ ràng
let db = null;
let firebaseInitError = null;

try {
  const mod = await import('./firebase.js');
  db = mod.db; // nếu init ok sẽ có db
} catch (e) {
  firebaseInitError = e;
  console.error('🔥 Firebase init failed:', e?.message || e);
}

const app = express();

// Health check: luôn 200 để Render không kill service trong lúc bạn sửa env.
// (Khi chạy ổn rồi, có thể đổi sang 200 chỉ khi db ok nếu muốn nghiêm ngặt.)
app.get('/healthz', (req, res) => {
  res.status(200).json({
    ok: true,
    dbReady: !!db,
    error: firebaseInitError ? String(firebaseInitError.message || firebaseInitError) : null
  });
});

app.get('/', (req, res) => res.send('Service is up'));

app.post('/cleanup', async (req, res) => {
  try {
    const token = req.header('X-Auth-Token');
    if (!process.env.CLEANUP_TOKEN || token !== process.env.CLEANUP_TOKEN) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    if (!db) throw new Error('Firebase not initialized');

    const ref = db.ref('BESAUNTCT');
    const snap = await ref.get();
    if (!snap.exists()) return res.json({ ok: true, deleted: 0, kept: 0, skipped: 0 });

    const { DateTime } = await import('luxon');
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

    res.json({ ok: true, deleted, kept, skipped });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Listening on :${PORT}`));

// Bắt lỗi không bắt được để không crash im lặng
process.on('unhandledRejection', err => console.error('unhandledRejection', err));
process.on('uncaughtException', err => console.error('uncaughtException', err));
