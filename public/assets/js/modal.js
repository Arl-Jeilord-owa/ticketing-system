/**
 * modal.js — New-ticket modal (employee portal).
 * Submit now POSTs to /api/tickets via TicketStore.create().
 */

const Modal = (() => {

  let selectedType = 'internal';

  // ── Open ────────────────────────────────────────────────────
  function open() {
    selectedType = 'internal';

    $('modal-container').innerHTML = `
      <div class="modal-overlay" id="modal-overlay">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-heading">
          <div class="modal-header">
            <span class="modal-header-title" id="modal-heading">Create new ticket</span>
            <button class="btn btn-sm" id="modal-close-btn" aria-label="Close">&times;</button>
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

    // Dismiss on overlay click
    $('modal-overlay').addEventListener('click', e => {
      if (e.target === $('modal-overlay')) close();
    });

    $('modal-close-btn').addEventListener('click',  close);
    $('modal-cancel-btn').addEventListener('click', close);
    $('modal-submit-btn').addEventListener('click', submit);

    // Keyboard dismiss
    document.addEventListener('keydown', handleEsc);

    // Type toggle buttons
    qsa('[data-type]', $('modal-container')).forEach(btn => {
      btn.addEventListener('click', () => {
        selectedType = btn.dataset.type;
        qsa('[data-type]', $('modal-container')).forEach(b =>
          b.classList.toggle('active', b.dataset.type === selectedType)
        );
      });
    });

    setTimeout(() => $('new-subject')?.focus(), 60);
  }

  function handleEsc(e) {
    if (e.key === 'Escape') close();
  }

  // ── Submit ──────────────────────────────────────────────────
  async function submit() {
    const subject   = ($('new-subject')   ?.value || '').trim();
    const requester = ($('new-requester') ?.value || '').trim();
    const dept      = $('new-dept')       ?.value || 'IT';
    const priority  = $('new-priority')   ?.value || 'medium';
    const assignee  = ($('new-assignee')  ?.value || '').trim();
    const email     = ($('new-email')     ?.value || '').trim();
    const desc      = ($('new-desc')      ?.value || '').trim();

    if (!subject)   { showToast('Subject is required.');            return; }
    if (!requester) { showToast('Requester name is required.');     return; }

    const submitBtn = $('modal-submit-btn');
    if (submitBtn)  { submitBtn.disabled = true; submitBtn.textContent = 'Creating…'; }

    try {
      const result = await TicketStore.create({
        type:        selectedType,
        dept,
        subject,
        priority,
        requester,
        assignee:    assignee || 'Unassigned',
        description: desc,
        email:       email || null,
      });

      close();
      await App.navigateTo('all');
      showToast('Ticket ' + result.ticketNo + ' created');

    } catch (err) {
      showToast('Could not create ticket. Please try again.');
      console.error('[Modal.submit]', err);
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Create ticket'; }
    }
  }

  // ── Close ────────────────────────────────────────────────────
  function close() {
    document.removeEventListener('keydown', handleEsc);
    const overlay = $('modal-container');
    if (overlay) overlay.innerHTML = '';
  }

  return { open, close };

})();
