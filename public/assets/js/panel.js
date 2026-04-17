/**
 * panel.js — Slide-in ticket detail panel.
 * Now async: fetches ticket + comments from the API on open.
 */

const Panel = (() => {

  let currentTicketNo = null;

  // ── Open ────────────────────────────────────────────────────
  async function open(ticketNo) {
    currentTicketNo = ticketNo;
    const panelEl = $('detail-panel');
    if (!panelEl) return;

    // Show panel immediately with loading state
    $('panel-title').textContent = ticketNo + ' · Loading…';
    $('panel-body').innerHTML = `<div class="loading-row"><div class="loading-spinner"></div></div>`;
    $('panel-footer').innerHTML = '';
    panelEl.classList.add('open');

    try {
      const result = await TicketStore.getById(ticketNo);
      if (!result) {
        $('panel-body').innerHTML = `<p style="color:var(--text-tertiary);padding:12px;">Ticket not found.</p>`;
        return;
      }

      const { ticket: tk, comments } = result;

      $('panel-title').textContent =
        tk.id + ' · ' + (tk.subject.length > 38 ? tk.subject.slice(0, 38) + '…' : tk.subject);

      $('panel-body').innerHTML = renderPanelBody({ ...tk, comments });

      $('panel-footer').innerHTML = `
        <button class="btn" id="panel-cancel-btn">Close</button>
        <button class="btn btn-primary" id="panel-comment-btn">Add comment</button>`;

      bindStatusButtons(tk);
      bindCommentButton(ticketNo);

    } catch (err) {
      $('panel-body').innerHTML = `<p style="color:var(--color-red-600);padding:12px;">Failed to load ticket.</p>`;
      console.error('[Panel.open]', err);
    }
  }

  // ── Status update buttons ───────────────────────────────────
  function bindStatusButtons(tk) {
    const group = $('status-btn-group');
    if (!group) return;

    group.addEventListener('click', async e => {
      const btn = e.target.closest('[data-status]');
      if (!btn) return;

      const newStatus = btn.dataset.status;
      btn.disabled = true;

      try {
        await TicketStore.setStatus(currentTicketNo, newStatus);

        // Update button active state
        qsa('[data-status]', group).forEach(b => {
          b.classList.toggle('active', b.dataset.status === newStatus);
          b.disabled = false;
        });

        // Update status badge in panel
        const badgeEl = qs('.detail-badges .status-badge', $('panel-body'));
        if (badgeEl) {
          badgeEl.textContent = newStatus;
          badgeEl.className   = 'status-badge ' + statusClass(newStatus);
        }

        await App.refreshContent();
        showToast('Status updated to "' + newStatus + '"');

      } catch (err) {
        btn.disabled = false;
        showToast('Could not update status. Please try again.');
        console.error('[Panel] status update:', err);
      }
    });
  }

  // ── Comment button ──────────────────────────────────────────
  function bindCommentButton(ticketNo) {
    const footer = $('panel-footer');
    if (!footer) return;

    footer.addEventListener('click', async e => {
      if (e.target.id === 'panel-cancel-btn') { close(); return; }
      if (e.target.id === 'panel-comment-btn') {
        await submitComment(ticketNo);
      }
    });
  }

  async function submitComment(ticketNo) {
    const textarea = $('new-comment');
    const text     = textarea ? textarea.value.trim() : '';
    if (!text) { showToast('Please write a comment first.'); return; }

    const btn = $('panel-comment-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    try {
      await TicketStore.addComment(ticketNo, { author: 'Agent', text });
      textarea.value = '';

      // Refresh comment list inline (re-fetch)
      const result = await TicketStore.getById(ticketNo);
      const commentList = $('comment-list');
      if (commentList && result) {
        commentList.innerHTML = result.comments.length
          ? result.comments.map(c => `
              <div class="comment">
                <div class="comment-meta">${escapeHtml(c.author)} · ${escapeHtml(c.time)}</div>
                ${escapeHtml(c.text || c.body || '')}
              </div>`).join('')
          : '<div style="font-size:13px;color:var(--text-tertiary);">No comments yet.</div>';

        // Scroll to bottom of comments
        commentList.lastElementChild?.scrollIntoView({ behavior: 'smooth' });
      }

      showToast('Comment added');
      await App.updateBadges();

    } catch (err) {
      showToast('Could not save comment. Please try again.');
      console.error('[Panel] add comment:', err);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Add comment'; }
    }
  }

  // ── Close ───────────────────────────────────────────────────
  function close() {
    const panelEl = $('detail-panel');
    if (panelEl) panelEl.classList.remove('open');
    currentTicketNo = null;
  }

  function getCurrent() { return currentTicketNo; }

  return { open, close, getCurrent };

})();
