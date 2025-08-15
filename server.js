import express from "express";
import { DateTime } from "luxon";
import { db } from "./firebase.js";

const app = express();
const PORT = process.env.PORT || 3000;          // Render injects $PORT for web services. :contentReference[oaicite:2]{index=2}
const CLEANUP_TOKEN = process.env.CLEANUP_TOKEN || ""; // đơn giản hoá auth

// Health check (Render khuyến khích có endpoint health). :contentReference[oaicite:3]{index=3}
app.get("/healthz", (_, res) => res.status(200).send("ok"));

/**
 * Logic:
 * - Duyệt các con của BESAUNTCT, BỎ QUA 'SetRuContent'
 * - Lấy updateTime (dữ liệu có thể là object hoặc chuỗi JSON)
 * - So với "now" tại Asia/Ho_Chi_Minh; nếu > 3 giờ thì xoá
 */
async function cleanupOldNodes() {
  const ref = db.ref("BESAUNTCT");
  const snap = await ref.get();
  if (!snap.exists()) return { deleted: 0, kept: 0, skipped: 0 };

  let deleted = 0, kept = 0, skipped = 0;

  const now = DateTime.now().setZone("Asia/Ho_Chi_Minh");

  snap.forEach(child => {
    const key = child.key;
    if (String(key).toLowerCase() === "setrucontent") { skipped++; return; }

    let value = child.val();
    // value có thể là chuỗi JSON
    if (typeof value === "string") {
      try { value = JSON.parse(value); } catch { value = null; }
    }

    const ut = value?.updateTime;
    if (!ut) { skipped++; return; }

    // updateTime của bạn đang là ISO local dạng "2025-08-15T22:07:54"
    // Parse theo Asia/Ho_Chi_Minh để so cho nhất quán
    const updated = DateTime.fromISO(String(ut), { zone: "Asia/Ho_Chi_Minh" });
    if (!updated.isValid) { skipped++; return; }

    const diffHours = now.diff(updated, "hours").hours;

    if (diffHours > 3) {
      // Đánh dấu xoá (thu thập promise để xoá song song)
      child._toDelete = true;
    } else {
      kept++;
    }
  });

  // Xoá các node được đánh dấu
  const delPromises = [];
  snap.forEach(child => {
    if (child._toDelete) {
      delPromises.push(ref.child(child.key).remove());
    }
  });

  const results = await Promise.allSettled(delPromises);
  results.forEach(r => { if (r.status === "fulfilled") deleted++; else skipped++; });

  return { deleted, kept, skipped };
}

// Endpoint bảo vệ bằng token đơn giản (đưa token trong header X-Auth-Token)
app.post("/cleanup", async (req, res) => {
  if (!CLEANUP_TOKEN || req.header("X-Auth-Token") !== CLEANUP_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }
  try {
    const result = await cleanupOldNodes();
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Cho phép chạy 1 lần bằng CLI (tiện nếu dùng Render Cron Job chạy "npm run cleanup"). :contentReference[oaicite:4]{index=4}
if (process.argv.includes("--once")) {
  cleanupOldNodes()
    .then(r => { console.log("Cleanup result:", r); process.exit(0); })
    .catch(e => { console.error(e); process.exit(1); });
} else {
  app.listen(PORT, () => console.log(`Listening on :${PORT}`));
}
