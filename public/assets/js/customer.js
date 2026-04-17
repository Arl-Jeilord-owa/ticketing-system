/**
 * customer.js — Customer-facing ticket submission portal.
 *
 * Shown after successful OTP verification.
 * POSTs to /api/tickets with full customer profile payload.
 * Enforces 1-hour cooldown (server returns 429 if active).
 */

const CustomerPortal = (() => {

  let session       = null;
  let signOutCb     = null;
  let cooldownTimer = null;

  // ── Init ────────────────────────────────────────────────────
  function init(sess, signOutCallback) {
    session   = sess;
    signOutCb = signOutCallback;

    const signoutBtn = $('btn-customer-signout');
    if (signoutBtn) signoutBtn.addEventListener('click', () => {
      clearInterval(cooldownTimer);
      signOutCb();
    });

    render();
  }

  // ── Render: check cooldown first ────────────────────────────
  async function render() {
    clearInterval(cooldownTimer);
    const area = $('customer-content');
    if (!area) return;

    area.innerHTML = `<div class="loading-row" style="padding:48px;justify-content:center;"><div class="loading-spinner"></div></div>`;

    // Check cooldown with the server
    try {
      const res = await fetch('/api/tickets/cooldown?phone=' + encodeURIComponent(session.phone), {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.cooldown && data.remaining > 0) {
        renderCooldown(area, data.remaining);
        return;
      }
    } catch {
      // Offline: check localStorage
      const remaining = Auth.getRemainingCooldown(session.phone);
      if (remaining > 0) {
        renderCooldown(area, remaining);
        return;
      }
    }

    renderForm(area);
  }

  // ── Cooldown screen ─────────────────────────────────────────
  function renderCooldown(area, initialMs) {
    let remaining = initialMs;

    area.innerHTML = `
      <div class="customer-cooldown-card">
        <div class="cooldown-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="26" height="26">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
        </div>
        <div class="cooldown-title">Ticket already submitted</div>
        <div class="cooldown-desc">
          To prevent spam, you can only submit one ticket per hour.<br>
          Your next submission will be available in:
        </div>
        <div class="cooldown-timer-display" id="cooldown-countdown">${Auth.formatCooldown(remaining)}</div>
        <div class="cooldown-desc" style="margin-top:14px;font-size:12px;">
          If your issue is urgent, please call our support line directly.
        </div>
      </div>`;

    cooldownTimer = setInterval(() => {
      remaining -= 1000;
      const el = $('cooldown-countdown');
      if (remaining <= 0) {
        clearInterval(cooldownTimer);
        renderForm($('customer-content'));
        return;
      }
      if (el) el.textContent = Auth.formatCooldown(remaining);
    }, 1000);
  }

  // ── Submission form ─────────────────────────────────────────
  function renderForm(area) {
    const fullName = `${session.firstName || ''} ${session.lastName || ''}`.trim();
    const cityLabel = session.city && session.city !== 'Other' ? session.city : '';
    const countryLabel = session.country || '';

    area.innerHTML = `
      <div class="customer-form-card">
        <div class="customer-form-header">
          <div class="customer-form-title">Submit a support ticket</div>
          <div class="customer-form-subtitle">
            Hello, <strong>${escapeHtml(fullName)}</strong> &mdash;
            ${cityLabel ? escapeHtml(cityLabel) + ', ' : ''}${escapeHtml(countryLabel)}
          </div>
        </div>
        <div class="customer-form-body">

          <div class="c-field-row">
            <div class="c-field">
              <label for="c-name">Full name</label>
              <input type="text" id="c-name" value="${escapeHtml(fullName)}" readonly
                style="background:var(--bg-secondary);cursor:not-allowed;" />
            </div>
            <div class="c-field">
              <label for="c-email">Email</label>
              <input type="email" id="c-email" value="${escapeHtml(session.email || '')}" readonly
                style="background:var(--bg-secondary);cursor:not-allowed;" />
            </div>
          </div>

          <div class="c-field">
            <label for="c-subject">Subject / Issue title <span style="color:var(--color-red-400);">*</span></label>
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
            <label for="c-description">Describe your issue <span style="color:var(--color-red-400);">*</span></label>
            <textarea id="c-description"
              placeholder="Please provide as much detail as possible — steps to reproduce, error messages, screenshots, etc."></textarea>
          </div>

          <div class="auth-error hidden" id="form-error"></div>

        </div>
        <div class="customer-form-footer">
          <button class="btn-auth" id="btn-submit-ticket"
            style="width:auto;padding:11px 32px;">Submit ticket</button>
        </div>
      </div>`;

    $('btn-submit-ticket').addEventListener('click', handleSubmit);
  }

  // ── Form submission ─────────────────────────────────────────
  async function handleSubmit() {
    const subject  = ($('c-subject')     ?.value || '').trim();
    const cat      = $('c-category')     ?.value || 'Other';
    const priority = $('c-priority')     ?.value || 'medium';
    const desc     = ($('c-description') ?.value || '').trim();

    const errEl = $('form-error');
    if (errEl) errEl.classList.add('hidden');

    if (!subject) {
      if (errEl) { errEl.textContent = 'Please enter a subject for your ticket.'; errEl.classList.remove('hidden'); }
      return;
    }
    if (!desc) {
      if (errEl) { errEl.textContent = 'Please describe your issue.'; errEl.classList.remove('hidden'); }
      return;
    }

    const btn = $('btn-submit-ticket');
    if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }

    try {
      const result = await TicketStore.submitCustomer({
        type:        'external',
        dept:        cat,
        subject,
        priority,
        requester:   `${session.firstName} ${session.lastName}`.trim(),
        assignee:    'Unassigned',
        description: desc,
        phone:       session.phone,
        email:       session.email,
        // Customer profile fields → stored in customer_profiles table
        firstName:     session.firstName,
        lastName:      session.lastName,
        customerEmail: session.email,
        country:       session.country,
        city:          session.city,
        address:       session.address,
      });

      // Set local cooldown as well (belt-and-suspenders)
      Auth.setCooldown(session.phone);

      renderSuccess($('customer-content'), result.ticketNo || 'TK-????', session.firstName);

    } catch (err) {
      if (err.status === 429) {
        // Server says cooldown is active
        renderCooldown($('customer-content'), err.remaining || Auth.COOLDOWN_MS);
        return;
      }
      if (errEl) {
        errEl.textContent = 'Could not submit your ticket. Please try again.';
        errEl.classList.remove('hidden');
      }
      console.error('[CustomerPortal.submit]', err);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Submit ticket'; }
    }
  }

  // ── Success screen ──────────────────────────────────────────
  function renderSuccess(area, ticketNo, firstName) {
    area.innerHTML = `
      <div class="customer-success-card">
        <div class="success-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="26" height="26">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <div class="success-title">Ticket submitted!</div>
        <div class="success-desc">
          Thank you, <strong>${escapeHtml(firstName)}</strong>.
          Your support request has been received.
        </div>
        <div class="success-desc">Your ticket reference number:</div>
        <span class="success-ticket-id">${escapeHtml(ticketNo)}</span>
        <div class="success-note">
          A confirmation has been sent to <strong>${escapeHtml(session.email)}</strong>.<br>
          Our team will follow up shortly.<br><br>
          You may submit another ticket in <strong>1 hour</strong>.
        </div>
      </div>`;
  }

  return { init };

})();
