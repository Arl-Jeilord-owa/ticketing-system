/**
 * render.js — Pure HTML-string builders. No side effects.
 *
 * Works with normalised ticket objects from data.js:
 *   { id (ticket_no), subject, type, dept, priority, status,
 *     requester, assignee, created, updated, comments }
 */

// ── Dashboard ────────────────────────────────────────────────

function renderDashboard() {
  return `
    <div class="stat-grid" id="stat-grid">
      ${renderStatCard('Open',             '—', 'blue')}
      ${renderStatCard('In progress',      '—', 'amber')}
      ${renderStatCard('Resolved / closed','—', 'green')}
      ${renderStatCard('Critical open',    '—', 'red')}
    </div>
    <div class="tabs" id="dash-tabs">
      <div class="tab active" data-dash="recent">Recent tickets</div>
      <div class="tab" data-dash="critical">Critical &amp; high</div>
      <div class="tab" data-dash="unassigned">Unassigned</div>
    </div>
    <div id="dash-content"></div>`;
}

function renderStatCard(label, value, colorClass) {
  return `
    <div class="stat-card">
      <div class="stat-label">${escapeHtml(label)}</div>
      <div class="stat-value ${colorClass}" id="stat-${colorClass}">${value}</div>
    </div>`;
}

/** Called after dashboard HTML is inserted — fetches and fills stat values */
async function populateStats() {
  try {
    const s = await TicketStore.getSummary();
    const map = {
      blue:  s.open_count     || s.open     || 0,
      amber: s.progress_count || s.progress || 0,
      green: s.resolved_count || s.resolved || 0,
      red:   s.critical_count || s.critical || 0,
    };
    Object.entries(map).forEach(([cls, val]) => {
      const el = document.getElementById('stat-' + cls);
      if (el) el.textContent = val;
    });
  } catch { /* non-critical */ }
}

// ── Filters row ──────────────────────────────────────────────

function renderFilters(includeResolved = false) {
  return `
    <div class="filters">
      <span class="filters-label">Filter:</span>
      <button class="filter-btn active" data-status-filter="all">All</button>
      <button class="filter-btn" data-status-filter="open">Open</button>
      <button class="filter-btn" data-status-filter="progress">In progress</button>
      ${includeResolved ? '' : '<button class="filter-btn" data-status-filter="resolved">Resolved</button>'}
    </div>`;
}

// ── Ticket table ─────────────────────────────────────────────

function renderTable(tickets) {
  return `
    <table class="ticket-table">
      <thead><tr>
        <th class="col-id">ID</th>
        <th class="col-subject">Subject</th>
        <th class="col-type">Type</th>
        <th class="col-priority">Priority</th>
        <th class="col-status">Status</th>
        <th class="col-req">Requester</th>
        <th class="col-assign">Assignee</th>
        <th class="col-date">Updated</th>
      </tr></thead>
      <tbody id="ticket-tbody">
        ${renderRows(tickets)}
      </tbody>
    </table>`;
}

function renderRows(tickets) {
  if (!tickets || !tickets.length) {
    return `<tr class="empty-row"><td colspan="8">No tickets found</td></tr>`;
  }
  return tickets.map((tk, i) => {
    const priCls    = priorityClass(tk.priority);
    const stCls     = statusClass(tk.status);
    const typeCls   = typeClass(tk.type);
    const avCls     = avatarClass(i);
    const displayId = tk.id || tk.ticket_no || '';
    const updated   = (tk.updated || tk.updated_at || '').slice(0, 10);

    return `
      <tr data-ticket-id="${escapeHtml(displayId)}">
        <td><span class="ticket-id">${escapeHtml(displayId)}</span></td>
        <td class="subject-cell">
          <div class="subject-text">${escapeHtml(tk.subject)}</div>
          <div class="subject-dept">${escapeHtml(tk.dept || '')}</div>
        </td>
        <td><span class="type-badge ${typeCls}">${tk.type === 'internal' ? 'Internal' : 'External'}</span></td>
        <td><span class="pri-badge ${priCls}">${escapeHtml(tk.priority)}</span></td>
        <td><span class="status-badge ${stCls}">${escapeHtml(tk.status)}</span></td>
        <td>
          <div class="requester-cell">
            <div class="avatar ${avCls}">${getInitials(tk.requester || '?')}</div>
            <span>${escapeHtml(tk.requester || '')}</span>
          </div>
        </td>
        <td style="font-size:12px;color:var(--text-secondary);">${escapeHtml(tk.assignee || 'Unassigned')}</td>
        <td style="font-size:12px;color:var(--text-tertiary);">${escapeHtml(updated)}</td>
      </tr>`;
  }).join('');
}

// ── Detail panel body ─────────────────────────────────────────

