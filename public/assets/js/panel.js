const Panel = (() => {
  let currentTicketId = null;

  function open(ticketId) {
    const tk = TicketStore.getById(ticketId);
    if (!tk) return;
    currentTicketId = ticketId;
    renderCurrent();
    $('detail-panel').classList.add('open');
  }

  function renderCurrent() {
    const tk = TicketStore.getById(currentTicketId);
    if (!tk) {
      close();
      return;
    }

    $('panel-title').textContent =
      tk.id + ' · ' + (tk.subject.length > 35 ? tk.subject.slice(0, 35) + '…' : tk.subject);

    $('panel-body').innerHTML = renderPanelBody(tk);
    $('panel-footer').innerHTML = `
      <button class="btn" id="panel-cancel-btn">Close</button>
      <button class="btn btn-primary" id="panel-comment-btn">Add comment</button>`;

    const statusGroup = $('status-btn-group');
    if (statusGroup) {
      statusGroup.addEventListener('click', e => {
        const btn = e.target.closest('[data-status]');
        if (!btn) return;
        TicketStore.setStatus(currentTicketId, btn.dataset.status);
        renderCurrent();
        App.refreshContent();
        showToast('Status updated');
      });
    }

    const actions = $('ticket-action-group');
    if (actions) {
      actions.addEventListener('click', e => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        const action = btn.dataset.action;

        if (action === 'favorite') {
          TicketStore.toggleFavorite(currentTicketId);
          renderCurrent();
          App.refreshContent();
          showToast('Favorite updated');
          return;
        }

        if (action === 'archive') {
          TicketStore.toggleArchive(currentTicketId);
          renderCurrent();
          App.refreshContent();
          showToast('Archive updated');
          return;
        }

        if (action === 'edit') {
          const tk = TicketStore.getById(currentTicketId);
          const subject = prompt('Edit subject:', tk.subject);
          if (subject === null) return;

          const description = prompt('Edit description:', tk.description || '');
          if (description === null) return;

          TicketStore.update(currentTicketId, {
            subject: subject.trim() || tk.subject,
            description: description.trim()
          });

          renderCurrent();
          App.refreshContent();
          showToast('Ticket updated');
          return;
        }

        if (action === 'delete') {
          if (!confirm('Delete this ticket permanently?')) return;
          TicketStore.remove(currentTicketId);
          close();
          App.refreshContent();
          showToast('Ticket deleted');
        }
      });
    }

    $('panel-cancel-btn')?.addEventListener('click', close);
    $('panel-comment-btn')?.addEventListener('click', submitComment);
  }

  function submitComment() {
    const textarea = $('new-comment');
    const text = textarea ? textarea.value.trim() : '';
    if (!text) {
      showToast('Please write a comment first.');
      return;
    }

    TicketStore.addComment(currentTicketId, { author: 'Agent', text });
    renderCurrent();
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