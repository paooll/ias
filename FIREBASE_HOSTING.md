# Deploy MediCare Pro on Firebase Hosting

This project now deploys its static site through Firebase Hosting and routes
`/api/login` and `/api/firebase-config` to a second-generation Cloud Function.
Firestore remains the source of truth for the hospital data.

## 1. Prepare the Firebase project

Use the existing Firebase project that contains this application's Firestore
data. In the Firebase console:

1. Enable **Authentication > Email/Password**.
2. Confirm **Cloud Firestore** is enabled and publish `firestore.rules`.
3. Upgrade the project to the **Blaze** plan. Cloud Functions deployment
   requires it.

## 2. Sign in and select the project

From this project directory, run:

```powershell
npx firebase-tools login
npx firebase-tools use --add
```

Choose the existing project and give it an alias such as `production`.
The CLI creates `.firebaserc`; commit it only if sharing the project alias is
appropriate for the team.

## 3. Configure runtime values

Firebase Functions loads variables from the root `.env` file during deploy.
Ensure it contains the public web configuration:

```dotenv
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_WEB_API_KEY=your-web-api-key
FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
FIREBASE_MESSAGING_SENDER_ID=your-sender-id
FIREBASE_APP_ID=your-app-id
```

Do not add `FIREBASE_SERVICE_ACCOUNT` to Firebase Functions. The deployed
function uses its managed service account automatically. Keep any downloaded
service-account JSON file local and Git-ignored.

## 4. Test locally

```powershell
npm run emulate:firebase
```

Open the Hosting URL shown by the emulator (normally `http://127.0.0.1:5000`).
Sign in, then search for patient `50` on Patient Records. The record must come
from Firestore.

## 5. Deploy

```powershell
npm run check
npm run deploy:firebase
```

After the deployment completes, open:

```text
https://YOUR_PROJECT_ID.web.app
```

`/api/firebase-config` should return JSON with `configured: true`. Login,
patient records, notes, lab reports, profile updates, and documents are then
backed by Firestore.

## Security-lab routes

The public Firebase function intentionally exposes only the required login and
configuration routes. The other `/api/*` routes demonstrate SQL injection,
command execution, file inclusion, CSRF, unsafe upload, and XSS. Publishing
those endpoints on a public host would create a real security risk. Their UI
pages remain available as browser-side training simulations, while application
data continues to use Firestore.
