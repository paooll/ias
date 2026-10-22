/**
 * MediCare Pro — VULNERABLE Blind SQL Injection API
 * ❌ Returns boolean result but injectable condition
 * ❌ Attacker infers data character by character
 */

const ADMIN_PW   = 'admin123';
const ADMIN_USER = 'admin';

const USERS = [
  { username: 'admin',       password: 'admin123',  role: 'Administrator' },
  { username: 'doctor',      password: 'password1', role: 'Physician' },
  { username: 'nurse',       password: 'nurse123',  role: 'Nurse' },
  { username: 'radiologist', password: 'xray2024',  role: 'Radiologist' },
];

function evaluateBlindCondition(input) {
  const lower = input.toLowerCase().trim();

  // Basic patient id check
  if (!lower.includes("'") && !lower.includes(' or ') && !lower.includes('and')) {
    const id = parseInt(input);
    return !isNaN(id) && id >= 1 && id <= 5;
  }

  // Injected conditions
  if (lower.includes('and 1=1')) return true;
  if (lower.includes('and 1=2')) return false;

  // LENGTH() check on admin password
  const lenMatch = input.match(/length\(.*?password.*?\)\s*[=><!]+\s*(\d+)/i);
  if (lenMatch) {
    const op = input.match(/length\(.*?\)\s*([=><!]+)\s*\d+/i)?.[1] || '=';
    const n = parseInt(lenMatch[1]);
    if (op === '=')  return ADMIN_PW.length === n;
    if (op === '>')  return ADMIN_PW.length > n;
    if (op === '>=') return ADMIN_PW.length >= n;
    if (op === '<')  return ADMIN_PW.length < n;
  }

  // SUBSTRING() check
  const subMatch = input.match(/substring\([^,]+,\s*(\d+)\s*,\s*(\d+)\)\s*=\s*'(.+?)'/i);
  if (subMatch) {
    const pos  = parseInt(subMatch[1]) - 1;
    const len  = parseInt(subMatch[2]);
    const char = subMatch[3];

    if (lower.includes('password') && lower.includes('admin')) {
      return ADMIN_PW.substr(pos, len) === char;
    }
    if (lower.includes('username')) {
      const u = lower.includes("where id=1") || lower.includes("limit 1")
        ? ADMIN_USER
        : ADMIN_USER;
      return u.substr(pos, len) === char;
    }
  }

  // User count check
  if (lower.includes('count') && lower.includes('users')) {
    const cntMatch = input.match(/count\(\*\)\s*([><=!]+)\s*(\d+)/i);
    if (cntMatch) {
      const op = cntMatch[1], n = parseInt(cntMatch[2]);
      if (op === '>') return USERS.length > n;
      if (op === '>=') return USERS.length >= n;
      if (op === '=') return USERS.length === n;
    }
  }

  // role check
  if (lower.includes("role") && lower.includes("admin")) return true;

  // General OR injection
  if (lower.includes(" or '1'='1") || lower.match(/ or 1=1/)) return true;

  // Default: try normal id
  const id = parseInt(input);
  return !isNaN(id) && id >= 1 && id <= 5;
}

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const rawInput = req.query.id || '';

  // ❌ VULNERABLE: only returns boolean but condition is injectable
  // Real query would be: SELECT id FROM patients WHERE id='${rawInput}'
  // Attacker can extend: 1' AND SUBSTRING((SELECT password FROM users WHERE username='admin'),1,1)='a'--

  const exists = evaluateBlindCondition(rawInput);

  return res.status(200).json({
    exists,
    // Don't return any data — just boolean (that's what makes it "blind")
    // Attacker must infer from true/false responses
  });
};
