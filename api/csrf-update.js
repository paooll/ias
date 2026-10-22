/**
 * MediCare Pro — VULNERABLE CSRF Profile Update API
 * ❌ No CSRF token validation
 * ❌ No Origin/Referer check
 * ❌ CORS allows all origins
 * ❌ SameSite=None on session cookie
 *
 * Any website can forge a form submission to this endpoint
 * and it will be accepted as if the logged-in user submitted it.
 */

// In-memory profile storage (simulated)
let profileStore = {
  name: 'Dr. Admin',
  email: 'admin@medicare.ph',
  dept: 'Administration',
  password: '[hidden]'
};

module.exports = (req, res) => {
  // ❌ VULNERABLE: Allow all origins — no CORS restriction
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // ❌ No SameSite cookie attribute:
  // Set-Cookie: session=abc123; HttpOnly
  // A secure server would add: SameSite=Strict

  if (req.method === 'OPTIONS') return res.status(200).end();

  const data = req.body || {};

  // ❌ No CSRF token check at all — any origin can call this
  // ❌ No Referer/Origin header validation
  // ❌ No re-authentication required for password change

  if (data.name)     profileStore.name     = data.name;
  if (data.email)    profileStore.email    = data.email;
  if (data.dept)     profileStore.dept     = data.dept;
  if (data.password) profileStore.password = data.password;

  const requestOrigin = req.headers['origin'] || req.headers['referer'] || 'unknown';

  return res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    updatedBy: requestOrigin,          // Shows which origin made the change
    profile: profileStore,
    note: '⚠ CSRF: Request accepted from any origin without token verification!'
  });
};
