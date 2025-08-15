import admin from "firebase-admin";

// Cách an toàn nhất trên Render: để toàn bộ JSON key vào env FIREBASE_SERVICE_ACCOUNT_JSON
// và databaseURL vào FIREBASE_DB_URL (set trong Render Dashboard).
// (Render khuyến nghị dùng Environment Variables cho secrets. :contentReference[oaicite:1]{index=1})

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const databaseURL = process.env.FIREBASE_DB_URL;

if (!serviceAccountJson || !databaseURL) {
  throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_DB_URL");
}

const serviceAccount = JSON.parse(serviceAccountJson);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL
  });
}

export const db = admin.database();
