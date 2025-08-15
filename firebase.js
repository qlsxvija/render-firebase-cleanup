// firebase.js
import admin from "firebase-admin";
import fs from "node:fs";

// BẮT BUỘC: đặt URL Realtime Database của bạn vào env này
// ví dụ: https://<project-id>-default-rtdb.asia-southeast1.firebasedatabase.app
const databaseURL = process.env.FIREBASE_DB_URL;
if (!databaseURL) {
  throw new Error("Missing FIREBASE_DB_URL. Please set your RTDB URL in env.");
}

/**
 * Thứ tự ưu tiên credential:
 * 1) FIREBASE_CRED_FILE (đường dẫn Secret File trên Render, khuyến nghị: /etc/secrets/firebase-key.json)
 * 2) GOOGLE_APPLICATION_CREDENTIALS (đường dẫn key JSON, dùng được cả local lẫn Render)
 * 3) FIREBASE_SERVICE_ACCOUNT_JSON (nội dung JSON dạng string – tiện cho local)
 */
const credFilePath =
  process.env.FIREBASE_CRED_FILE ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  "/etc/secrets/firebase-key.json";

let credential;

// Ưu tiên đọc từ file (Secret File/đường dẫn cục bộ)
if (fs.existsSync(credFilePath)) {
  credential = admin.credential.cert(credFilePath);
} else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  // Fallback: đọc từ env JSON string (local/dev)
  try {
    const obj = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    credential = admin.credential.cert(obj);
  } catch (e) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }
} else {
  throw new Error(
    "No Firebase credentials found. Provide FIREBASE_CRED_FILE (or GOOGLE_APPLICATION_CREDENTIALS) to a service-account JSON path, or FIREBASE_SERVICE_ACCOUNT_JSON."
  );
}

// Khởi tạo Admin SDK (idempotent)
if (!admin.apps.length) {
  admin.initializeApp({
    credential,
    databaseURL,
  });
}

export const db = admin.database();
export default admin;
