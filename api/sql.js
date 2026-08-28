/**
 * MediCare Pro — VULNERABLE SQL Query API
 * ❌ User input directly concatenated into SQL query string
 * ❌ No prepared statements / parameterized queries
 * ❌ Full error messages returned to client
 *
 * Since we don't have a real DB in this Vercel function,
 * we SIMULATE the SQL execution to demonstrate the vulnerability.
 */

// Simulated in-memory database
const DB = {
  patients: [
    { id: 1, name: 'Maria Santos',    diagnosis: 'Hypertension',             ssn: '123-45-6789', notes: 'Monthly checkups required. Medication: Amlodipine 5mg daily.' },
    { id: 2, name: 'Juan Dela Cruz',  diagnosis: 'Diabetes Type 2',          ssn: '987-65-4321', notes: 'Insulin dependent. Monitor fasting glucose daily. HbA1c quarterly.' },
    { id: 3, name: 'Ana Reyes',       diagnosis: 'Bronchial Asthma',         ssn: '456-78-9012', notes: 'Carry salbutamol inhaler. Avoid dust and allergens.' },
    { id: 4, name: 'Pedro Bautista',  diagnosis: 'Rheumatoid Arthritis',     ssn: '321-54-9870', notes: 'Physical therapy twice weekly. NSAIDs prescribed.' },
    { id: 5, name: 'Rosario Garcia',  diagnosis: 'Coronary Artery Disease',  ssn: '654-32-1098', notes: 'Aspirin 75mg daily. Restrict strenuous activity.' },
  ],
  users: [
    { id: 1, username: 'admin',       password: 'admin123',  role: 'Administrator', email: 'admin@medicare.ph' },
    { id: 2, username: 'doctor',      password: 'password1', role: 'Physician',     email: 'santos@medicare.ph' },
    { id: 3, username: 'nurse',       password: 'nurse123',  role: 'Nurse',         email: 'reyes@medicare.ph' },
    { id: 4, username: 'radiologist', password: 'xray2024',  role: 'Radiologist',   email: 'bautista@medicare.ph' },
  ]
};

function simulateSQLExecution(rawInput) {
  const input = rawInput || '';
  const lower = input.toLowerCase();
  const query = `SELECT * FROM patients WHERE id = '${input}'`;

  let results = [];
  let tableName = 'patients';
  let note = '';

  // Detect UNION injection targeting users table
  if (lower.includes('union') && lower.includes('users')) {
    results = DB.users;
    tableName = 'users (UNION injected)';
    note = '⚠ UNION injection — users table dumped!';
  }
  // OR-based dump all
  else if (
    lower.includes("' or '1'='1") ||
    lower.includes("' or 1=1") ||
    (lower.includes(' or ') && lower.includes('1=1')) ||
    lower.match(/'.*or.*'1'.*='1/i)
  ) {
    results = DB.patients;
    tableName = 'patients (all rows)';
    note = '⚠ OR injection — WHERE clause bypassed, all rows returned!';
  }
  // Comment injection
  else if (lower.match(/'.*-{2}/) || lower.match(/'.*#/)) {
    const idPart = parseInt(input);
    const found = DB.patients.find(p => p.id === (isNaN(idPart) ? 1 : idPart));
    results = found ? [found] : [DB.patients[0]];
    note = '⚠ Comment injection — remainder of query ignored.';
  }
  // Boolean false (AND 1=2)
  else if (lower.includes('and 1=2')) {
    results = [];
    note = 'Boolean false condition — no rows returned.';
  }
  // DROP TABLE
  else if (lower.includes('drop table') || lower.includes('truncate')) {
    results = [];
    note = '💥 DDL injection detected! Would destroy data in a real database.';
  }
  // Stacked queries
  else if (lower.includes(';')) {
    const id = parseInt(input);
    const found = !isNaN(id) ? DB.patients.find(p => p.id === id) : null;
    results = found ? [found] : [];
    note = '⚠ Stacked query attempt detected. In MySQL, only first query runs.';
  }
  // Normal numeric ID
  else {
    const id = parseInt(input);
    if (!isNaN(id)) {
      const found = DB.patients.find(p => p.id === id);
      results = found ? [found] : [];
    }
  }

  return { query, results, tableName, note };
}

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const rawId = req.query.id || '';

  // ❌ VULNERABLE: This is what the query would look like:
  // const query = `SELECT * FROM patients WHERE id = '${rawId}'`;
  // db.execute(query); // → SQL injection!

  const { query, results, tableName, note } = simulateSQLExecution(rawId);

  return res.status(200).json({
    query,       // Return the actual (vulnerable) query — bad practice but educational
    results,
    tableName,
    note,
    rowCount: results.length
  });
};
