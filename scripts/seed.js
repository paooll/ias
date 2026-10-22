/**
 * MediCare Pro — Firestore seed script
 * ---------------------------------------------------------------------------
 * Creates the Firebase Auth staff users and populates the Firestore collections
 * (patients, staff, notes, lab_reports, activity) with fictional demo data.
 *
 * Usage (from the project root):
 *   1. Set environment variables (see .env.example):
 *        FIREBASE_SERVICE_ACCOUNT='{...service account JSON...}'
 *      or
 *        GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   2. npm install
 *   3. npm run seed
 *
 * Safe to run multiple times — it skips Auth users that already exist and
 * overwrites the demo collections (they are seeded reference data).
 * ---------------------------------------------------------------------------
 */
require('dotenv').config();

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const { STAFF, PATIENTS, NOTES, LAB_REPORTS, ACTIVITY } = require('./seed-data');

// Metadata-only samples for the shared Documents screen. Real file uploads are
// added by the client and retain their own document IDs, so reseeding never
// removes them.
const DOCUMENTS = [
  { id: 'sample-consent-001', name: 'patient-consent-001.pdf', size: 124 * 1024, ext: 'pdf', type: 'application/pdf', uploader: 'Records Department', daysAgo: 1 },
  { id: 'sample-discharge-p002', name: 'discharge-summary-P002.docx', size: 87 * 1024, ext: 'docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', uploader: 'Dr. Santos', daysAgo: 2 },
  { id: 'sample-xray-p003', name: 'xray-chest-P003.jpg', size: 2458 * 1024, ext: 'jpg', type: 'image/jpeg', uploader: 'Radiology', daysAgo: 2 },
  { id: 'sample-billing-november', name: 'billing-november-2024.xlsx', size: 341 * 1024, ext: 'xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', uploader: 'Billing Department', daysAgo: 4 },
];

// ---- Init Admin SDK from environment (never from committed files) ----------
function initApp() {
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  const configuredPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const localKey = path.resolve(process.cwd(), 'service-account.json');
  const credPath = configuredPath || (fs.existsSync(localKey) ? localKey : '');

  if (saJson) {
    try {
      return admin.initializeApp({ credential: admin.credential.cert(JSON.parse(saJson)) });
    } catch (e) {
      console.error('[seed] FIREBASE_SERVICE_ACCOUNT is set but could not be parsed as JSON.');
      console.error('       Paste the ENTIRE service-account JSON file as the value, or use GOOGLE_APPLICATION_CREDENTIALS with a file path.');
      throw e;
    }
  }
  if (credPath) {
    return admin.initializeApp({ credential: admin.credential.cert(credPath) });
  }
  console.error('[seed] No credentials found. Set FIREBASE_SERVICE_ACCOUNT (JSON string) or GOOGLE_APPLICATION_CREDENTIALS (file path). See .env.example.');
  process.exit(1);
}

const app = initApp();
const db = app.firestore();
const auth = app.auth();

// Deterministic fictional extras so the data file stays compact.
const ssn = (id) => `${String(100 + id).padStart(3, '0')}-45-678${id % 10}`;
const phone = (id) => `0917-${String(100 + id * 37).padStart(3, '0')}-${String(id * 13).padStart(4, '0')}`;
const daysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

async function createAuthUser(staff) {
  try {
    const user = await auth.createUser({
      email: staff.email,
      password: staff.password,
      displayName: staff.name,
    });
    return user.uid;
  } catch (e) {
    if (e.code === 'auth/email-already-exists') {
      const user = await auth.getUserByEmail(staff.email);
      return user.uid;
    }
    throw e;
  }
}

