const assert = require('node:assert/strict');
const test = require('node:test');
const handler = require('../api/feedback');

test('feedback expressions remain literal in the report', async () => {
  const payload = '${7*7}';
  let response;
  const res = {
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(body) { response = body; return this; },
  };

  await handler({ method: 'POST', body: {
    patientId: payload, rating: payload, reviewer: payload, comments: payload,
  } }, res);

  assert.equal(res.statusCode, 201);
  assert.match(response.report, /Patient: \$\{7\*7\}/);
  assert.match(response.report, /Rating: \$\{7\*7\}\/5/);
  assert.match(response.report, /Reviewer: \$\{7\*7\}/);
  assert.match(response.report, /Comments: \$\{7\*7\}/);
  assert.doesNotMatch(response.report, /49/);
});
