/**
 * MediCare Pro — Patient lookup API (SECURED)
 * =========================================================================
 * ✅ Constant query string with a bound parameter — no string concatenation
 * ✅ Read-only: no INSERT / UPDATE / DELETE / DROP path exists in this file
 * ✅ Explicit column list — SSNs and clinical notes are never selected
 * ✅ No credential table on the server at all
 *
 * This endpoint is only a fallback for when Firestore is unreachable. The
 * Patient Records page reads Firestore directly (see
 * pages/sql-injection.html); it only calls this route as a last resort.
 *
 * There is no database driver in this project, so the query is simulated the
 * way a driver would behave: the input is matched as a *literal value*, never
 * parsed as syntax. "1' OR '1'='1" is compared against patient ids as that
 * exact string and therefore matches nothing.
 *
 * See SQLI-ATTACK-INSTRUCTIONS.md for the payloads this used to accept.
 */

// Offline fallback records, used only when Firestore is unavailable. Clinical
// fields are intentionally absent — the page reads those from Firestore.
const DB = {
  patients: [
    { id: 1, patientId: 'P-001', name: 'Maria Santos',    diagnosis: 'Hypertension',            department: 'Cardiology' },
    { id: 2, patientId: 'P-002', name: 'Juan Dela Cruz',  diagnosis: 'Diabetes Type 2',         department: 'Endocrinology' },
    { id: 3, patientId: 'P-003', name: 'Ana Reyes',       diagnosis: 'Bronchial Asthma',        department: 'Pulmonology' },
    { id: 4, patientId: 'P-004', name: 'Pedro Bautista',  diagnosis: 'Rheumatoid Arthritis',    department: 'Rheumatology' },
    { id: 5, patientId: 'P-005', name: 'Rosario Garcia',  diagnosis: 'Coronary Artery Disease', department: 'Cardiology' },
  ],
};

const QUERY = 'SELECT id, patientId, name, diagnosis, department FROM patients WHERE id = ?';

// An exact match against a numeric id, or the P-000 formatted identifier.
// Anything else — including injection payloads — is simply not equal.
function findPatient(input) {
  const term = String(input == null ? '' : input).trim();
  if (!term) return null;

  return DB.patients.find(
    (p) => String(p.id) === term || String(p.patientId).toLowerCase() === term.toLowerCase()
  ) || null;
}

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const rawId = req.query.id || '';

  // ✅ SECURE — the query text is a constant and the value is bound as data.
  // With a real driver this would be: await db.execute(QUERY, [rawId]);
  const params = [String(rawId)];
  const match = findPatient(params[0]);

  const results = match ? [match] : [];

  return res.status(200).json({
    query: QUERY,        // Constant query text — safe to return, no user input.
    params,              // The bound value, so callers can see what was matched.
    results,
    tableName: 'patients',
    note: results.length
      ? 'Parameterized lookup — the value was bound as data, not executed as SQL.'
      : 'No matching patient. The value is compared literally, so injection payloads match nothing.',
    rowCount: results.length,
  });
};