const assert = require('node:assert/strict');
const test = require('node:test');
const handler = require('../api/sql');

function get(id) {
  let response;
  const res = {
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(body) {
      // Surface the status alongside the body so callers can assert both.
      response = Object.assign({ statusCode: res.statusCode }, body);
      return this;
    },
  };
  handler({ method: 'GET', query: { id }, body: {} }, res);
  return response;
}

test('a normal patient id still resolves', () => {
  const res = get('1');
  assert.equal(res.statusCode, 200);
  assert.equal(res.rowCount, 1);
  assert.equal(res.results[0].name, 'Maria Santos');
});

test('the P-000 form resolves too', () => {
  assert.equal(get('P-001').rowCount, 1);
});

test('the query text is a constant that never contains user input', () => {
  const payload = "0' UNION SELECT username,password,role FROM users--";
  const res = get(payload);
  assert.equal(res.query, 'SELECT id, patientId, name, diagnosis, department FROM patients WHERE id = ?');
  assert.ok(!res.query.includes(payload), 'user input must never reach the query string');
});

test('injection payloads are matched literally and return nothing', () => {
  const payloads = [
    "1' OR '1'='1",
    "1' OR '1'='1' --",
    "0' UNION SELECT username,password,role FROM users--",
    "0' UNION SELECT COUNT(*),1,1 FROM patients--",
    '1; DROP TABLE patients--',
    "0'; INSERT INTO users (username,password,role,email) VALUES ('backdoor','pwned123','Administrator','b@d.ph');--",
    "0'; UPDATE patients SET diagnosis='Severe Poisoning' WHERE id=1;--",
    "0'; DELETE FROM patients;--",
    "1' ORDER BY id DESC LIMIT 2",
    '1 OR 1=1',
  ];
  for (const payload of payloads) {
    assert.equal(get(payload).rowCount, 0, `payload must not match: ${payload}`);
  }
});

test('no write path exists — payloads cannot mutate the table', () => {
  const before = get('1').results[0].diagnosis;
  get("0'; UPDATE patients SET diagnosis='Severe Poisoning' WHERE id=1;--");
  assert.equal(get('1').results[0].diagnosis, before, 'records must be immutable through this endpoint');
});

test('no credentials or sensitive clinical fields are exposed', () => {
  const res = get('1');
  const body = JSON.stringify(res.results);
  assert.doesNotMatch(body, /password/i);
  assert.doesNotMatch(body, /ssn/i);
  assert.doesNotMatch(body, /notes/i);
  assert.ok(!('users' in res), 'there is no credential table to select from');
});

test('an empty id returns nothing rather than everything', () => {
  assert.equal(get('').rowCount, 0);
  assert.equal(get('   ').rowCount, 0);
});