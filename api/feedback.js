/*
 * Patient Feedback API — accepts survey submissions from staff.
 * ---------------------------------------------------------------------------
 * POST /api/feedback  { patientId, rating, comments, ... }
 * GET  /api/feedback?patientId=P-001
 *
 * Stores submissions in memory and echoes the structured review back.
 * (Fictional demo data only.)
 */

const REVIEWS = {};

function asText(s) {
  return String(s == null ? '' : s);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ---- Submit a review ----------------------------------------------------
  if (req.method === 'POST') {
    const body = req.body || {};

    // Support both JSON and form-encoded submissions.
    let data = body;
    if (typeof body === 'string') {
      try { data = JSON.parse(body); } catch (e) { data = {}; }
    }

    const patientId = asText(data.patientId || 'P-001').trim();
    if (!REVIEWS[patientId]) REVIEWS[patientId] = [];

    const review = {
      rating: asText(data.rating || '5'),
      reviewer: asText(data.reviewer || 'Anonymous Staff'),
      comments: asText(data.comments || ''),
      // Extra fields the client may send (department flags, follow-up prefs…)
      extra: data,
      submittedAt: new Date().toISOString(),
    };
    review.id = 'FB-' + String(1000 + Object.keys(REVIEWS).length).padStart(5, '0');
    REVIEWS[patientId].push(review);

    // Build the report as plain text. Feedback is data, never template code.
    const report = [
      '=== Patient Feedback Report ===',
      `Patient: ${patientId}`,
      `Rating: ${review.rating}/5`,
      `Reviewer: ${review.reviewer}`,
      `Comments: ${review.comments}`,
      `Reference: ${review.id}`,
      `Generated: ${review.submittedAt}`,
    ].join('\n');

    return res.status(201).json({
      ok: true,
      message: 'Feedback recorded.',
      review: { id: review.id, rating: review.rating, reviewer: review.reviewer },
      report,
    });
  }

  // ---- Look up reviews for a patient --------------------------------------
  if (req.method === 'GET') {
    const pid = asText(req.query.patientId || '').trim();
    const list = REVIEWS[pid] || [];
    return res.status(200).json({ ok: true, patientId: pid, count: list.length, reviews: list });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
};
