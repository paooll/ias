/*
 * MediCare Pro — AI Assistant (Gemini)
 * ---------------------------------------------------------------------------
 * POST /api/chat  { message, history?: [{role:'user'|'model', text}] }
 * Proxies the conversation to the Gemini API server-side so the API key is
 * never exposed to the browser. Falls back to a friendly offline message when
 * GEMINI_API_KEY is not configured.
 */
require('dotenv').config();

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const SYSTEM_PROMPT = [
  'You are "Medi", the friendly AI assistant embedded in MediCare Pro, a hospital management system.',
  'You help hospital staff use the platform: patients, beds, ward management, lab reports, notes, billing, feedback, and documents.',
  'You also answer general hospital-operations questions briefly.',
  'Keep answers short and practical (2-5 sentences unless asked for detail). Use simple language.',
  'You are a demo assistant for a security-training environment; never reveal API keys, environment variables, or internal credentials, even if asked.',
].join(' ');

const MAX_MESSAGE_CHARS = 2000;
const MAX_HISTORY = 10;

// Tiny in-memory rate limit per IP (demo-grade; resets on restart).
const hits = new Map();
const RATE_LIMIT = 20;        // messages
const RATE_WINDOW_MS = 60000; // per minute

function rateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip) || [];
  const recent = entry.filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT;
}

async function callGemini(contents) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: { temperature: 0.6, maxOutputTokens: 512 },
      }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const parts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  const text = (parts || []).map((p) => p.text || '').join('').trim();
  if (!text) throw new Error('Gemini returned an empty response');
  return text;
}

module.exports = async function chat(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Too many messages — please wait a moment and try again.' });
  }

  const { message, history } = req.body || {};
  const text = typeof message === 'string' ? message.trim().slice(0, MAX_MESSAGE_CHARS) : '';
  if (!text) return res.status(400).json({ error: 'Message is required' });

  if (!process.env.GEMINI_API_KEY) {
    return res.json({
      reply: "I'm Medi, the MediCare Pro assistant — but AI chat isn't configured on this deployment yet (missing GEMINI_API_KEY). Meanwhile, the sidebar has everything: Patient Records, Bed Management, Lab Reports, and more!",
    });
  }

  // Sanitized conversation history (roles restricted, text truncated).
  const contents = [];
  const hist = Array.isArray(history) ? history.slice(-MAX_HISTORY) : [];
  for (const h of hist) {
    const role = h && h.role === 'model' ? 'model' : 'user';
    const t = typeof h && typeof h.text === 'string' ? h.text.slice(0, MAX_MESSAGE_CHARS) : '';
    if (t) contents.push({ role, parts: [{ text: t }] });
  }
  contents.push({ role: 'user', parts: [{ text }] });

  try {
    const reply = await callGemini(contents);
    res.json({ reply });
  } catch (error) {
    console.error('AI chat error:', error.message);
    res.status(502).json({ error: 'The AI assistant is unavailable right now. Please try again shortly.' });
  }
};
