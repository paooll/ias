# MediCare Pro — Hospital Management System

Demo hospital platform with **Firebase Firestore** as its cloud database and
**Firebase Authentication** for staff login. Many pages are intentional
security-learning labs (SQL injection, XSS, brute force, LFI, RCE, CSRF,
shell upload) — those keep their simulated, vulnerable behavior on purpose.

## What uses Firestore

| Collection     | Contents                                  | Used by                                        |
|----------------|-------------------------------------------|------------------------------------------------|
| `patients`     | 50 fictional patient records              | Dashboard (stats/occupancy), Patient Records (SQLi lab data), Patient Search |
| `staff`        | Staff profiles (uid, role, department)    | Login (`/api/login`), Profile Settings, sidebar |
| `notes`        | Clinical notes (stored-XSS lab, persistent)| Patient Notes page                             |
| `lab_reports`  | Lab results                               | Dashboard (Pending Lab Results stat)           |
| `activity`     | Recent activity feed                      | Dashboard                                      |

Everything degrades gracefully: if Firebase env vars are missing, pages fall
back to their original simulated/localStorage behavior, so the site works
before setup and as a pure lab environment.

## 1. Firebase Console setup

1. Go to <https://console.firebase.google.com> → **Add project** (or use an existing one).
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable** → Save.
3. **Build → Firestore Database → Create database** → choose production mode → pick a region (e.g. `europe-west1`).
4. **Project settings → General → Your apps → Web app (</>)** → register the app and copy the **web config values** (projectId, apiKey, authDomain, messagingSenderId, appId).
5. **Project settings → Service accounts → Generate new private key** → download the JSON file. **Keep it out of the repository** (`.gitignore` already excludes it).
6. **Firestore Database → Rules** → paste the contents of [`firestore.rules`](./firestore.rules) → **Publish**.

## 2. Environment variables

Copy `.env.example` values into the **Vercel dashboard**
(Project → Settings → Environment Variables) — and into a local `.env` only if
you run the seed script locally with them:

| Variable                    | Secret? | Used by                         |
|-----------------------------|---------|---------------------------------|
| `FIREBASE_PROJECT_ID`       | no      | Browser (via `/api/firebase-config`) |
| `FIREBASE_WEB_API_KEY`      | no*     | Browser + `/api/login`          |
| `FIREBASE_AUTH_DOMAIN`      | no      | Browser                         |
| `FIREBASE_MESSAGING_SENDER_ID` | no   | Browser                         |
| `FIREBASE_APP_ID`           | no      | Browser                         |
| `FIREBASE_SERVICE_ACCOUNT`  | **yes** | `/api/login`, seed script       |

\* The web API key is public by design for Firebase web apps; security comes
from the Firestore rules and Auth. The service account JSON is a full
credential — never commit it.

## 3. Seed the database (run once)

```bash
npm install
export FIREBASE_SERVICE_ACCOUNT='{paste the whole service-account JSON}'
# or: export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
npm run seed
```

This creates the Firebase Auth users and writes the fictional demo data:

| Username      | Password     | Role              |
|---------------|--------------|-------------------|
| `admin`       | `admin123`   | Administrator     |
| `doctor`      | `password1`  | Physician         |
| `nurse`       | `nurse123`   | Nurse             |
| `radiologist` | `xray2024`   | Radiologist       |
| `labtech`     | `lab2024`    | Lab Technician    |

## 4. Deploy to Vercel

```bash
vercel
```

Set the env vars from step 2 in the Vercel project first. `/api/*.js` are
serverless functions; `vercel.json` maps the routes.

## Testing locally

```bash
vercel dev          # full stack with serverless functions
npm run check       # syntax-checks the JS entry points
```

Log in with any seeded account (e.g. `admin / admin123`). Data you add — notes,
profile edits — persists in Firestore and survives refreshes.

## Security notes

- Firestore rules require **authentication** for every read/write; reference
  data (`patients`, `lab_reports`) is write-only via the Admin SDK (seed), and
  users can only modify their own notes/profile.
- No service-account credentials or private keys are committed to this repo.
- The intentionally vulnerable lab pages (SQLi, XSS, LFI, RCE, CSRF, upload)
  remain simulations on purpose for security training. In particular, the
  Patient Notes page renders note content with `innerHTML` — that is the
  stored-XSS lesson, so only use it with demo data.