/**
 * MediCare Pro — VULNERABLE File Inclusion API
 * ❌ User-supplied path passed directly to fs.readFileSync
 * ❌ No path sanitization or directory restriction
 * ❌ Allows reading ANY file on the server filesystem
 */
const fs   = require('fs');
const path = require('path');

// Simulated files for environments where the real FS won't have these
const SIMULATED = {
  '/etc/passwd': `root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
sys:x:3:3:sys:/dev:/usr/sbin/nologin
sync:x:4:65534:sync:/bin:/bin/sync
www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin
mysql:x:111:115:MySQL Server,,,:/nonexistent:/bin/false
medicare:x:1000:1000:MediCare App,,,:/home/medicare:/bin/bash
postgres:x:113:117:PostgreSQL administrator,,,:/var/lib/postgresql:/bin/bash`,

  '/etc/shadow': `root:$6$rounds=65536$longsalt$hashedpasswordhere:19500:0:99999:7:::
www-data:!:19500::::::
medicare:$6$xK9mLpQr$M7b2verylonghashhere1234567890:19500:0:99999:7:::`,

  '/etc/hosts': `127.0.0.1   localhost
127.0.1.1   medicare-server.local
::1         localhost
10.0.0.1    db.internal.medicare.ph
10.0.0.2    redis.internal
10.0.0.5    admin.internal.medicare.ph`,

  '/proc/version': `Linux version 5.15.0-91-generic (buildd@lcy02-amd64-030) (gcc (Ubuntu 11.4.0) 11.4.0) #101-Ubuntu SMP Tue Nov 14 13:30:08 UTC 2023`,

  '.env': `# MediCare Pro — Production Environment
NODE_ENV=production
PORT=3000
DB_HOST=10.0.0.1
DB_USER=medicare_app
DB_PASS=Sup3rS3cr3tPa\$\$w0rd!
JWT_SECRET=xK9mLpQrYt2VnWs5
SMTP_PASS=emailP@ss123
STRIPE_SECRET=sk_live_EXPOSED_STRIPE_KEY
AWS_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE
AWS_SECRET=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`,
};

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // ❌ VULNERABLE: filePath is ENTIRELY user-controlled
  const filePath = req.query.path || req.query.file || '';

  if (!filePath) {
    return res.status(400).send('No file path specified');
  }

  // ❌ No sanitization, no restriction to a safe base directory
  // A secure implementation would:
  //   const base = path.resolve('./reports');
  //   const resolved = path.resolve(base, filePath);
  //   if (!resolved.startsWith(base)) return res.status(403).send('Access denied');

  // Normalize the path (traversal still works because we don't restrict the base)
  const normalized = path.normalize(filePath).replace(/^(\.\.\/)+/, (match) => {
    // Still vulnerable — just normalizes the path format, not the traversal
    return match;
  });

  try {
    // Try reading the actual file first (works in some environments)
    const content = fs.readFileSync(normalized, 'utf8');
    return res.status(200).send(content);
  } catch (err) {
    // Fall back to simulated content for known sensitive paths
    const sim = SIMULATED[normalized] || SIMULATED[filePath];
    if (sim) {
      return res.status(200).send(sim);
    }

    // ❌ Full error returned to client — reveals file system structure
    return res.status(200).send(
      `[File Inclusion Error]\nPath: ${filePath}\nError: ${err.message}\n\n` +
      `(In a real vulnerable server, this path would be read from disk.\n` +
      `Try preset paths like: ../../../etc/passwd)`
    );
  }
};
