/**
 * render.js
 * Pure HTML-string builders. No side effects — return strings only.
 * DOM writes happen in app.js, panel.js, and modal.js.
 */

/** Build stat card HTML */
function renderStatCard(label, value, colorClass) {
  return `
    <div class="stat-card">
      <div class="stat-label">${escapeHtml(label)}</div>
      <div class="stat-value ${colorClass}">${value}</div>
    </div>`;
}

/** Build the dashboard view */
function renderDashboard() {
  const s = TicketStore.getSummary();
  return `
    <div class="stat-grid">
      ${renderStatCard('Open', s.open, 'blue')}
      ${renderStatCard('In progress', s.progress, 'amber')}
      ${renderStatCard('Resolved / closed', s.resolved, 'green')}
      ${renderStatCard('Critical open', s.critical, 'red')}
    </div>
    <div class="tabs" id="dash-tabs">
      <div class="tab active" data-dash="recent">Recent tickets</div>
      <div class="tab" data-dash="critical">Critical &amp; high</div>
      <div class="tab" data-dash="unassigned">Unassigned</div>
    </div>
    <div id="dash-content"></div>`;
}

/** Build the filter toolbar */
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

/** Build the full ticket table */
function renderTable(tickets) {
  return `
    <table class="ticket-table">
      <thead>
        <tr>
          <th class="col-id">ID</th>
          <th class="col-subject">Subject</th>
          <th class="col-type">Type</th>
          <th class="col-priority">Priority</th>
          <th class="col-status">Status</th>
          <th class="col-req">Requester</th>
          <th class="col-assign">Assignee</th>
          <th class="col-date">Updated</th>
        </tr>
      </thead>
      <tbody id="ticket-tbody">
        ${renderRows(tickets)}
      </tbody>
    </table>`;
}

/** Build table rows from a ticket array */
function renderRows(tickets) {
  if (!tickets.length) {
    return `<tr class="empty-row"><td colspan="8">No tickets found</td></tr>`;
  }

  return tickets.map((tk, i) => `
    <tr data-ticket-id="${escapeHtml(tk.id)}">
      <td><span class="ticket-id">${escapeHtml(tk.id)}</span></td>
      <td class="subject-cell">
        <div class="subject-text">${escapeHtml(tk.subject)}</div>
        <div class="subject-dept">${escapeHtml(tk.dept)}</div>
      </td>
      <td><span class="type-badge ${typeClass(tk.type)}">${tk.type === 'internal' ? 'Internal' : 'External'}</span></td>
      <td><span class="pri-badge ${priorityClass(tk.priority)}">${escapeHtml(tk.priority)}</span></td>
      <td><span class="status-badge ${statusClass(tk.status)}">${escapeHtml(tk.status)}</span></td>
      <td>
        <div class="requester-cell">
          <div class="avatar ${avatarClass(i)}">${getInitials(tk.requester)}</div>
          <span>${escapeHtml(tk.requester)}</span>
        </div>
      </td>
      <td style="font-size:12px;color:var(--text-secondary);">${escapeHtml(tk.assignee)}</td>
      <td style="font-size:12px;color:var(--text-tertiary);">${escapeHtml(tk.updated)}</td>
    </tr>`).join('');
}

/** Build the ticket detail panel body */
function renderPanelBody(tk) {
  const comments = tk.comments.map(c => `
    <div class="comment">
      <div class="comment-meta">${escapeHtml(c.author)} · ${escapeHtml(c.time)}</div>
      ${escapeHtml(c.text)}
    </div>`).join('');

  const statusBtns = ['open', 'progress', 'resolved', 'closed'].map(s => `
    <button class="filter-btn${tk.status === s ? ' active' : ''}" data-status="${s}">${escapeHtml(s)}</button>`
  ).join('');

  return `
    <div class="detail-badges">
      <span class="status-badge ${statusClass(tk.status)}">${escapeHtml(tk.status)}</span>
      <span class="pri-badge ${priorityClass(tk.priority)}">${escapeHtml(tk.priority)} priority</span>
      <span class="type-badge ${typeClass(tk.type)}">${tk.type}</span>
    </div>

    <div class="detail-subject">${escapeHtml(tk.subject)}</div>

    <div class="detail-meta-grid">
      <div class="meta-item">
        <div class="meta-label">Requester</div>
        <div class="meta-value">${escapeHtml(tk.requester)}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Assignee</div>
        <div class="meta-value">${escapeHtml(tk.assignee)}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Department</div>
        <div class="meta-value">${escapeHtml(tk.dept)}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Created</div>
        <div class="meta-value">${escapeHtml(tk.created)}</div>
      </div>
    </div>

    <div class="status-controls">
      <div class="status-controls-label">Update status</div>
      <div class="status-btns" id="status-btn-group">
        ${statusBtns}
      </div>
    </div>

    <div class="activity-section">
      <div class="activity-heading">Activity</div>
      <div id="comment-list">${comments || '<div style="font-size:13px;color:var(--text-tertiary);">No comments yet.</div>'}</div>
      <textarea class="comment-textarea" id="new-comment" placeholder="Add a comment…"></textarea>
    </div>`;
}

/** Build the new-ticket modal body */
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
        <label>Subject *</label>
        <input type="text" id="new-subject" placeholder="Brief description of the issue" />
      </div>
    </div>

    <div class="field-row">
      <div class="field">
        <label>Requester name *</label>
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

    <div class="field-row full">
      <div class="field">
        <label>Description</label>
        <textarea id="new-desc" placeholder="Describe the issue in detail…"></textarea>
      </div>
    </div>`;
}
