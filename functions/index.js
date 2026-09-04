/* Firebase Hosting bridge for the production authentication/data routes. */
const { onRequest } = require('firebase-functions/v2/https');

const routes = {
  'firebase-config': require('../api/firebase-config'),
  login: require('../api/login'),
};

exports.api = onRequest({ region: 'asia-east1' }, async (req, res) => {
  const route = String(req.path || '').replace(/^\/api\/?/, '').replace(/\/$/, '');
  const handler = routes[route];

  if (!handler) {
    return res.status(404).json({
      error: 'Not found',
      message: 'This API route is unavailable on the public Firebase deployment.',
    });
  }

  return handler(req, res);
});
