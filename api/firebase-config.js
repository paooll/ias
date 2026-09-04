/**
 * MediCare Pro — Firebase Web Config endpoint
 * ---------------------------------------------------------------------------
 * Returns the PUBLIC Firebase web configuration to the browser (it is not a
 * secret — Firebase web apps ship this config; security comes from Firestore
 * rules + Auth). Keeping it in an endpoint means the repository never contains
 * the values and they can be set per-environment in Vercel.
 *
 * Returns { configured: false } when env vars are missing so the site knows to
 * fall back to its simulated/local demo behavior.
 */
module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const projectId = process.env.FIREBASE_PROJECT_ID || '';
  const configured = Boolean(projectId && process.env.FIREBASE_WEB_API_KEY);

  return res.status(200).json({
    configured,
    apiKey: process.env.FIREBASE_WEB_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || (projectId ? `${projectId}.firebaseapp.com` : ''),
    projectId,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || (projectId ? `${projectId}.appspot.com` : ''),
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || '',
  });
};