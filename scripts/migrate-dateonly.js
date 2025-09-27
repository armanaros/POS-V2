/**
 * migrate-dateonly.js
 *
 * Scans the 'operations' collection and ensures each document has a 'dateOnly' field (YYYY-MM-DD)
 * Usage:
 *   node scripts/migrate-dateonly.js --dry
 *   node scripts/migrate-dateonly.js --apply
 *
 * Note: requires GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_ADMIN_SDK_PATH to be set to a service account JSON
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

async function initAdmin() {
  try {
    const saPath = process.env.FIREBASE_ADMIN_SDK_PATH || path.join(__dirname, '..', 'serviceAccountKey.json');
    if (fs.existsSync(saPath)) {
      const svc = require(saPath);
      admin.initializeApp({ credential: admin.credential.cert(svc) });
      console.log('Initialized firebase-admin using', saPath);
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp();
      console.log('Initialized firebase-admin using GOOGLE_APPLICATION_CREDENTIALS');
    } else {
      throw new Error('Service account not found. Set FIREBASE_ADMIN_SDK_PATH or GOOGLE_APPLICATION_CREDENTIALS');
    }
  } catch (e) {
    console.error('Failed to initialize firebase-admin:', e);
    process.exit(1);
  }
}

function formatLocalDateOnly(d) {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function run({ apply }) {
  await initAdmin();
  const db = admin.firestore();
  const col = db.collection('operations');
  const snapshot = await col.get();
  console.log('Found', snapshot.size, 'operations');

  let toUpdate = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    let dateOnly = data.dateOnly;
    if (!dateOnly) {
      if (data.date) {
        dateOnly = (typeof data.date === 'string' ? data.date.split('T')[0] : formatLocalDateOnly(data.date));
      } else if (data.createdAt && data.createdAt.toDate) {
        dateOnly = formatLocalDateOnly(data.createdAt.toDate());
      } else if (data.createdAt) {
        dateOnly = formatLocalDateOnly(data.createdAt);
      }
    }
    if (!dateOnly) {
      dateOnly = formatLocalDateOnly(new Date());
    }

    if (data.dateOnly !== dateOnly) {
      toUpdate.push({ id: doc.id, current: data.dateOnly, shouldBe: dateOnly });
    }
  });

  console.log('Documents to update:', toUpdate.length);
  if (toUpdate.length === 0) {
    console.log('Nothing to do. Exiting.');
    process.exit(0);
  }

  if (!apply) {
    console.log('Dry-run mode. Use --apply to perform updates. Sample of changes:');
    console.table(toUpdate.slice(0, 20));
    process.exit(0);
  }

  console.log('Applying updates...');
  const batch = db.batch();
  for (const u of toUpdate) {
    const ref = col.doc(u.id);
    batch.update(ref, { dateOnly: u.shouldBe });
  }
  await batch.commit();
  console.log('Applied updates to', toUpdate.length, 'documents.');
  process.exit(0);
}

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const dry = args.includes('--dry') || !apply;

run({ apply }).catch(e => {
  console.error('Migration failed:', e);
  process.exit(1);
});
