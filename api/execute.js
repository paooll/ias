/**
 * MediCare Pro — VULNERABLE Command Execution API
 * ❌ Executes user input directly via shell
 * ❌ No input sanitization or whitelisting
 * ❌ Shell metacharacters (;, |, &, $(), ``) not stripped
 */
const { execSync } = require('child_process');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/plain');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ❌ VULNERABLE: user-controlled input passed directly to execSync
  const host = req.query.host || 'localhost';

  try {
    // ❌ String concatenation — shell metacharacters execute additional commands
    // e.g., host = "localhost; cat /etc/passwd" runs BOTH commands
    const output = execSync(`ping -c 2 -W 2 ${host} 2>&1`, {
      timeout: 10000,
      maxBuffer: 1024 * 1024
    });

    return res.status(200).send(output.toString());
  } catch (err) {
    // Even error output is returned — helps attacker know command executed
    return res.status(200).send(
      (err.stdout ? err.stdout.toString() : '') +
      (err.stderr ? err.stderr.toString() : err.message)
    );
  }
};
