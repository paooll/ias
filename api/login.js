/**
 * MediCare Pro — VULNERABLE Login API
 * ❌ No rate limiting
 * ❌ No account lockout
 * ❌ Passwords stored in plain text
 * ❌ No CAPTCHA
 * ❌ Verbose error messages
 */

// Simulated user database (plain text passwords — another vulnerability!)
const USERS = [
  { id: 1, username: 'admin',       password: 'admin123',  role: 'Administrator', name: 'Dr. Admin',       email: 'admin@medicare.ph' },
  { id: 2, username: 'doctor',      password: 'password1', role: 'Physician',     name: 'Dr. Santos',      email: 'santos@medicare.ph' },
  { id: 3, username: 'nurse',       password: 'nurse123',  role: 'Nurse',         name: 'Nurse Reyes',     email: 'reyes@medicare.ph' },
  { id: 4, username: 'radiologist', password: 'xray2024',  role: 'Radiologist',   name: 'Dr. Bautista',    email: 'bautista@medicare.ph' },
];

// ❌ No rate limit state (would need Redis/DB for persistence, but we track in-memory)
const attempts = {};

module.exports = async (req, res) => {
  // Allow CORS from anywhere — another vulnerability
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required' });
  }

  // ❌ VULNERABLE: No rate limiting — unlimited attempts
  // A secure implementation would:
  //   1. Track attempts per IP with express-rate-limit
  //   2. Lock account after 5 failed attempts
  //   3. Use bcrypt to compare hashed passwords
  //   4. Add CAPTCHA after 3 failures

  const user = USERS.find(u => u.username === username && u.password === password);

  if (user) {
    // Log successful login (but don't return sensitive fields)
    console.log(`[LOGIN] Success: ${username} @ ${new Date().toISOString()}`);
    const { password: _, ...safeUser } = user;
    return res.status(200).json({ success: true, user: safeUser });
  }

  // ❌ VULNERABLE: Verbose error — confirms username exists vs wrong password
  const userExists = USERS.find(u => u.username === username);
  const message = userExists
    ? 'Incorrect password. Please try again.'  // ← reveals username is valid!
    : 'User not found.';                        // ← reveals username is invalid!

  console.log(`[LOGIN] Failed: ${username} @ ${new Date().toISOString()}`);
  return res.status(200).json({ success: false, message });
};
