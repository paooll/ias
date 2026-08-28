/* MediCare Pro — App JS */

function renderSidebar(active) {
  const sections = [
    {
      label: 'Main',
      items: [
        { href: '../dashboard.html', icon: '📊', label: 'Dashboard', key: 'dashboard' },
      ]
    },
    {
      label: 'Patient Management',
      items: [
        { href: 'sql-injection.html', icon: '📋', label: 'Patient Records', key: 'sql-injection.html' },
        { href: 'sql-blind.html', icon: '🔍', label: 'Patient Verification', key: 'sql-blind.html' },
        { href: 'xss-reflected.html', icon: '🔎', label: 'Patient Search', key: 'xss-reflected.html' },
        { href: 'xss-stored.html', icon: '📝', label: 'Patient Notes', key: 'xss-stored.html' },
      ]
    },
    {
      label: 'Staff Portal',
      items: [
        { href: 'brute-force.html', icon: '🔑', label: 'Staff Login', key: 'brute-force.html' },
        { href: 'csrf.html', icon: '👤', label: 'Profile Settings', key: 'csrf.html' },
      ]
    },
    {
      label: 'Administration',
      items: [
        { href: 'file-inclusion.html', icon: '📁', label: 'Lab Reports', key: 'file-inclusion.html' },
        { href: 'command-execution.html', icon: '🖥️', label: 'System Diagnostics', key: 'command-execution.html' },
        { href: 'shell-upload.html', icon: '📤', label: 'Documents', key: 'documents' },
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
        <button class="btn btn-outline btn-sm" onclick="window.location.href='../index.html'">Sign Out</button>
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
