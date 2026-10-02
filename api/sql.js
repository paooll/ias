/**
 * MediCare Pro — SQL Query API (SECURED)
 * ✅ Constant query string with a bound parameter — no string concatenation
 * ✅ Explicit column list (no SELECT *, so SSNs and clinical notes are never returned)
 *
 * Since there is no real database behind this lab, query execution is SIMULATED.
 * The simulation mirrors what a driver does with a parameterized query: the input
 * is matched as a literal value, never parsed as SQL. Injection payloads therefore
 * match nothing instead of rewriting the WHERE clause.
 *
 * See ATTACK-LAB-RUNBOOK.md for the before/after payloads.
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

  // SECURE PATTERN — the query is a constant; the input is bound as a parameter.
  // With a real driver this would be:
  //   const rows = await db.execute(query, params);
  // The driver sends the SQL text and the value separately, so input can never
  // be parsed as syntax. "' OR '1'='1" is stored as that literal string and
  // matches no row, instead of rewriting the WHERE clause.
  const query = 'SELECT id, name, diagnosis FROM patients WHERE id = ?';
  const params = [input];

  // Stands in for the driver: match the bound value literally.
  const results = DB.patients
    .filter(p => String(p.id) === String(params[0]))
    // Explicit column list — SSNs and clinical notes are never selected.
    .map(p => ({ id: p.id, name: p.name, diagnosis: p.diagnosis }));

  return {
    query,
    params,
    results,
    tableName: 'patients',
    note: results.length
      ? '✅ Parameterized query — input bound as data, not executed as SQL.'
      : 'No matching patient. Injection payloads are treated as literal strings, so they match nothing.',
  };
}

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const rawId = req.query.id || '';

  const { query, params, results, tableName, note } = simulateSQLExecution(rawId);

  return res.status(200).json({
    query,       // Constant query text — safe to return, it contains no user input
    params,      // The bound parameter, so the lab can show what the driver received
    results,
    tableName,
    note,
    rowCount: results.length
  });
};
