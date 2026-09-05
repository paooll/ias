/* MediCare Pro — App JS */

function renderSidebar(active) {
  // Determine base path: empty string if on root (dashboard.html), 'pages/' if inside pages/
  const isSubPage = window.location.pathname.includes('/pages/');
  const base = isSubPage ? '' : 'pages/';
  const dashHref = isSubPage ? '../dashboard.html' : 'dashboard.html';

  const sections = [
    {
      label: 'Main',
      items: [
        { href: dashHref, icon: '📊', label: 'Dashboard', key: 'dashboard' },
      ]
    },
    {
      label: 'Patient Management',
      items: [
        { href: base + 'sql-injection.html', icon: '📋', label: 'Patient Records', key: 'sql-injection.html' },
        { href: base + 'sql-blind.html', icon: '🔍', label: 'Patient Verification', key: 'sql-blind.html' },
        { href: base + 'xss-reflected.html', icon: '🔎', label: 'Patient Search', key: 'xss-reflected.html' },
        { href: base + 'xss-stored.html', icon: '📝', label: 'Patient Notes', key: 'xss-stored.html' },
      ]
    },
    {
      label: 'Staff Portal',
      items: [
        { href: base + 'brute-force.html', icon: '🔑', label: 'Staff Login', key: 'brute-force.html' },
        { href: base + 'csrf.html', icon: '👤', label: 'Profile Settings', key: 'csrf.html' },
      ]
    },
    {
      label: 'Administration',
      items: [
        { href: base + 'file-inclusion.html', icon: '📁', label: 'Lab Reports', key: 'file-inclusion.html' },
        { href: base + 'command-execution.html', icon: '🖥️', label: 'System Diagnostics', key: 'command-execution.html' },
        { href: base + 'shell-upload.html', icon: '📤', label: 'Documents', key: 'documents' },
      ]
    }
  ];

  const userData = JSON.parse(sessionStorage.getItem('mpro_user') || '{"name":"Administrator","role":"Admin"}');

  const navHTML = sections.map(section => `
    <div class="sidebar-section">
      <div class="sidebar-label">${section.label}</div>
      ${section.items.map(i => `
        <a href="${i.href}" class="nav-item ${active === i.key ? 'active' : ''}">
          <span class="nav-icon">${i.icon}</span> ${i.label}
        </a>
      `).join('')}
    </div>
  `).join('');

  return `
    <aside class="sidebar">
      <div class="sidebar-logo">
        <div class="logo-icon">🏥</div>
        <div class="logo-text">
          <span>MediCare Pro</span>
          <span>Healthcare Platform v3.2</span>
        </div>
      </div>
      ${navHTML}
      <div class="sidebar-footer">
        <div class="user-info">
          <div class="user-avatar">${(userData.name || 'A')[0].toUpperCase()}</div>
          <div class="user-meta">
            <span>${userData.name || 'Administrator'}</span>
            <span>${userData.role || 'Admin'}</span>
          </div>
        </div>
      </div>
    </aside>`;
}

function renderTopnav(title, subtitle) {
  const isSubPage = window.location.pathname.includes('/pages/');
  const logoutHref = isSubPage ? '../index.html' : 'index.html';
  const dashboardHref = isSubPage ? '../dashboard.html' : 'dashboard.html';
  const navigationAction = isSubPage
    ? `<a class="btn btn-outline btn-sm topnav-dashboard" href="${dashboardHref}">← Dashboard</a>`
    : '';

  return `
    <nav class="topnav">
      <div>
        <div class="topnav-title">${title}</div>
        <div class="topnav-subtitle">${subtitle}</div>
      </div>
      <svg class="topnav-ecg" viewBox="0 0 160 36" xmlns="http://www.w3.org/2000/svg">
        <path class="ecg-path" d="M0,18 L30,18 L38,18 L42,4 L46,32 L50,2 L54,34 L58,18 L90,18 L100,18 L104,4 L108,32 L112,2 L116,34 L120,18 L160,18"
          fill="none" stroke="#14b8a6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div class="topnav-right">
        <div class="status-dot">System Online</div>
        <span id="dbStatusMount"></span>
        ${navigationAction}
        <button class="btn btn-outline btn-sm" onclick="window.location.href='${logoutHref}'">Sign Out</button>
      </div>
    </nav>`;
}

