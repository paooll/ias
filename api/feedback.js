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

function esc(s) {
  return String(s == null ? '' : s);
}

/*
 * ⚠ VULNERABLE (SSTI lab) — do NOT copy this pattern.
 * Evaluates ${...} expressions from the merged template+context using
 * `new Function`, exactly like a naively-implemented template engine.
 * A safe implementation would escape user text or use a sandboxed renderer
 * with no expression evaluation of user-supplied strings.
 */
function renderTemplate(template, context) {
  const scope = Object.assign({}, context);
  const keys = Object.keys(scope);
  const values = keys.map((k) => scope[k]);
  // Replace ${...} tokens with evaluated expressions (user input included).
  return template.replace(/\$\{([^}]*)\}/g, (match, expr) => {
    try {
      const evalFn = new Function(...keys, `return (${expr});`);
      return esc(evalFn(...values));
    } catch (e) {
      return `[template error: ${e.message}]`;
    }
  });
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

    const patientId = esc(data.patientId || 'P-001').trim();
    if (!REVIEWS[patientId]) REVIEWS[patientId] = [];

    const review = {
      rating: esc(data.rating || '5'),
      reviewer: esc(data.reviewer || 'Anonymous Staff'),
      comments: esc(data.comments || ''),
      // Extra fields the client may send (department flags, follow-up prefs…)
      extra: data,
      submittedAt: new Date().toISOString(),
    };
    review.id = 'FB-' + String(1000 + Object.keys(REVIEWS).length).padStart(5, '0');
    REVIEWS[patientId].push(review);

    // "Report generated" — build and render the report template.
    // ⚠ VULNERABLE (SSTI lab): user input is concatenated INTO the template
    //    string before rendering, so ${...} expressions typed by the user
    //    are evaluated by the template engine instead of shown as text.
    const template = [
      '=== Patient Feedback Report ===',
      `Patient: ${patientId}`,
      `Rating: ${review.rating}/5`,
      `Reviewer: ${review.reviewer}`,
      'Comments: ' + review.comments,          // ← raw input enters the template
      `Reference: ${review.id}`,
      `Generated: ${review.submittedAt}`,
    ].join('\n');

    const report = renderTemplate(template, {
      patientId: patientId,
      rating: review.rating,
      reviewer: review.reviewer,
      reference: review.id,
      submittedAt: review.submittedAt,
    });

    return res.status(201).json({
      ok: true,
      message: 'Feedback recorded.',
      review: { id: review.id, rating: review.rating, reviewer: review.reviewer },
      report,
    });
  }

  // ---- Look up reviews for a patient --------------------------------------
  if (req.method === 'GET') {
    const pid = esc(req.query.patientId || '').trim();
    const list = REVIEWS[pid] || [];
    return res.status(200).json({ ok: true, patientId: pid, count: list.length, reviews: list });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
};
