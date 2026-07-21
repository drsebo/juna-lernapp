// Local dev tool — pushes the bundled unit JSON files (the editable source of
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

const CONTENT_FILES = {
  unit5: path.resolve(__dirname, '../src/data/units/unit5.json'),
  unit6: path.resolve(__dirname, '../src/data/units/unit6.json'),
  irregularVerbs: path.resolve(__dirname, '../src/data/irregularVerbs.json')
};

async function main() {
  for (const [docId, filePath] of Object.entries(CONTENT_FILES)) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    await firestore.collection('content').doc(docId).set(data);
    console.log(`Synced ${docId} from ${filePath}`);
  }
  console.log('Done.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Sync failed:', err);
    process.exit(1);
  });
