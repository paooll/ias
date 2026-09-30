/* MediCare Pro — Medi AI Assistant (floating chat widget)
 * ---------------------------------------------------------------------------
 * Self-contained vanilla-JS widget: a glass-styled bubble in the corner that
 * opens a themed chat panel. Talks to POST /api/chat (Gemini, server-side key).
 * Included by each page via <script src="js/chat-widget.js"></script>
 */
(function () {
  'use strict';
  if (window.mproChatLoaded) return;
  window.mproChatLoaded = true;

  var isSubPage = window.location.pathname.includes('/pages/');
  var iconBase = isSubPage ? '../assets/icons/' : 'assets/icons/';
  function iconUrl(name) { return iconBase + name + '.png'; }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var history = null; // assigned below from persisted state — sent to /api/chat for context

  /* ---- Styles (scoped, injected once) ---- */
  var css = [
    '.mpro-chat-fab{position:fixed;right:22px;bottom:22px;z-index:9998;width:56px;height:56px;',
    'border-radius:50%;border:none;cursor:pointer;display:grid;place-items:center;',
    'background:linear-gradient(135deg,#0d9488,#2563eb);color:#fff;',
    'box-shadow:0 10px 30px rgba(13,148,136,.35);transition:transform .2s cubic-bezier(.34,1.4,.64,1),box-shadow .2s;}',
    '.mpro-chat-fab:hover{transform:translateY(-3px) scale(1.05);box-shadow:0 14px 36px rgba(13,148,136,.45);}',
    '.mpro-chat-fab img{filter:brightness(0) invert(1);width:24px;height:24px;}',
    '.mpro-chat-panel{position:fixed;right:22px;bottom:90px;z-index:9999;width:min(370px,calc(100vw - 32px));',
    'height:min(520px,calc(100vh - 130px));display:none;flex-direction:column;overflow:hidden;',
    'border-radius:20px;border:1px solid rgba(255,255,255,.5);',
    'background:rgba(255,255,255,.85);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);',
    'box-shadow:0 24px 60px rgba(15,23,42,.25),inset 0 1px 0 rgba(255,255,255,.6);',
    'font-family:Quicksand,sans-serif;animation:mproChatIn .25s cubic-bezier(.34,1.4,.64,1);}',
    'html[data-theme=dark] .mpro-chat-panel{background:rgba(15,23,42,.85);border-color:rgba(255,255,255,.12);box-shadow:0 24px 60px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.08);}',
    '@keyframes mproChatIn{from{opacity:0;transform:translateY(14px) scale(.97);}to{opacity:1;transform:none;}}',
    '.mpro-chat-panel.open{display:flex;}',
    '.mpro-chat-head{display:flex;align-items:center;gap:10px;padding:14px 16px;',
    'background:linear-gradient(120deg,rgba(13,148,136,.16),rgba(37,99,235,.12));border-bottom:1px solid rgba(148,163,184,.25);}',
    '.mpro-chat-head .mpro-ava{width:34px;height:34px;border-radius:12px;display:grid;place-items:center;flex-shrink:0;',
    'background:linear-gradient(135deg,#0d9488,#2563eb);}',
    '.mpro-chat-head .mpro-ava img{filter:brightness(0) invert(1);width:18px;height:18px;}',
    '.mpro-chat-head .mpro-t{font-size:14px;font-weight:700;color:#0f172a;line-height:1.1;}',
    'html[data-theme=dark] .mpro-chat-head .mpro-t{color:#f1f5f9;}',
    '.mpro-chat-head .mpro-s{font-size:11px;color:#64748b;font-weight:600;}',
    'html[data-theme=dark] .mpro-chat-head .mpro-s{color:#a8b4c8;}',
    '.mpro-chat-head .mpro-status{margin-left:auto;width:8px;height:8px;border-radius:50%;background:#10b981;box-shadow:0 0 0 3px rgba(16,185,129,.18);}',
    '.mpro-chat-x{margin-left:10px;border:none;background:rgba(148,163,184,.18);color:#64748b;width:26px;height:26px;border-radius:9px;',
    'font-size:12px;line-height:1;cursor:pointer;flex-shrink:0;display:grid;place-items:center;transition:background .15s,color .15s,transform .15s;font-family:inherit;font-weight:700;}',
    '.mpro-chat-x:hover{background:rgba(220,38,38,.14);color:#dc2626;transform:scale(1.08);}',
    'html[data-theme=dark] .mpro-chat-x{background:rgba(148,163,184,.14);color:#cbd5e1;}',
    '.mpro-chat-body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;}',
    '.mpro-chat-body::-webkit-scrollbar{width:6px;}',
    '.mpro-chat-body::-webkit-scrollbar-thumb{background:rgba(100,116,139,.35);border-radius:6px;}',
    '.mpro-msg{max-width:82%;padding:10px 13px;border-radius:14px;font-size:13px;line-height:1.5;',
    'font-weight:500;white-space:pre-wrap;word-wrap:break-word;animation:mproMsgIn .2s ease;}',
    '@keyframes mproMsgIn{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}',
    '.mpro-msg.user{align-self:flex-end;background:linear-gradient(135deg,#0d9488,#0f766e);color:#fff;border-bottom-right-radius:4px;}',
    '.mpro-msg.bot{align-self:flex-start;background:rgba(15,23,42,.06);color:#1e293b;border-bottom-left-radius:4px;}',
    'html[data-theme=dark] .mpro-msg.bot{background:#263449;color:#f1f5f9;}',
    '.mpro-msg.bot.thinking{color:#64748b;font-style:italic;}',
    'html[data-theme=dark] .mpro-msg.bot.thinking{color:#a8b4c8;}',
    '.mpro-chat-input{display:flex;gap:8px;padding:12px;border-top:1px solid rgba(148,163,184,.25);}',
    '.mpro-chat-input input{flex:1;border:1px solid rgba(148,163,184,.35);background:rgba(255,255,255,.7);',
    'border-radius:12px;padding:10px 13px;font-size:13px;font-family:inherit;font-weight:500;color:#1e293b;outline:none;transition:border-color .15s,box-shadow .15s;}',
    'html[data-theme=dark] .mpro-chat-input input{background:rgba(38,52,73,.6);border-color:rgba(148,163,184,.25);color:#f1f5f9;}',
    '.mpro-chat-input input:focus{border-color:#0d9488;box-shadow:0 0 0 3px rgba(13,148,136,.15);}',
    '.mpro-chat-input button{border:none;border-radius:12px;width:42px;flex-shrink:0;cursor:pointer;display:grid;place-items:center;',
    'background:linear-gradient(135deg,#0d9488,#2563eb);transition:transform .15s,filter .15s;}',
    '.mpro-chat-input button:hover{transform:scale(1.06);}',
    '.mpro-chat-input button:disabled{opacity:.55;cursor:not-allowed;transform:none;}',
    '.mpro-chat-input button img{filter:brightness(0) invert(1);width:16px;height:16px;}',
    '.mpro-chat-err{align-self:center;font-size:11px;font-weight:700;color:#dc2626;background:rgba(220,38,38,.1);',
    'border:1px solid rgba(220,38,38,.3);border-radius:99px;padding:4px 12px;}',
  ].join('');

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  /* ---- DOM ---- */
  var fab = el('button', 'mpro-chat-fab');
  fab.type = 'button';
  fab.setAttribute('aria-label', 'Open Medi AI assistant');
  fab.innerHTML = '<img src="' + iconUrl('lightning-bolt') + '" alt="" draggable="false">';

  var panel = el('div', 'mpro-chat-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Medi AI assistant');
  panel.innerHTML =
    '<div class="mpro-chat-head">' +
      '<div class="mpro-ava"><img src="' + iconUrl('stethoscope') + '" alt="" draggable="false"></div>' +
      '<div><div class="mpro-t">Medi Assistant</div><div class="mpro-s">Powered by Gemini AI</div></div>' +
      '<div class="mpro-status" title="AI connected"></div>' +
      '<button type="button" class="mpro-chat-x" aria-label="Close chat">✕</button>' +
    '</div>' +
    '<div class="mpro-chat-body"></div>' +
    '<div class="mpro-chat-input">' +
      '<input type="text" placeholder="Ask Medi anything…" maxlength="2000" aria-label="Message">' +
      '<button type="submit" aria-label="Send"><img src="' + iconUrl('forward') + '" alt="" draggable="false"></button>' +
    '</div>';

  var body = panel.querySelector('.mpro-chat-body');
  var input = panel.querySelector('input');
  var sendBtn = panel.querySelector('.mpro-chat-input button');
  var closeBtn = panel.querySelector('.mpro-chat-x');

  function closePanel() {
    panel.classList.remove('open');
    fab.style.display = 'grid';
  }
  closeBtn.addEventListener('click', closePanel);

  function addMsg(cls, text) {
    var m = el('div', 'mpro-msg ' + cls, esc(text));
    body.appendChild(m);
    body.scrollTop = body.scrollHeight;
    state.msgs.push({ cls: cls, text: text });
    return m;
  }

  var STORE_KEY = 'mpro_chat_state';
  var state = { msgs: [], history: [] }; // persisted across pages via sessionStorage
  try {
    var saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null');
    if (saved && Array.isArray(saved.msgs)) state = saved;
  } catch (e) { /* corrupted state — start fresh */ }
  history = Array.isArray(state.history) ? state.history : [];

  function persist() {
    try {
      // Keep the stored transcript bounded just like the API history.
      if (state.msgs.length > 40) state.msgs = state.msgs.slice(-40);
      if (state.history.length > 10) state.history = state.history.slice(-10);
      sessionStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) { /* storage unavailable */ }
  }

  function restore() {
    if (!state.msgs.length) return false;
    // Re-render saved messages into the DOM without re-saving them (render-only).
    state.msgs.forEach(function (m) {
      var e2 = el('div', 'mpro-msg ' + m.cls, esc(m.text));
      body.appendChild(e2);
    });
    body.scrollTop = body.scrollHeight;
    return true;
  }

  var greeted = state.msgs.length > 0; // no re-greeting when history exists
  function greet() {
    if (greeted) return;
    greeted = true;
    addMsg('bot', "Hi, I'm Medi — the MediCare Pro AI assistant. Ask me about patients, beds, wards, lab reports, or how to use any feature of this platform.");
    persist();
  }

  function setBusy(busy) {
    sendBtn.disabled = busy;
    input.disabled = busy;
  }

  function send() {
    var text = input.value.trim();
    if (!text || sendBtn.disabled) return;
    input.value = '';
    addMsg('user', text);
    var think = addMsg('bot thinking', 'Medi is thinking…');
    setBusy(true);

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: history }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        think.remove();
        if (res.ok && res.d.reply) {
          addMsg('bot', res.d.reply);
          history.push({ role: 'user', text: text });
          history.push({ role: 'model', text: res.d.reply });
          persist();
        } else {
          addMsg('bot', (res.d && res.d.error) || 'Sorry — something went wrong. Please try again.');
        }
      })
      .catch(function () {
        think.remove();
        addMsg('bot', "I couldn't reach the server. Check your connection and try again.");
        persist();
      })
      .then(function () { setBusy(false); input.focus(); });
  }

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });

  fab.addEventListener('click', function () {
    var open = panel.classList.toggle('open');
    fab.style.display = open ? 'none' : 'grid';
    if (open) { greet(); input.focus(); }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && panel.classList.contains('open')) closePanel();
  });

  function mount() {
    document.body.appendChild(panel);
    document.body.appendChild(fab);
    restore(); // show the conversation from previous pages
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
