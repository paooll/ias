/*
 * Production server for Docker/Coolify.
 *
 * The browser continues to access Firebase Auth and Firestore directly. This
 * server supplies the two server-only endpoints needed to create an Auth
 * session and return the public Firebase web configuration.
 */
require('dotenv').config();

const express = require('express');
const path = require('path');

const app = express();
const root = __dirname;
const routes = {
  login: require('./api/login'),
  'firebase-config': require('./api/firebase-config'),
};

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.get('/healthz', (_req, res) => res.status(200).json({ ok: true }));

app.all('/api/:route', async (req, res, next) => {
  const handler = routes[req.params.route];
  if (!handler) {
    return res.status(404).json({
      error: 'Not found',
      message: 'This API route is unavailable on the public deployment.',
    });
  }
  try {
    return await handler(req, res);
  } catch (error) {
    return next(error);
  }
});

// Never make project configuration or credentials downloadable, even if a
// future static-file rule changes.
app.use((req, res, next) => {
  const blocked = new Set([
    '/service-account.json', '/package.json', '/package-lock.json',
    '/firebase.json', '/firestore.rules', '/Dockerfile', '/.env',
  ]);
  return blocked.has(req.path) ? res.sendStatus(404) : next();
});

app.use(express.static(root, { dotfiles: 'deny', index: 'index.html' }));

app.use((_req, res) => res.status(404).send('Not found'));
app.use((error, _req, res, _next) => {
  console.error('Unhandled request error:', error.message);
  res.status(500).json({ error: 'Internal server error' });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, '0.0.0.0', () => console.log(`MediCare Pro listening on port ${port}`));
