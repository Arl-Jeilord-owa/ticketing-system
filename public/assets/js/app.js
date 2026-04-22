// ══════════════════════════════════════════════════
//  UTILITIES
// ══════════════════════════════════════════════════
function $(id) { return document.getElementById(id); }

function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = `
      position:fixed;bottom:24px;right:24px;z-index:9999;
      background:var(--text-primary);color:var(--bg-primary);
      padding:10px 18px;border-radius:var(--radius-md);font-size:13px;
      box-shadow:var(--shadow-md);opacity:0;transform:translateY(8px);
      transition:opacity .2s,transform .2s;pointer-events:none;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
  }, 3000);
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

const DEPARTMENTS = [
  'Admin - HR',
  'Admin - FU',
  'MD - Network Management',
  'Maintenance (MD)',
  'General Office (GO)',
  'Technical Service (TS)',
  'Engineering (ED)',
  'Planning & Design (PD)',
  'Warehouse (WH)',
  'Sales',
  'IQS',
  'Purchasing (PU)',
  'Accounting'
];

// ══════════════════════════════════════════════════
//  AUTH MODULE
// ══════════════════════════════════════════════════
const Auth = (() => {
  let currentUser = null;

  function showError(id, msg) {
    const el = $(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  function clearError(id) {
    const el = $(id);
    if (el) el.classList.add('hidden');
  }

  function bootApp(user) {
    currentUser = user;

    $('auth-gate')?.classList.add('hidden');
    $('app-shell')?.classList.remove('hidden');

    if ($('session-info')) {
      $('session-info').textContent = `${user.name} · ${user.empRole}`;
    }

    if (user.empRole === 'admin') {
      document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = '';
      });
    }

    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        const view = item.dataset.view;
        $('view-title').textContent = viewTitles[view] || view;
        renderView(view);
      });
    });

    renderView('dashboard');
  }

  async function handleEmployeeLogin() {
    clearError('emp-error');

    const email = ($('emp-email')?.value || '').trim();
    const password = ($('emp-password')?.value || '');

    if (!email || !password) {
      showError('emp-error', 'Email and password are required.');
      return;
    }

    const btn = $('btn-employee-login');
    btn.disabled = true;
    btn.textContent = 'Signing in…';

    try {
      const res = await fetch('/api/auth/employee-login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        showError('emp-error', data.error || 'Login failed.');
        return;
      }

      bootApp(data.user);
    } catch (err) {
      console.error('[employee-login]', err);
      showError('emp-error', 'Server error. Please try again.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  }

  async function checkSession() {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.user) bootApp(data.user);
    } catch {}
  }

  async function handleSignOut() {
    try {
      await fetch('/api/auth/signout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {}
    location.reload();
  }

  function bindUI() {
    $('btn-employee-login')?.addEventListener('click', handleEmployeeLogin);

    $('toggle-pw')?.addEventListener('click', () => {
      const input = $('emp-password');
      const show = $('pw-eye-show');
      const hide = $('pw-eye-hide');
      if (!input) return;

      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      show?.classList.toggle('hidden', isPassword);
      hide?.classList.toggle('hidden', !isPassword);
    });

    $('emp-password')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') handleEmployeeLogin();
    });

    $('btn-signout')?.addEventListener('click', handleSignOut);
  }

  function init() {
    bindUI();
    checkSession();
  }

  return {
    init,
    getCurrentUser: () => currentUser,
    handleSignOut
  };
})();

// ══════════════════════════════════════════════════
//  VIEW ROUTING
// ══════════════════════════════════════════════════
const viewTitles = {
  dashboard: 'Dashboard',
  all: 'All Tickets',
  internal: 'Internal Tickets',
  resolved: 'Resolved',
  employees: 'Employees',
  mail: 'Mail'
};

function renderView(view) {
  const area = $('content-area');
  if (!area) return;

  if (view === 'dashboard') {
    renderDashboard(area);
    return;
  }

  if (view === 'employees') {
    if (Auth.getCurrentUser()?.empRole !== 'admin') {
      area.innerHTML = `
        <div style="padding:24px;background:var(--bg-primary);border:0.5px solid var(--border-default);border-radius:var(--radius-lg);font-size:14px;color:var(--text-secondary)">
          Only admin users can access the Employees dashboard.
        </div>
      `;
      return;
    }
    renderEmployeesView(area);
    return;
  }

  if (view === 'mail') {
    renderMailView(area);
    return;
  }

  area.innerHTML = `
    <div style="color:var(--text-tertiary);font-size:14px;padding:20px">
      View "<strong>${esc(view)}</strong>" coming soon.
    </div>
  `;
}

// ══════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════
async function renderDashboard(area) {
  const user = Auth.getCurrentUser();
  const isAdmin = user?.empRole === 'admin';

  area.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">Employee Role</div>
        <div class="stat-value blue">${esc(user?.empRole || 'employee')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Department</div>
        <div class="stat-value amber">${esc(user?.dept || '—')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Account Name</div>
        <div class="stat-value green" style="font-size:20px">${esc(user?.name || '—')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Access</div>
        <div class="stat-value red" style="font-size:18px">${isAdmin ? 'Admin Panel' : 'Employee Panel'}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:16px;margin-top:8px;">
      <div style="background:var(--bg-primary);border:0.5px solid var(--border-default);border-radius:var(--radius-lg);padding:18px;">
        <div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:8px;">
          Employee Dashboard
        </div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.7;">
          Welcome to the OMTPI HelpDesk employee workspace.
        </div>

        <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-primary" id="dash-open-mail">Open Mail</button>
          ${isAdmin ? `<button class="btn" id="dash-open-employees">Manage Employees</button>` : ''}
        </div>
      </div>

      <div style="background:var(--bg-primary);border:0.5px solid var(--border-default);border-radius:var(--radius-lg);padding:18px;">
        <div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:8px;">
          Quick Info
        </div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.7;">
          Email: <strong>${esc(user?.email || '—')}</strong><br>
          Department: <strong>${esc(user?.dept || '—')}</strong><br>
          Role: <strong>${esc(user?.empRole || '—')}</strong>
        </div>
      </div>
    </div>
  `;

  $('dash-open-mail')?.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const mailNav = document.querySelector('.nav-item[data-view="mail"]');
    mailNav?.classList.add('active');
    $('view-title').textContent = 'Mail';
    renderMailView($('content-area'));
  });

  $('dash-open-employees')?.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const empNav = document.querySelector('.nav-item[data-view="employees"]');
    empNav?.classList.add('active');
    $('view-title').textContent = 'Employees';
    renderEmployeesView($('content-area'));
  });
}