function showResponse(id, content, isError = false) {
  const el = document.getElementById(id);
  el.classList.add('show');
  el.classList.toggle('error', isError);
  el.textContent = content;
}

function clearResponse(id) {
  const el = document.getElementById(id);
  el.classList.remove('show', 'error');
  el.textContent = '';
}

/* ── Shared UI helpers: modals, chips, patient detail ─────────────────────── */

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function humanSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return Math.round(bytes / 1024) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function statusChip(status) {
  const s = String(status == null ? '' : status);
  const low = s.toLowerCase();
  let cls = 'chip-gray';
  if (low === 'admitted' || low === 'completed' || low === 'active' || low === 'verified') cls = 'chip-teal';
  else if (low === 'pending' || low === 'in progress' || low === 'referred') cls = 'chip-orange';
  else if (low === 'critical' || low === 'rejected' || low === 'failed') cls = 'chip-red';
  else if (low === 'outpatient' || low === 'discharged') cls = 'chip-blue';
  return `<span class="chip ${cls}">${escapeHtml(s)}</span>`;
}

function openModal(opts) {
  closeModal();
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'mproModal';
  const title = opts.title || '';
  const subtitle = opts.subtitle ? `<div class="modal-subtitle">${opts.subtitle}</div>` : '';
  backdrop.innerHTML = `
    <div class="modal ${opts.large ? 'modal-lg' : ''}" role="dialog" aria-modal="true">
      <div class="modal-header">
        <div><div class="modal-title">${title}</div>${subtitle}</div>
        <button class="modal-x" onclick="closeModal()" aria-label="Close">✕</button>
      </div>
      <div class="modal-body">${opts.body || ''}</div>
      ${opts.footer ? `<div class="modal-footer">${opts.footer}</div>` : ''}
    </div>`;
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) closeModal(); });
  document.body.appendChild(backdrop);
  document.body.classList.add('modal-open');
}

function closeModal() {
  const b = document.getElementById('mproModal');
  if (b) b.remove();
  document.body.classList.remove('modal-open');
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

function kv(label, value, extraClass) {
  if (value == null || value === '') return '';
  return `<div class="kv"><div class="kv-label">${escapeHtml(label)}</div>` +
         `<div class="kv-value ${extraClass || ''}">${value}</div></div>`;
}

function patientDetailHTML(p) {
  if (!p) return '';
  const age = p.dob ? (new Date().getFullYear() - parseInt(String(p.dob).slice(0, 4), 10)) : null;
  const pid = p.patientId || (p.id != null ? 'P-' + String(p.id).padStart(3, '0') : '');
  const dob = p.dob ? `${p.dob}${age ? ' · ' + age + ' yrs' : ''}` : '';
  const allergies = Array.isArray(p.allergies) ? p.allergies.join(', ') : p.allergies;

  let html = kv('Patient ID', escapeHtml(pid || p.id));
  html += kv('Date of Birth', escapeHtml(dob));
  html += kv('Gender', escapeHtml(p.gender));
  html += kv('Blood Type', escapeHtml(p.bloodType));
  html += kv('Department', escapeHtml(p.department));
  html += kv('Ward / Room', escapeHtml([p.ward, p.room].filter(Boolean).join(' · ')));
  html += kv('Status', p.status ? statusChip(p.status) : '');
  html += kv('Physician', escapeHtml(p.physician));
  html += kv('Diagnosis', escapeHtml(p.diagnosis));
  html += kv('Medications', escapeHtml(p.medications));
  html += kv('Allergies', escapeHtml(allergies));
  html += kv('Phone', escapeHtml(p.phone));
  html += kv('Admitted', escapeHtml(p.admitDate));
  html += kv('Notes', escapeHtml(p.notes), 'notes');
  return html || '<p style="color:var(--gray-500);font-size:13px;">No additional details on record.</p>';
}

function openPatientModal(p) {
  if (!p) return;
  const name = p.name || 'Unknown Patient';
  const pid = p.patientId || (p.id != null ? 'P-' + String(p.id).padStart(3, '0') : '');
  openModal({
    title: '🩺 Patient Record',
    subtitle: `${escapeHtml(name)}${pid ? ' — ' + escapeHtml(pid) : ''}`,
    body: patientDetailHTML(p),
    footer: '<button class="btn btn-outline btn-sm" onclick="closeModal()">Close</button>',
  });
}
