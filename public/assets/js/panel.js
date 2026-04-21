const Panel = (() => {
  let currentTicketNo = null;

  async function open(ticketNo) {
    currentTicketNo = ticketNo;
    const panelEl = $('detail-panel');
    if (!panelEl) return;

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

      bindStatusButtons();
      bindCommentButton();
      $('panel-cancel-btn')?.addEventListener('click', close);

    } catch (err) {
      $('panel-body').innerHTML = `<p style="color:var(--color-red-600);padding:12px;">Failed to load ticket.</p>`;
      console.error('[Panel.open]', err);
    }
  }

  function bindStatusButtons() {
    const group = $('status-btn-group');
    if (!group) return;

    group.addEventListener('click', async e => {
      const btn = e.target.closest('[data-status]');
      if (!btn) return;

      const newStatus = btn.dataset.status;
      btn.disabled = true;

      try {
        await TicketStore.setStatus(currentTicketNo, newStatus);
        await open(currentTicketNo);
        await App.refreshContent();
        showToast('Status updated to "' + newStatus + '"');
      } catch (err) {
        btn.disabled = false;
        showToast('Could not update status.');
        console.error('[Panel.status]', err);
      }
    });
  }

  function bindCommentButton() {
    const btn = $('panel-comment-btn');
    if (!btn) return;

    btn.addEventListener('click', async () => {
      const textarea = $('new-comment');
      const text = textarea ? textarea.value.trim() : '';

      if (!text) {
        showToast('Please write a comment first.');
        return;
      }

      try {
        await TicketStore.addComment(currentTicketNo, text);
        await open(currentTicketNo);
        await App.refreshContent();
        showToast('Comment added');
      } catch (err) {
        showToast('Could not add comment.');
        console.error('[Panel.comment]', err);
      }
    });
  }

  function close() {
    $('detail-panel').classList.remove('open');
    currentTicketNo = null;
  }

  function getCurrent() {
    return currentTicketNo;
  }

  return { open, close, getCurrent };
})();