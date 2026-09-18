/**
 * MediCare Pro — Forgot Password API
 * ---------------------------------------------------------------------------
 * POST /api/forgot-password  { username }
 *
 * Looks up the staff profile by username and generates a Firebase Auth
 * password-reset link for the account's email. The link is returned in the
 * response so the demo works without an email service configured.
 *
 * If Firebase is not configured (no service account), returns a demo-mode
 * response listing the seeded credentials instead, so the sign-in page stays
 * fully functional in the pre-setup lab environment.
 */
const fs = require('fs');
const path = require('path');
let admin = null;
try {
  admin = require('firebase-admin');
} catch (e) {
  // firebase-admin not installed — demo fallback still works.
}

// Mirrors the legacy fallback users in api/login.js (Firebase not configured).
const DEMO_ACCOUNTS = {
  admin: { email: 'admin@medicare.ph', password: 'admin123' },
  doctor: { email: 'santos@medicare.ph', password: 'password1' },
  nurse: { email: 'reyes@medicare.ph', password: 'nurse123' },
  radiologist: { email: 'bautista@medicare.ph', password: 'xray2024' },
  labtech: { email: 'cruz@medicare.ph', password: 'lab2024' },
};

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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username } = req.body || {};
  if (!username || !String(username).trim()) {
    return res.status(400).json({ success: false, message: 'Username is required.' });
  }

  const firebaseApp = getAdmin();

  // ---- Firebase path: generate a real password-reset link ----------------
  if (firebaseApp) {
    try {
      const snap = await firebaseApp
        .firestore()
        .collection('staff')
        .where('username', '==', String(username).trim())
        .limit(1)
        .get();

      if (snap.empty) {
        // Same message shape as login, but do not confirm/deny account existence
        // more than the rest of the demo already does.
        return res.status(200).json({ success: false, message: 'User not found.' });
      }

      const staff = snap.docs[0].data();
      const link = await firebaseApp.auth().generatePasswordResetLink(staff.email, {
        url: `${req.protocol}://${req.get('host')}/index.html`,
      });

      console.log(`[FORGOT] Reset link generated for: ${username}`);
      return res.status(200).json({
        success: true,
        mode: 'firebase',
        message: `A password reset link was generated for ${staff.name} (${staff.email}). In production this would be emailed — in this demo it is shown below.`,
        resetLink: link,
      });
    } catch (e) {
      console.error('[FORGOT] Firebase error:', e.message);
      return res.status(500).json({ success: false, message: 'Password reset service unavailable. Please try again.' });
    }
  }

  // ---- Demo fallback (Firebase not configured) ---------------------------
  const account = DEMO_ACCOUNTS[String(username).trim().toLowerCase()];
  if (!account) {
    return res.status(200).json({ success: false, message: 'User not found.' });
  }

  console.log(`[FORGOT] Demo-mode reset requested for: ${username}`);
  return res.status(200).json({
    success: true,
    mode: 'demo',
    message: 'Demo mode: the hospital database is not connected, so this account uses its seeded demo password.',
    demoEmail: account.email,
    demoPassword: account.password,
  });
};
