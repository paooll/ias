/**
 * MediCare Pro — VULNERABLE Stored XSS API
 * ❌ Notes stored with NO sanitization
 * ❌ Notes returned raw — client renders with innerHTML
 * ❌ No Content Security Policy header
 */

// In-memory note storage (resets on cold start)
const notes = [
  {
    id: 1,
    patient: 'P-001',
    author: 'Dr. Santos',
    content: 'Patient reports chest discomfort. ECG scheduled.',  // Safe note
    time: '09:15 AM'
  }
];

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // ❌ No CSP header — a secure server would add:
  // res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'");

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const { patient, content, author } = req.body || {};

    if (!content) {
      return res.status(400).json({ error: 'Content required' });
    }

    // ❌ VULNERABLE: Store content as-is, no sanitization
    // A secure server would use DOMPurify server-side or escape HTML entities:
    // const safe = content.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const note = {
      id: notes.length + 1,
      patient: patient || 'P-001',
      author: author || 'Anonymous',
      content: content,   // ← raw, unsanitized — XSS payload stored here!
      time: new Date().toLocaleTimeString()
    };

    notes.push(note);

    return res.status(201).json({
      success: true,
      note,
      notes,  // Return all notes (including any XSS payloads stored)
      warning: '⚠ Content stored without sanitization — XSS payload will execute for every viewer!'
    });
  }

  if (req.method === 'GET') {
    return res.status(200).json({ notes });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
