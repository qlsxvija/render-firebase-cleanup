// firebase.js
import admin from 'firebase-admin';
import fs from 'node:fs';

function initFirebase(name, credFile, dbURL) {
  if (!dbURL) throw new Error(`Missing DB URL for ${name}`);
  if (!fs.existsSync(credFile)) throw new Error(`Missing credential file: ${credFile}`);

  return admin.initializeApp({
    credential: admin.credential.cert(credFile),
    databaseURL: dbURL
  }, name);
}

// Firebase 1
const app1 = initFirebase(
  'firebase1',
  process.env.FIREBASE1_CRED_FILE || '/etc/secrets/firebase1.json',
  process.env.FIREBASE1_DB_URL
);

// Firebase 2
const app2 = initFirebase(
  'firebase2',
  process.env.FIREBASE2_CRED_FILE || '/etc/secrets/firebase2.json',
  process.env.FIREBASE2_DB_URL
);
// Firebase 3
const app3 = initFirebase(
  'firebase3',
  process.env.FIREBASE3_CRED_FILE || '/etc/secrets/firebase3.json',
  process.env.FIREBASE3_DB_URL
);

// Xuất DB riêng
export const db1 = app1.database();
export const db2 = app2.database();
export const db3 = app3.database();

