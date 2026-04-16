/**
 * customer.js
 * Customer-facing ticket submission portal.
 *
 * Shown after successful OTP verification.
 * Features:
 *   - Check for active 1-hour cooldown (already set at OTP success, but re-check on load)
 *   - Live countdown timer if in cooldown
 *   - Ticket submission form
 *   - Success screen with ticket ID
 */

const CustomerPortal = (() => {

  let session = null;
  let signOutCb = null;
  let cooldownTimer = null;

  /* ─────────────────────────────────────────
     Init
  ───────────────────────────────────────── */
  function init(sess, signOutCallback) {
    session = sess;
    signOutCb = signOutCallback;

    $('btn-customer-signout').addEventListener('click', () => {
      clearInterval(cooldownTimer);
      signOutCb();
    });

    render();
  }

  /* ─────────────────────────────────────────
     Render: check cooldown first
  ───────────────────────────────────────── */
  function render() {
    clearInterval(cooldownTimer);
    const area = $('customer-content');

    // Cooldown was set at OTP verify — check remaining
    const key = session.phone; // already formatted as "+63XXXXXXXXXX"
    const remaining = Auth.getRemainingCooldown(key);

    if (remaining > 0) {
      renderCooldown(area, key, remaining);
    } else {
      renderForm(area);
    }
  }

  /* ─────────────────────────────────────────
     Cooldown screen
  ───────────────────────────────────────── */
  function renderCooldown(area, key, initialMs) {
    area.innerHTML = `
      <div class="customer-cooldown-card">
        <div class="cooldown-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="24" height="24">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
        </div>
        <div class="cooldown-title">Ticket already submitted</div>
        <div class="cooldown-desc">
          To prevent spam, you can only submit one ticket per hour.<br>
          Your next submission will be available in:
        </div>
        <div class="cooldown-timer-display" id="cooldown-countdown">${Auth.formatCooldownTime(initialMs)}</div>
        <div class="cooldown-desc" style="margin-top:14px;font-size:12px;">
          If your issue is urgent, please call our support line directly.
        </div>
      </div>`;

    cooldownTimer = setInterval(() => {
      const rem = Auth.getRemainingCooldown(key);
      const el = $('cooldown-countdown');
      if (rem <= 0) {
        clearInterval(cooldownTimer);
        renderForm($('customer-content'));
        return;
      }
      if (el) el.textContent = Auth.formatCooldownTime(rem);
    }, 1000);
  }

  /* ─────────────────────────────────────────
     Submission form
  ───────────────────────────────────────── */
  function renderForm(area) {
    area.innerHTML = `
      <div class="customer-form-card">
        <div class="customer-form-header">
          <div class="customer-form-title">Submit a support ticket</div>
          <div class="customer-form-subtitle">Describe your issue and we'll get back to you shortly.</div>
        </div>
        <div class="customer-form-body">

          <div class="c-field-row">
            <div class="c-field">
              <label for="c-name">Full name *</label>
              <input type="text" id="c-name" placeholder="Your name" />
            </div>
            <div class="c-field">
              <label for="c-email">Email address *</label>
              <input type="email" id="c-email" placeholder="you@email.com" />
            </div>
          </div>

          <div class="c-field">
            <label for="c-subject">Subject / Issue title *</label>
            <input type="text" id="c-subject" placeholder="Brief description of your issue" />
          </div>

          <div class="c-field-row">
            <div class="c-field">
              <label for="c-category">Category</label>
              <select id="c-category">
                <option value="Billing">Billing &amp; Payments</option>
                <option value="Technical">Technical issue</option>
                <option value="Account">Account &amp; Access</option>
                <option value="Sales">Sales inquiry</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div class="c-field">
              <label for="c-priority">Urgency</label>
              <select id="c-priority">
                <option value="low">Low — general inquiry</option>
                <option value="medium" selected>Medium — affecting work</option>
                <option value="high">High — blocking work</option>
                <option value="critical">Critical — system down</option>
              </select>
            </div>
          </div>

          <div class="c-field">
            <label for="c-description">Describe your issue *</label>
            <textarea id="c-description" placeholder="Please provide as much detail as possible — steps to reproduce, screenshots, error messages, etc."></textarea>
          </div>

          <div class="auth-error hidden" id="form-error"></div>

        </div>
        <div class="customer-form-footer">
          <button class="btn-auth" id="btn-submit-ticket" style="width:auto;padding:11px 32px;">Submit ticket</button>
        </div>
      </div>`;

    $('btn-submit-ticket').addEventListener('click', handleSubmit);

    // Pre-fill phone
    // (name and email are user's to fill)
  }

  /* ─────────────────────────────────────────
     Form submission
  ───────────────────────────────────────── */
  function handleSubmit() {
    const name = $('c-name') ? $('c-name').value.trim() : '';
    const email = $('c-email') ? $('c-email').value.trim() : '';
    const subject = $('c-subject') ? $('c-subject').value.trim() : '';
    const cat = $('c-category') ? $('c-category').value : 'Other';
    const priority = $('c-priority') ? $('c-priority').value : 'medium';
    const desc = $('c-description') ? $('c-description').value.trim() : '';

    const errEl = $('form-error');
    if (errEl) errEl.classList.add('hidden');

    if (!name || !email || !subject) {
      if (errEl) { errEl.textContent = 'Please fill in all required fields (name, email, subject).'; errEl.classList.remove('hidden'); }
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (errEl) { errEl.textContent = 'Please enter a valid email address.'; errEl.classList.remove('hidden'); }
      return;
    }

    // Create ticket
    fetch('/api/tickets', {
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

    // Cooldown is already active (set at OTP verify), but record submission time too
    // No need to re-set — cooldown was set at OTP

    renderSuccess($('customer-content'), ticket, name);
  }

  /* ─────────────────────────────────────────
     Success screen
  ───────────────────────────────────────── */
  function renderSuccess(area, ticket, name) {
    area.innerHTML = `
      <div class="customer-success-card">
        <div class="success-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="26" height="26">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <div class="success-title">Ticket submitted!</div>
        <div class="success-desc">
          Thank you, <strong>${escapeHtml(name)}</strong>. Your support request has been received.
        </div>
        <div class="success-desc">A confirmation has been noted for:</div>
        <span class="success-ticket-id">${escapeHtml(ticket.id)}</span>
        <div class="success-note">
          Our team will review your ticket and follow up via email.<br>
          You may submit another ticket in <strong>1 hour</strong>.
        </div>
      </div>`;
  }

  return { init };
})();
