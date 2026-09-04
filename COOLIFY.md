# Deploy with Coolify

This repository includes a Dockerfile that runs MediCare Pro on port `3000`.
Coolify serves the container behind its HTTPS proxy. Firebase Authentication
and Cloud Firestore remain the database and identity providers.

## Before deployment

1. Push this project to a private Git repository. Confirm `.env` and
   `service-account.json` are not committed.
2. Have a Coolify server with a domain name connected to it.
3. In Firebase Console, enable Email/Password Authentication and publish the
   project's `firestore.rules`.

## Create the application

1. In Coolify, create a project and environment, then choose **New Resource**.
2. Select your Git repository (use GitHub App or a deploy key for a private
   repository).
3. Choose the **Dockerfile** build pack. Leave **Base Directory** as `/` and
   set **Dockerfile Location** to `Dockerfile`.
4. Set the exposed port to `3000`.
5. Add your domain in Coolify and enable HTTPS.

## Runtime environment variables

Add these in Coolify's Environment Variables section as **runtime** values:

```dotenv
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_WEB_API_KEY=your-web-api-key
FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
FIREBASE_MESSAGING_SENDER_ID=your-sender-id
FIREBASE_APP_ID=your-app-id
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
```

Mark `FIREBASE_SERVICE_ACCOUNT` as a secret and paste the complete service
account JSON on one line. Do not make any of these values build variables.

## Deploy and verify

Click **Deploy**. Once it is healthy, open:

```text
https://your-domain.example/healthz
https://your-domain.example/api/firebase-config
```

The first URL should return `{"ok":true}`; the second should include
`"configured":true`. Then sign in and search Patient Records for `50`.

The public container deliberately exposes only `/api/login` and
`/api/firebase-config`. The other API files are vulnerable cybersecurity lab
examples and must not be exposed on an Internet-facing service.
