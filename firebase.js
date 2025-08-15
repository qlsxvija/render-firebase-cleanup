// firebase.js
import admin from 'firebase-admin';
import fs from 'node:fs';

const databaseURL = process.env.FIREBASE_DB_URL;
if (!databaseURL) throw new Error('Missing FIREBASE_DB_URL');

const credFilePath =
  process.env.FIREBASE_CRED_FILE ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  '/etc/secrets/firebase-key.json';

let credential;
if (fs.existsSync(credFilePath)) {
  credential = admin.credential.cert(credFilePath);
} else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  const obj = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  credential = admin.credential.cert(obj);
} else {
  throw new Error('No Firebase credentials found (FIREBASE_CRED_FILE/GOOGLE_APPLICATION_CREDENTIALS/FIREBASE_SERVICE_ACCOUNT_JSON)');
}

if (!admin.apps.length) {
  admin.initializeApp({ credential, databaseURL });
}

export const db = admin.database();
