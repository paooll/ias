/**
 * MediCare Pro — Google Sign-In API
 * ---------------------------------------------------------------------------
 * POST /api/google-login  { idToken }
 *
 * The browser signs in with Firebase Auth's Google provider and posts the
 * resulting ID token here. We verify it with the Firebase Admin SDK, then
 * create or update the matching `staff` profile in Firestore (the same
 * collection the username/password flow uses), so Google users get a real
 * database-backed account with a role.
 *
 * Requires the same environment as /api/login:
 *   FIREBASE_SERVICE_ACCOUNT (or GOOGLE_APPLICATION_CREDENTIALS)
 */
const fs = require('fs');
const path = require('path');
let admin = null;
try {
  admin = require('firebase-admin');
} catch (e) {
  // firebase-admin not installed — Google sign-in cannot be verified.
}

function getAdmin() {
  if (!admin) return null;
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  const configuredPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const localKey = path.resolve(process.cwd(), 'service-account.json');
  const saPath = configuredPath || (fs.existsSync(localKey) ? localKey : '');
  const firebaseRuntime = Boolean(process.env.K_SERVICE || process.env.FUNCTION_TARGET || process.env.FUNCTIONS_EMULATOR);
  if (!saJson && !saPath && !firebaseRuntime) return null;

  if (admin.apps.length === 0) {
    if (saJson && String(saJson).trim().startsWith('{')) {
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(saJson)) });
    } else if (saPath && String(saPath).trim().startsWith('{')) {
      admin.initializeApp({ credential: admin.credential.cert(saPath) });
    } else if (saPath) {
      admin.initializeApp({ credential: admin.credential.cert(saPath) });
    } else {
      admin.initializeApp();
    }
  }
  return admin.apps.length ? admin : null;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const firebaseApp = getAdmin();
  if (!firebaseApp) {
    return res.status(503).json({
      success: false,
      message: 'Google Sign-In is unavailable because Firebase is not configured on the server.',
    });
  }

  const { idToken } = req.body || {};
  if (!idToken || !String(idToken).trim()) {
    return res.status(400).json({ success: false, message: 'Missing Google ID token.' });
  }

  try {
    // 1) Verify the Google ID token issued to the browser session.
    const decoded = await firebaseApp.auth().verifyIdToken(String(idToken));
    const uid = decoded.uid;
    const email = (decoded.email || '').toLowerCase();
    const displayName = decoded.name || (email ? email.split('@')[0] : 'Staff Member');

    if (!email) {
      return res.status(400).json({ success: false, message: 'The Google account does not expose an email address.' });
    }

    const db = firebaseApp.firestore();

    // 2) Link to an existing staff profile by email (created by the seed script
    //    or a previous login), otherwise create a new profile for this account.
    const byEmail = await db.collection('staff').where('email', '==', email).limit(1).get();

    let profile;
    if (!byEmail.empty) {
      profile = byEmail.docs[0].data();
      // Keep the profile reachable at the auth uid so the account works even
      // when the Google uid differs from the seeded profile document id.
      await db.collection('staff').doc(uid).set({
        ...profile,
        uid,
        email,
        lastLoginProvider: 'google',
        lastLoginAt: new Date().toISOString(),
      }, { merge: true });
    } else {
      profile = {
        uid,
        username: email.split('@')[0],
        email,
        name: displayName,
        role: 'Staff',
        department: 'General',
        active: true,
      };
      await db.collection('staff').doc(uid).set({
        ...profile,
        lastLoginProvider: 'google',
        lastLoginAt: new Date().toISOString(),
      }, { merge: true });
    }

    const safeUser = {
      uid,
      username: profile.username || email.split('@')[0],
      name: displayName || profile.name,
      role: profile.role || 'Staff',
      department: profile.department || '',
      email,
      provider: 'google',
      picture: decoded.picture || '',
    };

    console.log(`[GOOGLE] Success: ${email} (${safeUser.role}) @ ${new Date().toISOString()}`);
    return res.status(200).json({ success: true, user: safeUser });
  } catch (e) {
    console.error('[GOOGLE] Verification error:', e.message);
    return res.status(401).json({ success: false, message: 'Google sign-in could not be verified. Please try again.' });
  }
};