// ══════════════════════════════════════════════════
//  EMPLOYEES VIEW
// ══════════════════════════════════════════════════
async function renderEmployeesView(area) {
  area.innerHTML = `<div style="color:var(--text-tertiary);font-size:13px">Loading employees…</div>`;

  let employees = [];
  try {
    const res = await fetch('/api/employees', { credentials: 'include' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load employees.');
    employees = data.employees || [];
  } catch (err) {
    area.innerHTML = `
      <div style="color:var(--color-red-400);font-size:13px;padding:20px">
        Failed to load employees: ${esc(err.message)}
      </div>
    `;
    return;
  }

  const isAdmin = Auth.getCurrentUser()?.empRole === 'admin';

  const total = employees.length;
  const activeCount = employees.filter(emp => emp.active).length;
  const adminCount = employees.filter(emp => emp.role === 'admin').length;
  const deptCount = new Set(employees.map(emp => emp.dept).filter(Boolean)).size;

  area.innerHTML = `
    <div class="stat-grid" style="margin-bottom:16px;">
      <div class="stat-card">
        <div class="stat-label">Total Employees</div>
        <div class="stat-value blue">${total}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active</div>
        <div class="stat-value green">${activeCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Admins</div>
        <div class="stat-value amber">${adminCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Departments</div>
        <div class="stat-value red">${deptCount}</div>
      </div>
    </div>

    <div class="emp-toolbar">
      <input class="emp-search" id="emp-search" placeholder="Search employees…" />
      ${isAdmin ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn" id="btn-mail-users">Mail users</button>
          <button class="btn btn-primary" id="btn-add-emp">+ Add employee / user</button>
        </div>
      ` : ''}
    </div>

    <table class="emp-table" id="emp-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Role</th>
          <th>Department</th>
          <th>Status</th>
          <th>Joined</th>
          ${isAdmin ? '<th></th>' : ''}
        </tr>
      </thead>
      <tbody id="emp-tbody"></tbody>
    </table>
  `;

  renderEmpRows(employees, isAdmin);

  $('emp-search')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    const filtered = employees.filter(emp =>
      emp.name.toLowerCase().includes(q) ||
      emp.email.toLowerCase().includes(q) ||
      (emp.dept || '').toLowerCase().includes(q) ||
      (emp.role || '').toLowerCase().includes(q)
    );
    renderEmpRows(filtered, isAdmin);
  });

  if (isAdmin) {
    $('btn-add-emp')?.addEventListener('click', () => openAddEmployeeModal());
    $('btn-mail-users')?.addEventListener('click', () => openLegacyMailUsersModal(employees));
  }
}

function renderEmpRows(employees, isAdmin) {
  const tbody = $('emp-tbody');
  if (!tbody) return;

  if (!employees.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="${isAdmin ? 7 : 6}" style="text-align:center;padding:32px;color:var(--text-tertiary);font-size:13px">
          No employees found.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = employees.map(emp => {
    const joined = new Date(emp.created_at).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    return `
      <tr>
        <td><strong style="font-weight:500">${esc(emp.name)}</strong></td>
        <td style="color:var(--text-secondary)">${esc(emp.email)}</td>
        <td><span class="emp-role-pill emp-role-${emp.role}">${emp.role}</span></td>
        <td style="color:var(--text-secondary)">${emp.dept ? esc(emp.dept) : '<span style="color:var(--text-tertiary)">—</span>'}</td>
        <td><span class="${emp.active ? 'emp-status-active' : 'emp-status-inactive'}">${emp.active ? '● Active' : '● Inactive'}</span></td>
        <td style="color:var(--text-tertiary);font-size:12px">${joined}</td>
        ${isAdmin ? `
          <td>
            <div class="emp-actions">
              <button class="btn btn-sm" onclick="openEditEmployeeModal(${emp.id}, '${esc(emp.name)}', '${emp.role}', '${esc(emp.dept || '')}', ${emp.active})">Edit</button>
              <button class="btn btn-sm" onclick="openResetPasswordModal(${emp.id}, '${esc(emp.name)}')">Reset PW</button>
            </div>
          </td>
        ` : ''}
      </tr>
    `;
  }).join('');
}

// ── Add Employee Modal ─────────────────────────────
function openAddEmployeeModal() {
  const container = $('modal-container');
  container.innerHTML = `
    <div class="modal-overlay" id="emp-modal-overlay">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-header-title">Add Employee / Add User</div>
          <button class="btn btn-sm" id="close-emp-modal">✕</button>
        </div>
        <div class="modal-body">
          <div class="modal-form-grid">
            <div class="mfield span-2">
              <label>Full Name</label>
              <input type="text" id="new-emp-name" placeholder="Juan dela Cruz" />
            </div>
            <div class="mfield span-2">
              <label>Email</label>
              <input type="email" id="new-emp-email" placeholder="juan@omtpi.com.ph" />
            </div>
            <div class="mfield">
              <label>Password</label>
              <input type="password" id="new-emp-password" placeholder="Min. 8 characters" />
            </div>
            <div class="mfield">
              <label>Role</label>
              <select id="new-emp-role">
                <option value="agent">Agent</option>
                <option value="admin">Admin</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <div class="mfield span-2">
              <label>Department</label>
              <input type="text" id="new-emp-dept" placeholder="e.g. Technical Service (TS)" />
            </div>
          </div>
          <div class="modal-error" id="emp-modal-error"></div>
        </div>
        <div class="modal-footer">
          <button class="btn" id="cancel-emp-modal">Cancel</button>
          <button class="btn btn-primary" id="save-emp-btn">Create Employee</button>
        </div>
      </div>
    </div>
  `;

  const close = () => container.innerHTML = '';

  $('close-emp-modal').onclick = close;
  $('cancel-emp-modal').onclick = close;
  $('emp-modal-overlay')?.addEventListener('click', e => {
    if (e.target.id === 'emp-modal-overlay') close();
  });

  $('save-emp-btn')?.addEventListener('click', async () => {
    const errEl = $('emp-modal-error');
    const name = $('new-emp-name').value.trim();
    const email = $('new-emp-email').value.trim();
    const password = $('new-emp-password').value;
    const role = $('new-emp-role').value;
    const dept = $('new-emp-dept').value.trim();

    errEl.style.display = 'none';

    if (!name || !email || !password) {
      errEl.textContent = 'Name, email, and password are required.';
      errEl.style.display = 'block';
      return;
    }

    const btn = $('save-emp-btn');
    btn.disabled = true;
    btn.textContent = 'Creating…';

    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role, dept }),
      });

      const data = await res.json();

      if (!res.ok) {
        errEl.textContent = data.error || 'Failed to create employee.';
        errEl.style.display = 'block';
        return;
      }

      close();
      showToast(`✓ ${email} created successfully`);
      renderEmployeesView($('content-area'));
    } catch (_) {
      errEl.textContent = 'Network error. Try again.';
      errEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Employee';
    }
  });
}

// ── Legacy quick mail modal from employees view ─────────────────
function openLegacyMailUsersModal(employees) {
  const container = $('modal-container');
  const allEmails = employees.map(emp => emp.email).filter(Boolean).join(', ');

  container.innerHTML = `
    <div class="modal-overlay" id="mail-modal-overlay">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-header-title">Mail Employees / Users</div>
          <button class="btn btn-sm" id="close-mail-modal">✕</button>
        </div>
        <div class="modal-body">
          <div class="field-row full">
            <div class="field">
              <label style="display:flex;align-items:center;gap:8px;">
                <input type="checkbox" id="mail-send-all" />
                Send to all active employees
              </label>
            </div>
          </div>

          <div class="field-row full">
            <div class="field">
              <label>Recipients</label>
              <textarea id="mail-users-to" placeholder="employee1@omtpi.com.ph, employee2@omtpi.com.ph">${esc(allEmails)}</textarea>
            </div>
          </div>

          <div class="field-row full">
            <div class="field">
              <label>Subject</label>
              <input type="text" id="mail-users-subject" placeholder="Mail subject" />
            </div>
          </div>

          <div class="field-row full">
            <div class="field">
              <label>Message</label>
              <textarea id="mail-users-body" placeholder="Write your message here..."></textarea>
            </div>
          </div>

          <div class="modal-error" id="mail-modal-error"></div>
        </div>
        <div class="modal-footer">
          <button class="btn" id="cancel-mail-modal">Cancel</button>
          <button class="btn btn-primary" id="send-mail-users-btn">Send Mail</button>
        </div>
      </div>
    </div>
  `;

  const close = () => container.innerHTML = '';

  $('close-mail-modal').onclick = close;
  $('cancel-mail-modal').onclick = close;

  $('mail-send-all')?.addEventListener('change', e => {
    $('mail-users-to').disabled = e.target.checked;
  });

  $('send-mail-users-btn')?.addEventListener('click', async () => {
    const errEl = $('mail-modal-error');
    const sendBtn = $('send-mail-users-btn');

    const sendToAll = $('mail-send-all').checked;
    const recipients = $('mail-users-to').value.trim();
    const subject = $('mail-users-subject').value.trim();
    const message = $('mail-users-body').value.trim();

    errEl.style.display = 'none';

    if (!subject || !message) {
      errEl.textContent = 'Subject and message are required.';
      errEl.style.display = 'block';
      return;
    }

    if (!sendToAll && !recipients) {
      errEl.textContent = 'Recipients are required unless "Send to all" is checked.';
      errEl.style.display = 'block';
      return;
    }

    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending…';

    try {
      const res = await fetch('/api/mail/send', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: sendToAll ? 'active_agents_admins' : 'custom',
          recipients,
          subject,
          message
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        errEl.textContent = data.error || 'Failed to send mail.';
        errEl.style.display = 'block';
        return;
      }

      close();
      showToast(`✓ Mail sent to ${data.sentCount} recipient(s)`);
    } catch {
      errEl.textContent = 'Network/server error while sending mail.';
      errEl.style.display = 'block';
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send Mail';
    }
  });
}

// ══════════════════════════════════════════════════
//  MAIL VIEW
// ══════════════════════════════════════════════════
async function renderMailView(area) {
  const user = Auth.getCurrentUser();
  const isAdmin = user?.empRole === 'admin';

  area.innerHTML = `
    <div class="tabs" id="mail-tabs">
      ${isAdmin ? `
        <div class="tab active" data-mail-tab="compose">Compose</div>
        <div class="tab" data-mail-tab="stats">Stats</div>
        <div class="tab" data-mail-tab="forwarding">Forwarding</div>
        <div class="tab" data-mail-tab="mailbox">Mailbox</div>
      ` : `
        <div class="tab active" data-mail-tab="mailbox">Mailbox</div>
      `}
    </div>
    <div id="mail-content"></div>
  `;

  const defaultTab = isAdmin ? 'compose' : 'mailbox';
  await renderMailTab(defaultTab);

  document.querySelectorAll('[data-mail-tab]').forEach(tab => {
    tab.addEventListener('click', async () => {
      document.querySelectorAll('[data-mail-tab]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      await renderMailTab(tab.dataset.mailTab);
    });
  });
}

async function renderMailTab(tab) {
  if (tab === 'compose') return renderMailCompose();
  if (tab === 'stats') return renderMailStats();
  if (tab === 'forwarding') return renderMailForwarding();
  return renderMailbox();
}

// ── Compose ───────────────────────────────────────
async function renderMailCompose() {
  const content = $('mail-content');
  content.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div style="background:var(--bg-primary);border:0.5px solid var(--border-default);border-radius:var(--radius-lg);padding:18px;">
        <div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:12px;">Send Mail</div>

        <div class="field-row full">
          <div class="field">
            <label>Send Mode</label>
            <select id="mail-mode">
              <option value="department">By Department</option>
              <option value="active_agents_admins">Active Agents/Admins</option>
              <option value="custom">Custom Recipients</option>
            </select>
          </div>
        </div>

        <div class="field-row full" id="mail-dept-wrap">
          <div class="field">
            <label>Department</label>
            <select id="mail-department">
              ${DEPARTMENTS.map(dept => `<option value="${esc(dept)}">${esc(dept)}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="field-row full" id="mail-custom-wrap" style="display:none;">
          <div class="field">
            <label>Custom Recipients</label>
            <textarea id="mail-custom-recipients" placeholder="employee1@omtpi.com.ph, employee2@omtpi.com.ph"></textarea>
          </div>
        </div>

        <div class="field-row full">
          <div class="field">
            <label>Subject</label>
            <input type="text" id="mail-subject" placeholder="Mail subject" />
          </div>
        </div>

        <div class="field-row full">
          <div class="field">
            <label>Message</label>
            <textarea id="mail-message" placeholder="Write your message here..."></textarea>
          </div>
        </div>

        <div class="modal-error" id="mail-compose-error" style="display:none;"></div>

        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
          <button class="btn" id="mail-compose-clear">Clear</button>
          <button class="btn btn-primary" id="mail-compose-send">Send Mail</button>
        </div>
      </div>

      <div style="background:var(--bg-primary);border:0.5px solid var(--border-default);border-radius:var(--radius-lg);padding:18px;">
        <div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:12px;">Mailing Notes</div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.8;">
          <strong>By Department:</strong> sends to active employees in the selected department.<br>
          <strong>Active Agents/Admins:</strong> sends only to active users with role admin or agent.<br>
          <strong>Custom:</strong> send to selected employee emails.<br><br>
          Forwarding rules will also apply if they are active.
        </div>
      </div>
    </div>
  `;

  $('mail-mode')?.addEventListener('change', () => {
    const mode = $('mail-mode').value;
    $('mail-dept-wrap').style.display = mode === 'department' ? '' : 'none';
    $('mail-custom-wrap').style.display = mode === 'custom' ? '' : 'none';
  });

  $('mail-compose-clear')?.addEventListener('click', () => {
    $('mail-subject').value = '';
    $('mail-message').value = '';
    if ($('mail-custom-recipients')) $('mail-custom-recipients').value = '';
  });

  $('mail-compose-send')?.addEventListener('click', async () => {
    const errEl = $('mail-compose-error');
    const btn = $('mail-compose-send');

    const mode = $('mail-mode').value;
    const department = $('mail-department')?.value || '';
    const recipients = $('mail-custom-recipients')?.value || '';
    const subject = $('mail-subject').value.trim();
    const message = $('mail-message').value.trim();

    errEl.style.display = 'none';

    if (!subject || !message) {
      errEl.textContent = 'Subject and message are required.';
      errEl.style.display = 'block';
      return;
    }

    if (mode === 'custom' && !recipients.trim()) {
      errEl.textContent = 'Custom recipients are required for custom mode.';
      errEl.style.display = 'block';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Sending…';

    try {
      const res = await fetch('/api/mail/send', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, department, recipients, subject, message }),
      });

      const data = await res.json();

      if (!res.ok) {
        errEl.textContent = data.error || 'Failed to send mail.';
        errEl.style.display = 'block';
        return;
      }

      showToast(`✓ Mail sent to ${data.sentCount} recipient(s)`);
      $('mail-subject').value = '';
      $('mail-message').value = '';
      if ($('mail-custom-recipients')) $('mail-custom-recipients').value = '';
    } catch {
      errEl.textContent = 'Network/server error while sending mail.';
      errEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send Mail';
    }
  });
}

// ── Stats ─────────────────────────────────────────
async function renderMailStats() {
  const content = $('mail-content');
  content.innerHTML = `<div style="color:var(--text-tertiary);font-size:13px">Loading mail stats…</div>`;

  try {
    const [deptRes, roleRes] = await Promise.all([
      fetch('/api/mail/stats/departments', { credentials: 'include' }),
      fetch('/api/mail/stats/roles', { credentials: 'include' })
    ]);

    const deptData = await deptRes.json();
    const roleData = await roleRes.json();

    if (!deptRes.ok) throw new Error(deptData.error || 'Failed to load department stats.');
    if (!roleRes.ok) throw new Error(roleData.error || 'Failed to load role stats.');

    const deptStats = deptData.stats || [];
    const roleStats = roleData.stats || [];

    content.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div style="background:var(--bg-primary);border:0.5px solid var(--border-default);border-radius:var(--radius-lg);padding:18px;">
          <div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:12px;">Emails Sent Per Department</div>
          ${renderSimpleStatsTable('Department', 'Sent', deptStats.map(row => [row.department, row.sent_count]))}
        </div>

        <div style="background:var(--bg-primary);border:0.5px solid var(--border-default);border-radius:var(--radius-lg);padding:18px;">
          <div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:12px;">Emails Sent Per Role</div>
          ${renderSimpleStatsTable('Role', 'Sent', roleStats.map(row => [row.role, row.sent_count]))}
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `
      <div style="color:var(--color-red-400);font-size:13px;padding:20px">
        Failed to load mail stats: ${esc(err.message)}
      </div>
    `;
  }
}

function renderSimpleStatsTable(col1, col2, rows) {
  if (!rows.length) {
    return `<div style="font-size:13px;color:var(--text-tertiary);">No data yet.</div>`;
  }

  return `
    <table class="emp-table">
      <thead>
        <tr>
          <th>${esc(col1)}</th>
          <th>${esc(col2)}</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr>
            <td>${esc(row[0])}</td>
            <td>${esc(row[1])}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ── Forwarding ────────────────────────────────────
async function renderMailForwarding() {
  const content = $('mail-content');
  content.innerHTML = `<div style="color:var(--text-tertiary);font-size:13px">Loading forwarding manager…</div>`;

  try {
    const [empRes, fwdRes] = await Promise.all([
      fetch('/api/employees', { credentials: 'include' }),
      fetch('/api/mail/forwarding', { credentials: 'include' })
    ]);

    const empData = await empRes.json();
    const fwdData = await fwdRes.json();

    if (!empRes.ok) throw new Error(empData.error || 'Failed to load employees.');
    if (!fwdRes.ok) throw new Error(fwdData.error || 'Failed to load forwarding rules.');

    const employees = empData.employees || [];
    const forwarding = fwdData.forwarding || [];

    content.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div style="background:var(--bg-primary);border:0.5px solid var(--border-default);border-radius:var(--radius-lg);padding:18px;">
          <div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:12px;">Set Forwarding</div>

          <div class="field-row full">
            <div class="field">
              <label>Source Employee</label>
              <select id="forward-source">
                ${employees.map(emp => `<option value="${emp.id}">${esc(emp.name)} — ${esc(emp.email)}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="field-row full">
            <div class="field">
              <label>Forward To</label>
              <select id="forward-target">
                ${employees.map(emp => `<option value="${emp.id}">${esc(emp.name)} — ${esc(emp.email)}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="field-row full">
            <div class="field">
              <label style="display:flex;align-items:center;gap:8px;">
                <input type="checkbox" id="forward-active" checked />
                Active rule
              </label>
            </div>
          </div>

          <div class="modal-error" id="forward-error" style="display:none;"></div>

          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
            <button class="btn btn-primary" id="save-forwarding-btn">Save Forwarding</button>
          </div>
        </div>

        <div style="background:var(--bg-primary);border:0.5px solid var(--border-default);border-radius:var(--radius-lg);padding:18px;">
          <div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:12px;">Current Forwarding Rules</div>
          ${
            forwarding.length
              ? `
                <table class="emp-table">
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Target</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${forwarding.map(rule => `
                      <tr>
                        <td>${esc(rule.source_name)}<br><span style="font-size:12px;color:var(--text-tertiary)">${esc(rule.source_email)}</span></td>
                        <td>${esc(rule.target_name)}<br><span style="font-size:12px;color:var(--text-tertiary)">${esc(rule.target_email)}</span></td>
                        <td>${rule.active ? 'Active' : 'Inactive'}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              `
              : `<div style="font-size:13px;color:var(--text-tertiary);">No forwarding rules yet.</div>`
          }
        </div>
      </div>
    `;

    $('save-forwarding-btn')?.addEventListener('click', async () => {
      const errEl = $('forward-error');
      const sourceEmployeeId = Number($('forward-source').value);
      const targetEmployeeId = Number($('forward-target').value);
      const active = $('forward-active').checked;

      errEl.style.display = 'none';

      if (sourceEmployeeId === targetEmployeeId) {
        errEl.textContent = 'Source and target employee cannot be the same.';
        errEl.style.display = 'block';
        return;
      }

      const btn = $('save-forwarding-btn');
      btn.disabled = true;
      btn.textContent = 'Saving…';

      try {
        const res = await fetch('/api/mail/forwarding', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceEmployeeId, targetEmployeeId, active }),
        });

        const data = await res.json();

        if (!res.ok) {
          errEl.textContent = data.error || 'Failed to save forwarding.';
          errEl.style.display = 'block';
          return;
        }

        showToast('✓ Forwarding rule saved');
        renderMailForwarding();
      } catch {
        errEl.textContent = 'Network/server error while saving forwarding.';
        errEl.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save Forwarding';
      }
    });
  } catch (err) {
    content.innerHTML = `
      <div style="color:var(--color-red-400);font-size:13px;padding:20px">
        Failed to load forwarding manager: ${esc(err.message)}
      </div>
    `;
  }
}

// ── Mailbox ───────────────────────────────────────
async function renderMailbox() {
  const content = $('mail-content');
  content.innerHTML = `<div style="color:var(--text-tertiary);font-size:13px">Loading mailbox…</div>`;

  try {
    const res = await fetch('/api/mail/mailbox', { credentials: 'include' });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Failed to load mailbox.');

    const messages = data.messages || [];

    content.innerHTML = `
      <div style="display:grid;grid-template-columns:340px 1fr;gap:16px;min-height:520px;">
        <div style="background:var(--bg-primary);border:0.5px solid var(--border-default);border-radius:var(--radius-lg);overflow:hidden;">
          <div style="padding:14px 16px;border-bottom:0.5px solid var(--border-default);font-size:15px;font-weight:600;color:var(--text-primary);">
            Inbox
          </div>
          <div id="mail-list">
            ${messages.length ? messages.map((msg, i) => `
              <div class="mail-row ${i === 0 ? 'active' : ''}" data-mail-index="${i}" style="padding:14px 16px;border-bottom:0.5px solid var(--border-default);cursor:pointer;background:${i === 0 ? 'var(--bg-secondary)' : 'transparent'};">
                <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:4px;">
                  ${esc(msg.subject)}
                </div>
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;">
                  From: ${esc(msg.sender_name)}${msg.delivery_type === 'forwarded' ? ' · Forwarded' : ''}
                </div>
                <div style="font-size:12px;color:var(--text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                  ${stripHtml(msg.body_html || '')}
                </div>
              </div>
            `).join('') : `
              <div style="padding:20px;font-size:13px;color:var(--text-tertiary);">No mail yet.</div>
            `}
          </div>
        </div>

        <div style="background:var(--bg-primary);border:0.5px solid var(--border-default);border-radius:var(--radius-lg);overflow:hidden;">
          <div id="mail-preview"></div>
        </div>
      </div>
    `;

    if (messages.length) {
      renderMailPreview(messages[0]);
      document.querySelectorAll('[data-mail-index]').forEach(row => {
        row.addEventListener('click', () => {
          document.querySelectorAll('[data-mail-index]').forEach(el => {
            el.classList.remove('active');
            el.style.background = 'transparent';
          });
          row.classList.add('active');
          row.style.background = 'var(--bg-secondary)';
          renderMailPreview(messages[Number(row.dataset.mailIndex)]);
        });
      });
    } else {
      $('mail-preview').innerHTML = `
        <div style="padding:24px;font-size:13px;color:var(--text-tertiary);">Nothing to preview.</div>
      `;
    }
  } catch (err) {
    content.innerHTML = `
      <div style="color:var(--color-red-400);font-size:13px;padding:20px">
        Failed to load mailbox: ${esc(err.message)}
      </div>
    `;
  }
}

function renderMailPreview(msg, reloadMailbox, archived) {
  $('mail-preview').innerHTML = `
    <div style="padding:18px;border-bottom:0.5px solid var(--border-default);display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;">
      <div>
        <div style="font-size:18px;font-weight:600;color:var(--text-primary);margin-bottom:12px;">
          ${esc(msg.subject)}
        </div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.8;">
          <strong>From:</strong> ${esc(msg.sender_name)} (${esc(msg.sender_email)})<br>
          <strong>To:</strong> ${esc(msg.recipient_name || msg.recipient_email)}<br>
          <strong>Department:</strong> ${esc(msg.recipient_dept || '—')}<br>
          <strong>Role:</strong> ${esc(msg.recipient_role || '—')}<br>
          <strong>Delivery:</strong> ${esc(msg.delivery_type)}<br>
          <strong>Date:</strong> ${new Date(msg.created_at).toLocaleString('en-PH')}<br>
          <strong>Status:</strong> ${msg.is_read ? 'Read' : 'Unread'}
        </div>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${
          msg.is_read
            ? `<button class="btn" id="mail-mark-unread-btn">Mark Unread</button>`
            : `<button class="btn" id="mail-mark-read-btn">Mark Read</button>`
        }
        ${
          archived
            ? `<button class="btn" id="mail-unarchive-btn">Unarchive</button>`
            : `<button class="btn" id="mail-archive-btn">Archive</button>`
        }
      </div>
    </div>

    <div style="padding:18px;font-size:14px;color:var(--text-primary);line-height:1.8;">
      ${msg.body_html || ''}
    </div>
  `;

  $('mail-mark-read-btn')?.addEventListener('click', async () => {
    await fetch(`/api/mail/mailbox/${msg.id}/read`, {
      method: 'PATCH',
      credentials: 'include'
    });
    showToast('✓ Marked as read');
    reloadMailbox();
  });

  $('mail-mark-unread-btn')?.addEventListener('click', async () => {
    await fetch(`/api/mail/mailbox/${msg.id}/unread`, {
      method: 'PATCH',
      credentials: 'include'
    });
    showToast('✓ Marked as unread');
    reloadMailbox();
  });

  $('mail-archive-btn')?.addEventListener('click', async () => {
    await fetch(`/api/mail/mailbox/${msg.id}/archive`, {
      method: 'PATCH',
      credentials: 'include'
    });
    showToast('✓ Mail archived');
    reloadMailbox();
  });

  $('mail-unarchive-btn')?.addEventListener('click', async () => {
    await fetch(`/api/mail/mailbox/${msg.id}/unarchive`, {
      method: 'PATCH',
      credentials: 'include'
    });
    showToast('✓ Mail restored');
    reloadMailbox();
  });
}

// ── Edit Employee Modal ────────────────────────────
window.openEditEmployeeModal = function(id, name, role, dept, active) {
  const container = $('modal-container');
  container.innerHTML = `
    <div class="modal-overlay" id="edit-modal-overlay">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-header-title">Edit Employee</div>
          <button class="btn btn-sm" id="close-edit-modal">✕</button>
        </div>
        <div class="modal-body">
          <div class="modal-form-grid">
            <div class="mfield span-2">
              <label>Full Name</label>
              <input type="text" id="edit-emp-name" value="${esc(name)}" />
            </div>
            <div class="mfield">
              <label>Role</label>
              <select id="edit-emp-role">
                <option value="agent" ${role === 'agent' ? 'selected' : ''}>Agent</option>
                <option value="admin" ${role === 'admin' ? 'selected' : ''}>Admin</option>
                <option value="viewer" ${role === 'viewer' ? 'selected' : ''}>Viewer</option>
              </select>
            </div>
            <div class="mfield">
              <label>Status</label>
              <select id="edit-emp-active">
                <option value="1" ${active ? 'selected' : ''}>Active</option>
                <option value="0" ${!active ? 'selected' : ''}>Inactive</option>
              </select>
            </div>
            <div class="mfield span-2">
              <label>Department</label>
              <input type="text" id="edit-emp-dept" value="${esc(dept)}" />
            </div>
          </div>
          <div class="modal-error" id="edit-modal-error"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-danger" id="delete-emp-btn">Delete</button>
          <button class="btn" id="cancel-edit-modal">Cancel</button>
          <button class="btn btn-primary" id="save-edit-btn">Save Changes</button>
        </div>
      </div>
    </div>
  `;

  const close = () => container.innerHTML = '';
  $('close-edit-modal').onclick = close;
  $('cancel-edit-modal').onclick = close;

  $('save-edit-btn')?.addEventListener('click', async () => {
    const errEl = $('edit-modal-error');
    errEl.style.display = 'none';

    const btn = $('save-edit-btn');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      const res = await fetch(`/api/employees/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: $('edit-emp-name').value.trim(),
          role: $('edit-emp-role').value,
          dept: $('edit-emp-dept').value.trim(),
          active: $('edit-emp-active').value === '1',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        errEl.textContent = data.error || 'Failed to update employee.';
        errEl.style.display = 'block';
        return;
      }

      close();
      showToast('✓ Employee updated');
      renderEmployeesView($('content-area'));
    } catch (_) {
      errEl.textContent = 'Network error.';
      errEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Changes';
    }
  });

  $('delete-emp-btn')?.addEventListener('click', async () => {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;

    const res = await fetch(`/api/employees/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    const data = await res.json();

    if (!res.ok) {
      alert(data.error || 'Failed to delete employee.');
      return;
    }

    close();
    showToast('✓ Employee deleted');
    renderEmployeesView($('content-area'));
  });
};

// ── Reset Password Modal ───────────────────────────
window.openResetPasswordModal = function(id, name) {
  const container = $('modal-container');
  container.innerHTML = `
    <div class="modal-overlay" id="pw-modal-overlay">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-header-title">Reset Password — ${esc(name)}</div>
          <button class="btn btn-sm" id="close-pw-modal">✕</button>
        </div>
        <div class="modal-body">
          <div class="modal-form-grid">
            <div class="mfield span-2">
              <label>New Password</label>
              <input type="password" id="new-pw" placeholder="Min. 8 characters" />
            </div>
            <div class="mfield span-2">
              <label>Confirm Password</label>
              <input type="password" id="confirm-pw" placeholder="Repeat password" />
            </div>
          </div>
          <div class="modal-error" id="pw-modal-error"></div>
        </div>
        <div class="modal-footer">
          <button class="btn" id="cancel-pw-modal">Cancel</button>
          <button class="btn btn-primary" id="save-pw-btn">Reset Password</button>
        </div>
      </div>
    </div>
  `;

  const close = () => container.innerHTML = '';
  $('close-pw-modal').onclick = close;
  $('cancel-pw-modal').onclick = close;

  $('save-pw-btn')?.addEventListener('click', async () => {
    const pw = $('new-pw').value;
    const confirm = $('confirm-pw').value;
    const errEl = $('pw-modal-error');
    errEl.style.display = 'none';

    if (pw.length < 8) {
      errEl.textContent = 'Password must be at least 8 characters.';
      errEl.style.display = 'block';
      return;
    }

    if (pw !== confirm) {
      errEl.textContent = 'Passwords do not match.';
      errEl.style.display = 'block';
      return;
    }

    const btn = $('save-pw-btn');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      const res = await fetch(`/api/employees/${id}/password`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });

      const data = await res.json();

      if (!res.ok) {
        errEl.textContent = data.error || 'Failed to reset password.';
        errEl.style.display = 'block';
        return;
      }

      close();
      showToast('✓ Password reset successfully');
    } catch (_) {
      errEl.textContent = 'Network error.';
      errEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Reset Password';
    }
  });
};

// ══════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  Auth.init();
});