/**
 * MediCare Pro — Reset the `patients` collection to its seed state.
 * ---------------------------------------------------------------------------
 * Restores all 50 patient documents from scripts/seed-data.js, undoing any
 * tampering done during the Bed Management (mass assignment) demo — e.g.
 * overwritten diagnosis/physician/status/room fields.
 *
 * Usage (same credentials as `npm run seed`):
 *   FIREBASE_SERVICE_ACCOUNT='{...}' node scripts/reset-patients.js
 *   # or
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json node scripts/reset-patients.js
 *   # optional: reset only some patients
 *   node scripts/reset-patients.js P-003 P-002
 *
 * Safe to run repeatedly. Preserves fields added by other demos that are not
 * part of the seed (only the seeded field values are overwritten), so any
 * extra junk fields from an attack demo are NOT removed — use `--prune` to
 * also delete fields that are not part of the seed data.
 */
require('dotenv').config();

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const { PATIENTS } = require('./seed-data');

const prune = process.argv.includes('--prune');
const onlyIds = process.argv
  .filter((a) => /^P-\d{3}$/.test(a.toUpperCase()))
  .map((a) => a.toUpperCase());

function initApp() {
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  const configuredPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const localKey = path.resolve(process.cwd(), 'service-account.json');
  const credPath = configuredPath || (fs.existsSync(localKey) ? localKey : '');

  if (saJson) {
    return admin.initializeApp({ credential: admin.credential.cert(JSON.parse(saJson)) });
  }
  if (credPath) {
    return admin.initializeApp({ credential: admin.credential.cert(credPath) });
  }
  console.error('[reset-patients] No credentials found.');
  console.error("  Set FIREBASE_SERVICE_ACCOUNT (the full service-account JSON string)");
  console.error("  or GOOGLE_APPLICATION_CREDENTIALS (path to the JSON file).");
  process.exit(1);
}

function patientDoc(p) {
  const pid = `P-${String(p.id).padStart(3, '0')}`;
  return {
    id: p.id,
    patientId: pid,
    name: p.name,
    dob: p.dob,
    age: new Date().getFullYear() - parseInt(p.dob.slice(0, 4), 10),
    gender: p.gender,
    ssn: `${String(100 + p.id).padStart(3, '0')}-45-678${p.id % 10}`,
    phone: `0917-${String(100 + p.id * 37).padStart(3, '0')}-${String(p.id * 13).padStart(4, '0')}`,
    bloodType: ['A+', 'B+', 'O+', 'AB+', 'O-', 'A-'][p.id % 6],
    diagnosis: p.diagnosis,
    department: p.department,
    ward: p.ward,
    room: p.room,
    status: p.status,
    admitDate: new Date(Date.now() - (1 + (p.id % 30)) * 86400000).toISOString().slice(0, 10),
    physician: p.physician,
    medications: p.medications,
    allergies: p.allergies,
    notes: p.notes,
  };
}

async function main() {
  const app = initApp();
  const db = app.firestore();

  const targets = onlyIds.length
    ? PATIENTS.filter((p) => onlyIds.includes(`P-${String(p.id).padStart(3, '0')}`))
    : PATIENTS;

  if (onlyIds.length && !targets.length) {
    console.error(`[reset-patients] No seed patients matched: ${onlyIds.join(', ')}`);
    process.exit(1);
  }

  console.log(`[reset-patients] Resetting ${targets.length} patient document(s)${prune ? ' (pruning extra fields)' : ''}...`);

  let batch = db.batch();
  let ops = 0;
  const flush = async () => { await batch.commit(); batch = db.batch(); ops = 0; };

  for (const p of targets) {
    const pid = `P-${String(p.id).padStart(3, '0')}`;
    const doc = patientDoc(p);
    const ref = db.collection('patients').doc(pid);

    if (prune) {
      // Full overwrite: seed fields only — any attacker-added fields vanish.
      batch.set(ref, doc);
    } else {
      // Merge: restore the seeded values but keep any extra fields intact.
      batch.set(ref, doc, { merge: true });
    }
    ops++;
    if (ops >= 400) await flush();
  }
  await flush();

  console.log(`[reset-patients] Done. ${targets.length} patient(s) restored to seed state.`);
  console.log('[reset-patients] Tip: re-run with --prune to also remove attacker-added fields.');
  console.log('[reset-patients] The Dashboard/Bed Management pages will reflect the reset immediately.');
}

main().catch((e) => {
  console.error('[reset-patients] FAILED:', e.message);
  process.exit(1);
});