async function main() {
  console.log('[seed] Filling collections for project:', app.options.projectId || '?');

  // 1) Firebase Auth users + staff profile docs ----------------------------
  const staffUid = {};
  for (const s of STAFF) {
    const uid = await createAuthUser(s);
    staffUid[s.username] = uid;
    await db.collection('staff').doc(uid).set({
      uid,
      username: s.username,
      email: s.email,
      name: s.name,
      role: s.role,
      department: s.department,
      active: true,
    });
    console.log(`[seed] Auth user + staff doc: ${s.username} <${s.email}>`);
  }

  // 2) Patients ------------------------------------------------------------
  let batch = db.batch();
  let ops = 0;
  const flush = async () => { await batch.commit(); batch = db.batch(); ops = 0; };

  for (const p of PATIENTS) {
    batch.set(db.collection('patients').doc(`P-${String(p.id).padStart(3, '0')}`), {
      id: p.id,
      patientId: `P-${String(p.id).padStart(3, '0')}`,
      name: p.name,
      dob: p.dob,
      age: new Date().getFullYear() - parseInt(p.dob.slice(0, 4), 10),
      gender: p.gender,
      ssn: ssn(p.id),
      phone: phone(p.id),
      bloodType: ['A+', 'B+', 'O+', 'AB+', 'O-', 'A-'][p.id % 6],
      diagnosis: p.diagnosis,
      department: p.department,
      ward: p.ward,
      room: p.room,
      status: p.status,
      admitDate: daysAgo(1 + (p.id % 30)),
      physician: p.physician,
      medications: p.medications,
      allergies: p.allergies,
      notes: p.notes,
    });
    ops++;
    if (ops >= 400) await flush();
  }
  await flush();
  console.log(`[seed] patients: ${PATIENTS.length} documents`);

  // 3) Notes ----------------------------------------------------------------
  const doctorUid = staffUid['doctor'] || staffUid['admin'];
  batch = db.batch(); ops = 0;
  for (let i = 0; i < NOTES.length; i++) {
    const n = NOTES[i];
    batch.set(db.collection('notes').doc(`note-${String(i + 1).padStart(2, '0')}`), {
      patient: n.patient,
      author: n.author,
      authorUid: doctorUid,
      content: n.content,
      createdAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - n.minutesAgo * 60000)),
    });
    ops++;
    if (ops >= 400) await flush();
  }
  await flush();
  console.log(`[seed] notes: ${NOTES.length} documents`);

  // 4) Lab reports -----------------------------------------------------------
  batch = db.batch(); ops = 0;
  for (const r of LAB_REPORTS) {
    batch.set(db.collection('lab_reports').doc(r.reportId), {
      ...r,
      createdAt: admin.firestore.Timestamp.fromDate(new Date(`${r.date}T08:00:00Z`)),
    });
    ops++;
    if (ops >= 400) await flush();
  }
  await flush();
  console.log(`[seed] lab_reports: ${LAB_REPORTS.length} documents`);

  // 5) Activity --------------------------------------------------------------
  batch = db.batch(); ops = 0;
  for (let i = 0; i < ACTIVITY.length; i++) {
    const a = ACTIVITY[i];
    batch.set(db.collection('activity').doc(`activity-${String(i + 1).padStart(2, '0')}`), {
      type: a.type,
      text: a.text,
      dept: a.dept,
      createdAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - a.minutesAgo * 60000)),
    });
    ops++;
    if (ops >= 400) await flush();
  }
  await flush();
  console.log(`[seed] activity: ${ACTIVITY.length} documents`);

  // 6) Shared document metadata --------------------------------------------
  batch = db.batch(); ops = 0;
  for (const d of DOCUMENTS) {
    batch.set(db.collection('documents').doc(d.id), {
      name: d.name,
      size: d.size,
      ext: d.ext,
      type: d.type,
      dataUrl: '',
      uploader: d.uploader,
      uploadedBy: 'system',
      createdAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - d.daysAgo * 86400000)),
    });
    ops++;
  }
  await flush();
  console.log(`[seed] documents: ${DOCUMENTS.length} metadata records`);

  console.log('\n[seed] Done. Demo login credentials:');
  for (const s of STAFF) console.log(`         ${s.username} / ${s.password}  (${s.name} — ${s.role})`);
  console.log('\n[seed] Next: publish firestore.rules in the Firebase console (Rules tab),');
  console.log('        then deploy the site to Vercel with the env vars from .env.example.');
}

main().catch((e) => {
  console.error('[seed] FAILED:', e.message);
  process.exit(1);
});
