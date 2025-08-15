// firebase.js (ESM)
import admin from "firebase-admin";
import fs from "node:fs";

const databaseURL = process.env.FIREBASE_DB_URL; // ví dụ: https://<project>-default-rtdb.asia-southeast1.firebasedatabase.app
if (!databaseURL) {
  throw new Error("Missing FIREBASE_DB_URL env.");
}

/**
 * Thứ tự ưu tiên credential:
 * 1) FIREBASE_CRED_FILE (Render Secret File), mặc định: /etc/secrets/firebase-key.json
 * 2) GOOGLE_APPLICATION_CREDENTIALS (đường dẫn file service account)
 * 3) FIREBASE_SERVICE_ACCOUNT_JSON (nội dung JSON để chạy local)
 */
const credFile =
  process.env.FIREBASE_CRED_FILE ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  "/etc/secrets/firebase-key.json";

let credential;

if (fs.existsSync(credFile)) {
  // Dùng secret file
  credential = admin.credential.cert(credFile);
} else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  // Fallback: nội dung JSON từ env (tiện cho local dev)
  try {
    const obj = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    credential = admin.credential.cert(obj);
  } catch (e) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }
} else {
  throw new Error(
    "No Firebase credentials found. Set FIREBASE_CRED_FILE (or GOOGLE_APPLICATION_CREDENTIALS) to a service-account JSON path, or provide FIREBASE_SERVICE_ACCOUNT_JSON."
  );
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential,
    databaseURL,
  });
}

export const db = admin.database();
export default admin;
