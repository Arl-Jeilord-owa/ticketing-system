/**
 * modal.js
 * New-ticket modal: open, close, type selection, form submission.
 */

const Modal = (() => {
  let selectedType = 'internal';

  function open() {
    selectedType = 'internal';

    $('modal-container').innerHTML = `
      <div class="modal-overlay" id="modal-overlay">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-heading">
          <div class="modal-header">
            <span class="modal-header-title" id="modal-heading">Create new ticket</span>
            <button class="btn btn-sm" id="modal-close-btn" aria-label="Close">✕</button>
          </div>
          <div class="modal-body">
            ${renderModalBody()}
          </div>
          <div class="modal-footer">
            <button class="btn" id="modal-cancel-btn">Cancel</button>
            <button class="btn btn-primary" id="modal-submit-btn">Create ticket</button>
          </div>
        </div>
      </div>`;

    // Close on overlay click
    $('modal-overlay').addEventListener('click', e => {
      if (e.target === $('modal-overlay')) close();
    });

    // Close/cancel buttons
    $('modal-close-btn').addEventListener('click', close);
    $('modal-cancel-btn').addEventListener('click', close);

    // Submit
    $('modal-submit-btn').addEventListener('click', submit);

    // Type selection
    qsa('[data-type]', $('modal-container')).forEach(btn => {
      btn.addEventListener('click', () => {
        selectedType = btn.dataset.type;
        qsa('[data-type]', $('modal-container')).forEach(b =>
          b.classList.toggle('active', b.dataset.type === selectedType)
        );
      });
    });

    // Focus first input
    setTimeout(() => {
      const first = $('new-subject');
      if (first) first.focus();
    }, 50);
  }

  function submit() {
    const subject = $('new-subject') ? $('new-subject').value.trim() : '';
    const requester = $('new-requester') ? $('new-requester').value.trim() : '';

    if (!subject || !requester) {
      showToast('Subject and requester name are required.');
      return;
    }

    const ticket = fetch('/api/tickets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        email,
        subject,
        category: cat,
        priority,
        description: desc,
        phone: session.phone
      })
    })
      .then(res => res.json())
      .then(ticket => {
        renderSuccess($('customer-content'), ticket, name);
      })
      .catch(() => {
        alert('Failed to submit ticket');
      });

    close();
    App.navigateTo('all');
    showToast('Ticket ' + ticket.id + ' created');
  }

  function close() {
    $('modal-container').innerHTML = '';
  }

  return { open, close };
})();
