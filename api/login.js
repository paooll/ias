/**
 * MediCare Pro — Staff Login API
 * ---------------------------------------------------------------------------
 * Backed by Firebase Authentication (Email/Password):
 *   1. Looks up the staff profile in Firestore by username.
 *   2. Signs the user in via the Firebase Auth REST API (web API key).
 *   3. Creates a short-lived custom token (Admin SDK) that the client uses to
 *      establish a persisted SDK session so Firestore works on later pages.
 *
 * Kept intentionally "verbose" (username-exists vs wrong-password) because the
 * brute-force lab page teaches about that. Firebase Auth itself rate-limits
 * sign-in attempts, which is the real-world mitigation for brute forcing.
 *
 * If Firebase env vars are NOT configured, it falls back to the legacy
 * in-memory users so the site still works before setup (graceful degradation).
 */
const fs = require('fs');
const path = require('path');
let admin = null;
try {
  admin = require('firebase-admin');
} catch (e) {
  // firebase-admin not installed locally — legacy fallback still works.
}

// Legacy fallback users (used only when Firebase is not configured)
const LEGACY_USERS = [
  { id: 1, username: 'admin',       password: 'admin123',  role: 'Administrator', name: 'Dr. Admin',    email: 'admin@medicare.ph' },
  { id: 2, username: 'doctor',      password: 'password1', role: 'Physician',     name: 'Dr. Santos',   email: 'santos@medicare.ph' },
  { id: 3, username: 'nurse',       password: 'nurse123',  role: 'Nurse',         name: 'Nurse Reyes',  email: 'reyes@medicare.ph' },
  { id: 4, username: 'radiologist', password: 'xray2024',  role: 'Radiologist',   name: 'Dr. Bautista', email: 'bautista@medicare.ph' },
];

function legacyLogin(username, password) {
  const user = LEGACY_USERS.find((u) => u.username === username && u.password === password);
  if (user) {
    const { password: _pw, ...safeUser } = user;
    return { success: true, user: safeUser, message: null };
  }
  const userExists = LEGACY_USERS.find((u) => u.username === username);
  return {
    success: false,
    message: userExists ? 'Incorrect password. Please try again.' : 'User not found.',
  };
}

function getAdmin() {
  if (!admin) return null;
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  const configuredPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const localKey = path.resolve(process.cwd(), 'service-account.json');
  const saPath = configuredPath || (fs.existsSync(localKey) ? localKey : '');
  if (!saJson && !saPath) return null;

  if (admin.apps.length === 0) {
    if (saJson && String(saJson).trim().startsWith('{')) {
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(saJson)) });
    } else if (saPath && String(saPath).trim().startsWith('{')) {
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(saPath)) });
    } else if (saPath) {
      // File path (or Application Default Credentials via the env var).
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

  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required' });
  }

  const firebaseApp = getAdmin();
  const apiKey = process.env.FIREBASE_WEB_API_KEY;

  // ---- Firebase path (configured) ---------------------------------------
  if (firebaseApp && apiKey) {
    try {
      // 1) Find staff profile by username (Admin SDK bypasses rules on purpose)
      const staffSnap = await firebaseApp
        .firestore()
        .collection('staff')
        .where('username', '==', username)
        .limit(1)
        .get();

      if (staffSnap.empty) {
        console.log(`[LOGIN] Failed (no such user): ${username} @ ${new Date().toISOString()}`);
        return res.status(200).json({ success: false, message: 'User not found.' });
      }
      const staff = staffSnap.docs[0].data();

      // 2) Sign in with Firebase Auth REST API
      const authRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: staff.email, password, returnSecureToken: true }),
        }
      );
      const authData = await authRes.json();

      if (authData.error) {
        const knownUser = staffSnap.size > 0; // staff doc exists -> valid username
        console.log(`[LOGIN] Failed: ${username} @ ${new Date().toISOString()} (${authData.error.message})`);
        return res.status(200).json({
          success: false,
          message: knownUser ? 'Incorrect password. Please try again.' : 'User not found.',
        });
      }

      // 3) Custom token so the browser SDK session persists (Firestore access)
      const customToken = await firebaseApp.auth().createCustomToken(authData.localId);

      const safeUser = {
        uid: authData.localId,
        username: staff.username,
        name: staff.name,
        role: staff.role,
        department: staff.department || '',
        email: staff.email,
      };

      console.log(`[LOGIN] Success: ${username} @ ${new Date().toISOString()}`);
      return res.status(200).json({ success: true, user: safeUser, token: authData.idToken, customToken });
    } catch (e) {
      console.error('[LOGIN] Firebase error:', e.message);
      return res.status(500).json({ success: false, message: 'Authentication service unavailable. Please try again.' });
    }
  }

  // ---- Legacy fallback path (Firebase not configured) --------------------
  const result = legacyLogin(username, password);
  console.log(`[LOGIN] ${result.success ? 'Success' : 'Failed'}: ${username} @ ${new Date().toISOString()}`);
  return res.status(200).json(result);
};