function renderPanelBody(tk) {
  const comments  = (tk.comments || []);
  const priCls    = priorityClass(tk.priority);
  const stCls     = statusClass(tk.status);
  const typeCls   = typeClass(tk.type);
  const created   = (tk.created   || tk.created_at  || '').slice(0, 10);
  const updated   = (tk.updated   || tk.updated_at  || '').slice(0, 10);
  const displayId = tk.id || tk.ticket_no || '';

  const commentHTML = comments.length
    ? comments.map(c => `
        <div class="comment">
          <div class="comment-meta">${escapeHtml(c.author)} &middot; ${escapeHtml(c.time || c.created_at || '')}</div>
          ${escapeHtml(c.text || c.body || '')}
        </div>`).join('')
    : '<div style="font-size:13px;color:var(--text-tertiary);">No comments yet.</div>';

  const statusBtns = ['open','progress','resolved','closed'].map(s =>
    `<button class="filter-btn${tk.status === s ? ' active' : ''}" data-status="${s}">${s}</button>`
  ).join('');

  return `
    <div class="detail-badges">
      <span class="status-badge ${stCls}">${escapeHtml(tk.status)}</span>
      <span class="pri-badge ${priCls}">${escapeHtml(tk.priority)} priority</span>
      <span class="type-badge ${typeCls}">${tk.type}</span>
    </div>

    <div class="detail-subject">${escapeHtml(tk.subject)}</div>

    <div class="detail-meta-grid">
      <div class="meta-item">
        <div class="meta-label">Ticket ID</div>
        <div class="meta-value" style="font-family:monospace;">${escapeHtml(displayId)}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Department</div>
        <div class="meta-value">${escapeHtml(tk.dept || '—')}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Requester</div>
        <div class="meta-value">${escapeHtml(tk.requester || '—')}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Assignee</div>
        <div class="meta-value">${escapeHtml(tk.assignee || 'Unassigned')}</div>
      </div>
      ${tk.email ? `
      <div class="meta-item">
        <div class="meta-label">Email</div>
        <div class="meta-value" style="font-size:12px;word-break:break-all;">
          <a href="mailto:${escapeHtml(tk.email)}" style="color:var(--color-blue-400);">${escapeHtml(tk.email)}</a>
        </div>
      </div>` : ''}
      ${tk.phone ? `
      <div class="meta-item">
        <div class="meta-label">Phone</div>
        <div class="meta-value" style="font-family:monospace;">${escapeHtml(tk.phone)}</div>
      </div>` : ''}
      <div class="meta-item">
        <div class="meta-label">Created</div>
        <div class="meta-value">${escapeHtml(created)}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Updated</div>
        <div class="meta-value">${escapeHtml(updated)}</div>
      </div>
    </div>

    ${tk.description ? `
    <div style="margin-bottom:16px;">
      <div class="meta-label" style="margin-bottom:6px;">Description</div>
      <div style="font-size:13px;color:var(--text-secondary);line-height:1.6;white-space:pre-wrap;">${escapeHtml(tk.description)}</div>
    </div>` : ''}

    <div class="status-controls">
      <div class="status-controls-label">Update status</div>
      <div class="status-btns" id="status-btn-group">${statusBtns}</div>
    </div>

    <div class="activity-section">
      <div class="activity-heading">Activity</div>
      <div id="comment-list">${commentHTML}</div>
      <textarea class="comment-textarea" id="new-comment" placeholder="Add a comment…"></textarea>
    </div>`;
}

// ── New-ticket modal body ─────────────────────────────────────

function renderModalBody() {
  return `
    <div class="type-selector">
      <div class="type-selector-label">Ticket type</div>
      <div class="type-btns">
        <button class="type-btn active" data-type="internal">Internal (employee)</button>
        <button class="type-btn" data-type="external">External (client)</button>
      </div>
    </div>

    <div class="field-row">
      <div class="field span-2">
        <label>Subject <span style="color:var(--color-red-400);">*</span></label>
        <input type="text" id="new-subject" placeholder="Brief description of the issue" />
      </div>
    </div>

    <div class="field-row">
      <div class="field">
        <label>Requester name <span style="color:var(--color-red-400);">*</span></label>
        <input type="text" id="new-requester" placeholder="Full name" />
      </div>
      <div class="field">
        <label>Requester email</label>
        <input type="email" id="new-email" placeholder="email@company.com" />
      </div>
    </div>

    <div class="field-row">
      <div class="field">
        <label>Department / Area</label>
        <select id="new-dept">
          <option>IT</option>
          <option>HR</option>
          <option>Finance</option>
          <option>Facilities</option>
          <option>Sales</option>
          <option>Support</option>
          <option>Billing</option>
          <option>Legal</option>
        </select>
      </div>
      <div class="field">
        <label>Priority</label>
        <select id="new-priority">
          <option value="low">Low</option>
          <option value="medium" selected>Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
      </div>
    </div>

    <div class="field-row">
      <div class="field span-2">
        <label>Assign to</label>
        <input type="text" id="new-assignee" placeholder="Agent name or team (leave blank for Unassigned)" />
      </div>
    </div>

    <div class="field-row full">
      <div class="field">
        <label>Description</label>
        <textarea id="new-desc" placeholder="Describe the issue in detail…"></textarea>
      </div>
    </div>`;
}
