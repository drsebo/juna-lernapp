// Local dev tool — pushes the bundled content JSON files (the editable source of
// truth for book content) into the private Firestore `content` collection
// the deployed app actually reads from. Equivalent to the "re-sync" button on
// the Manage Content screen, but run from the terminal with admin
// credentials instead of requiring a logged-in browser session.
//
// Usage: node scripts/syncContent.js <path-to-service-account-key.json>

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const keyPath = process.argv[2] || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!keyPath) {
  console.error('Usage: node scripts/syncContent.js <path-to-service-account-key.json>');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(keyPath), 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const firestore = admin.firestore();

// Every content document is listed in src/data/contentIndex.json (grade 5
// units, grade 6 units, verb lists, learning goals …). The index itself is
// pushed too, as content/index — the app reads it to know what to load.
const DATA_DIR = path.resolve(__dirname, '../src/data');
const INDEX_FILE = path.join(DATA_DIR, 'contentIndex.json');

async function main() {
  const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  for (const entry of index.documents) {
    const filePath = path.join(DATA_DIR, entry.file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    await firestore.collection('content').doc(entry.id).set(data);
    console.log(`Synced ${entry.id} (grade ${entry.grade}) from ${filePath}`);
  }
  // Written last, so the app never sees an index pointing at documents that
  // aren't uploaded yet.
  await firestore.collection('content').doc('index').set(index);
  console.log(`Synced index (${index.documents.length} documents)`);
  console.log('Done.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Sync failed:', err);
    process.exit(1);
  });
