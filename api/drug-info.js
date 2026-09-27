/*
 * MediCare Pro — Drug Information API (openFDA)
 * ---------------------------------------------------------------------------
 * GET /api/drug-info?name=amoxicillin
 * Server-side proxy to the free openFDA APIs (no key required):
 *   • /drug/label.json     — official FDA labeling (indications, warnings, dosage)
 *   • /drug/event.json     — reported adverse events (top reactions)
 * Caches successful responses in memory (1 h) and falls back gracefully when
 * openFDA is unreachable. Results are plain public drug data — nothing user-
 * specific is sent upstream.
 */
require('dotenv').config();

const LABEL_URL = 'https://api.fda.gov/drug/label.json';
const EVENT_URL = 'https://api.fda.gov/drug/event.json';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

const cache = new Map(); // name -> { at, data }

const pick = (v) => (Array.isArray(v) ? v.filter(Boolean).join(' ') : (v || ''));

function clean(text, max) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (max && s.length > max) return s.slice(0, max).trimEnd() + '…';
  return s;
}

async function fetchJson(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      // openFDA returns 404 for "no matches found" — treat as empty result.
      if (res.status === 404) return { notFound: true };
      throw new Error(`openFDA ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function lookup(name) {
  const q = encodeURIComponent(name);

  // ---- Official FDA label (indications, warnings, dosage, brand/generic) ----
  let label = null;
  const labelRes = await fetchJson(
    `${LABEL_URL}?search=openfda.generic_name:"${q}"+OR+openfda.brand_name:"${q}"&limit=1`
  );
  if (!labelRes.notFound && labelRes.results && labelRes.results[0]) {
    const r = labelRes.results[0];
    const fda = r.openfda || {};
    label = {
      brand: clean(pick(fda.brand_name), 80),
      generic: clean(pick(fda.generic_name), 80),
      manufacturer: clean(pick(fda.manufacturer_name), 80),
      purpose: clean(pick(r.purpose || r.indications_and_usage), 400),
      warnings: clean(pick(r.warnings || r.boxed_warning || r.drug_interactions), 400),
      dosage: clean(pick(r.dosage_and_administration), 300),
    };
  }

  // ---- Adverse events: top reported reactions for this drug ----
  let adverseEvents = [];
  let eventCount = null;
  const eventRes = await fetchJson(
    `${EVENT_URL}?search=patient.drug.medicinalproduct:"${q}"&count=patient.reaction.reactionmeddrapt.exact`
  );
  if (!eventRes.notFound && Array.isArray(eventRes.results)) {
    eventCount = eventRes.meta && eventRes.meta.results && eventRes.meta.results.total;
    adverseEvents = eventRes.results.slice(0, 8).map((r) => ({
      reaction: clean(r.term, 60),
      count: r.count,
    }));
  }

  if (!label && !adverseEvents.length) return null;
  return { label, adverseEvents, eventCount };
}

module.exports = async function drugInfo(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const name = String(req.query.name || '').trim().slice(0, 60);
  if (!name) return res.status(400).json({ error: 'Drug name is required' });

  const key = name.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) {
    return res.json({ drug: name, ...hit.data, cached: true });
  }

  try {
    const data = await lookup(name);
    if (!data) {
      return res.status(404).json({
        error: `No FDA records found for "${name}". Check the spelling or try the generic (scientific) name.`,
      });
    }
    cache.set(key, { at: Date.now(), data });
    return res.json({ drug: name, source: 'U.S. FDA openFDA', ...data });
  } catch (err) {
    console.error('Drug info error:', err.message);
    return res.status(502).json({
      error: 'The FDA drug database is unreachable right now. Please try again shortly.',
    });
  }
};
