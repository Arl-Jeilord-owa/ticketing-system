/**
 * panel.js
 * Slide-in detail panel: open, close, status updates, comments.
 */

const Panel = (() => {
  let currentTicketId = null;

  function open(ticketId) {
    const tk = TicketStore.getById(ticketId);
    if (!tk) return;
    currentTicketId = ticketId;

    $('panel-title').textContent = tk.id + ' · ' + (tk.subject.length > 35 ? tk.subject.slice(0, 35) + '…' : tk.subject);
    $('panel-body').innerHTML = renderPanelBody(tk);
    $('panel-footer').innerHTML = `
      <button class="btn" id="panel-cancel-btn">Cancel</button>
      <button class="btn btn-primary" id="panel-comment-btn">Add comment</button>`;

    // Status buttons
    $('status-btn-group').addEventListener('click', e => {
      const btn = e.target.closest('[data-status]');
      if (!btn) return;
      const newStatus = btn.dataset.status;
      TicketStore.setStatus(currentTicketId, newStatus);
      // Refresh panel badges and buttons
      const updated = TicketStore.getById(currentTicketId);
      qsa('[data-status]', $('status-btn-group')).forEach(b => {
        b.classList.toggle('active', b.dataset.status === newStatus);
      });
      // Update status badge in panel header
      const badgeEl = qs('.detail-badges .status-badge', $('panel-body'));
      if (badgeEl) {
        badgeEl.textContent = newStatus;
        badgeEl.className = 'status-badge ' + statusClass(newStatus);
      }
      App.refreshContent();
      showToast('Status updated to "' + newStatus + '"');
    });

    // Comment button
    $('panel-footer').addEventListener('click', e => {
      if (e.target.id === 'panel-cancel-btn') { close(); return; }
      if (e.target.id === 'panel-comment-btn') { submitComment(); }
    });

    $('detail-panel').classList.add('open');
  }

  function submitComment() {
    const textarea = $('new-comment');
    const text = textarea ? textarea.value.trim() : '';
    if (!text) { showToast('Please write a comment first.'); return; }

    TicketStore.addComment(currentTicketId, { author: 'Agent', text });
    textarea.value = '';

    // Refresh comment list
    const tk = TicketStore.getById(currentTicketId);
    const commentList = $('comment-list');
    if (commentList) {
      commentList.innerHTML = tk.comments.map(c => `
        <div class="comment">
          <div class="comment-meta">${escapeHtml(c.author)} · ${escapeHtml(c.time)}</div>
          ${escapeHtml(c.text)}
        </div>`).join('');
    }
    App.refreshContent();
    showToast('Comment added');
  }

  function close() {
    $('detail-panel').classList.remove('open');
    currentTicketId = null;
  }

  function getCurrent() {
    return currentTicketId;
  }

  return { open, close, getCurrent };
})();
