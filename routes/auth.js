/**
 * auth.js — Frontend authentication gate
 *
 * CUSTOMER FLOW (3 steps):
 *   Step 1 → screen-customer-info   : First/last name, email, country, city, address
 *   Step 2 → screen-customer-phone  : PH/JP phone number + cooldown check
 *   Step 3 → screen-customer-otp    : 6-digit OTP verification
 *
 * EMPLOYEE FLOW:
 *   → screen-employee-login : @omtpi.com.ph email OR cPanel all@omtpi.com.ph member
 *
 * Backend integration:
 *   All API calls go to /api/auth/* (Express routes in routes/auth.js)
 *   When NODE_ENV !== 'production', the server returns dev_otp for demo.
 *
 * cPanel mailing list:
 *   The server's routes/auth.js checks if the employee email is a member of
 *   all@omtpi.com.ph by scraping the webmail membership list via cPanel UAPI.
 *   The frontend does NOT call cPanel directly — it calls POST /api/auth/employee-login.
 */

const Auth = (() => {

  // ── Constants ──────────────────────────────────────────────
  const COOLDOWN_MS     = 60 * 60 * 1000; // 1 hour
  const OTP_RESEND_SECS = 60;
  const COOLDOWN_KEY    = 'omtpi_ticket_cooldown';

  // Demo credentials (frontend fallback when no backend is running)
  const DEMO_EMPLOYEES = [
    { email: 'agent@omtpi.com.ph',  password: 'password123', name: 'Support Agent' },
    { email: 'it@omtpi.com.ph',     password: 'password123', name: 'IT Support' },
    { email: 'hr@omtpi.com.ph',     password: 'password123', name: 'HR Team' },
    { email: 'admin@omtpi.com.ph',  password: 'password123', name: 'Admin' },
  ];

  // ── State ──────────────────────────────────────────────────
  let customerInfo    = {};   // { firstName, lastName, email, country, city, address }
  let currentPhone    = '';
  let currentCountry  = '+63';
  let generatedOTP    = '';
  let resendTimer     = null;
  let cooldownTimer   = null;
  let otpSecondsLeft  = OTP_RESEND_SECS;
  let session         = null;

  // ── Screen switching ───────────────────────────────────────
  function showScreen(id) {
    qsa('.auth-screen').forEach(s => s.classList.remove('active'));
    const el = $(id);
    if (el) {
      el.classList.add('active');
      // Focus first input in new screen
      setTimeout(() => {
        const first = el.querySelector('input:not([type=hidden])');
        if (first) first.focus();
      }, 80);
    }
  }

  // ── Error helpers ──────────────────────────────────────────
  function showError(id, msg) {
    const el = $(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
  }
  function clearError(id) {
    const el = $(id);
    if (el) el.classList.add('hidden');
  }

  // ── Cooldown (localStorage) ────────────────────────────────
  function getCooldowns() {
    try { return JSON.parse(localStorage.getItem(COOLDOWN_KEY) || '{}'); }
    catch { return {}; }
  }
  function setCooldown(key) {
    const map = getCooldowns();
    map[key] = Date.now();
    localStorage.setItem(COOLDOWN_KEY, JSON.stringify(map));
  }
  function getRemainingCooldown(key) {
    const ts = getCooldowns()[key];
    if (!ts) return 0;
    const rem = COOLDOWN_MS - (Date.now() - ts);
    return rem > 0 ? rem : 0;
  }
  function formatCooldown(ms) {
    const s = Math.ceil(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
  }
  function phoneKey(country, number) {
    return country + number.replace(/\D/g, '');
  }

  // ── Phone validation ───────────────────────────────────────
  function validatePhone(country, number) {
    const d = number.replace(/\D/g, '');
    if (country === '+63') return /^9\d{9}$/.test(d);
    if (country === '+81') return /^\d{10,11}$/.test(d);
    return false;
  }

  // ── OTP helpers ────────────────────────────────────────────
  function generateOTPLocal() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  function startResendTimer() {
    clearInterval(resendTimer);
    otpSecondsLeft = OTP_RESEND_SECS;
    const timerEl   = $('otp-timer');
    const timerRow  = document.querySelector('.otp-timer-label');
    const resendBtn = $('btn-resend-otp');
    if (resendBtn) resendBtn.classList.add('hidden');
    if (timerRow)  timerRow.style.display = '';

    resendTimer = setInterval(() => {
      otpSecondsLeft--;
      if (timerEl) timerEl.textContent = otpSecondsLeft;
      if (otpSecondsLeft <= 0) {
        clearInterval(resendTimer);
        if (timerRow)  timerRow.style.display = 'none';
        if (resendBtn) resendBtn.classList.remove('hidden');
      }
    }, 1000);
  }

  function bindOTPInputs() {
    const digits = qsa('.otp-digit', $('otp-inputs'));
    digits.forEach((input, i) => {
      input.value = '';
      input.classList.remove('filled');

      input.addEventListener('input', () => {
        const val = input.value.replace(/\D/g, '');
        input.value = val ? val[0] : '';
        input.classList.toggle('filled', !!input.value);
        if (input.value && i < digits.length - 1) digits[i + 1].focus();
      });

      input.addEventListener('keydown', e => {
        if (e.key === 'Backspace' && !input.value && i > 0) {
          digits[i - 1].value = '';
          digits[i - 1].classList.remove('filled');
          digits[i - 1].focus();
        }
        if (e.key === 'ArrowLeft'  && i > 0)              digits[i - 1].focus();
        if (e.key === 'ArrowRight' && i < digits.length - 1) digits[i + 1].focus();
      });

      input.addEventListener('paste', e => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData)
          .getData('text').replace(/\D/g, '');
        [...text.slice(0, 6)].forEach((ch, j) => {
          if (digits[j]) { digits[j].value = ch; digits[j].classList.add('filled'); }
        });
        digits[Math.min(text.length, digits.length - 1)].focus();
      });
    });
    digits[0].focus();
  }

  function getOTPValue() {
    return qsa('.otp-digit').map(d => d.value).join('');
  }

  // ── Country / city dropdowns ───────────────────────────────
  function populateCountries() {
    const sel = $('c-country');
    if (!sel || typeof GEO_DATA === 'undefined') return;
    GEO_DATA.countries.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.code;
      opt.textContent = c.name;
      sel.appendChild(opt);
    });
  }

  function populateCities(countryCode) {
    const sel = $('c-city');
    if (!sel || typeof GEO_DATA === 'undefined') return;
    sel.innerHTML = '';
    sel.disabled = false;

    const cities = GEO_DATA.getCities(countryCode);
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '— Select city —';
    sel.appendChild(placeholder);

    cities.forEach(city => {
      const opt = document.createElement('option');
      opt.value = city;
      opt.textContent = city;
      sel.appendChild(opt);
    });

    // Auto-sync phone country code if PH or JP
    const country = GEO_DATA.countries.find(c => c.code === countryCode);
    if (country && country.phone) {
      const phoneCountrySel = $('phone-country');
      if (phoneCountrySel) phoneCountrySel.value = country.phone;
    }
  }

  // ── Init ───────────────────────────────────────────────────
  function init() {
    populateCountries();

    // Role picker
    $('btn-role-customer').addEventListener('click', () => showScreen('screen-customer-info'));
    $('btn-role-employee').addEventListener('click', () => showScreen('screen-employee-login'));

    // Back buttons
    $('back-from-info').addEventListener('click',     () => showScreen('screen-landing'));
    $('back-from-phone').addEventListener('click',    () => showScreen('screen-customer-info'));
    $('back-from-otp').addEventListener('click',      () => showScreen('screen-customer-phone'));
    $('back-from-employee').addEventListener('click', () => showScreen('screen-landing'));

    // Country → city cascade
    $('c-country').addEventListener('change', e => {
      populateCities(e.target.value);
    });

    // Info screen
    $('btn-info-next').addEventListener('click', handleInfoNext);

    // Phone screen
    $('btn-send-otp').addEventListener('click', handleSendOTP);
    $('phone-number').addEventListener('keydown', e => { if (e.key === 'Enter') handleSendOTP(); });

    // OTP screen
    $('btn-verify-otp').addEventListener('click', handleVerifyOTP);
    $('btn-resend-otp').addEventListener('click', handleResendOTP);

    // Employee screen
    $('btn-employee-login').addEventListener('click', handleEmployeeLogin);
    $('emp-password').addEventListener('keydown', e => { if (e.key === 'Enter') handleEmployeeLogin(); });

    // Password toggle
    $('toggle-pw').addEventListener('click', () => {
      const inp  = $('emp-password');
      const show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      $('pw-eye-show').classList.toggle('hidden', show);
      $('pw-eye-hide').classList.toggle('hidden', !show);
    });

    // Theme toggles (both employee & customer sides)
    document.addEventListener('click', e => {
      if (e.target.closest('#theme-toggle') || e.target.closest('#theme-toggle-customer')) {
        if (window.ThemeManager) window.ThemeManager.toggle();
      }
    });
  }

  // ── Handler: customer info ─────────────────────────────────
  function handleInfoNext() {
    clearError('info-error');

    const firstName = ($('c-first-name')?.value || '').trim();
    const lastName  = ($('c-last-name')?.value  || '').trim();
    const email     = ($('c-email')?.value       || '').trim();
    const country   = $('c-country')?.value      || '';
    const city      = $('c-city')?.value         || '';
    const address   = ($('c-address')?.value     || '').trim();

    if (!firstName) { showError('info-error', 'First name is required.'); return; }
    if (!lastName)  { showError('info-error', 'Last name is required.');  return; }
    if (!email)     { showError('info-error', 'Email address is required.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showError('info-error', 'Please enter a valid email address.');
      return;
    }
    if (!country)   { showError('info-error', 'Please select your country.'); return; }
    if (!city)      { showError('info-error', 'Please select your city.'); return; }

    // Save to state
    customerInfo = { firstName, lastName, email, country, city, address };

    showScreen('screen-customer-phone');
  }

  // ── Handler: send OTP ──────────────────────────────────────
  function handleSendOTP() {
    clearError('phone-error');
    const country = $('phone-country').value;
    const number  = ($('phone-number')?.value || '').trim();
    currentCountry = country;
    currentPhone   = number;

    if (!validatePhone(country, number)) {
      showError('phone-error',
        country === '+63'
          ? 'Invalid PH number. Enter a valid 10-digit mobile (e.g. 9171234567).'
          : 'Invalid JP number. Enter a valid 10–11 digit number including area code.'
      );
      return;
    }

    const key       = phoneKey(country, number);
    const remaining = getRemainingCooldown(key);

    if (remaining > 0) {
      showCooldownBanner(remaining, key);
      return;
    }

    // Try backend, fall back to local simulation
    sendOTPViaBackend(country, number)
      .then(otp => {
        if (otp) $('dev-otp-display').textContent = otp; // demo only
        $('otp-sent-to').textContent = `Sent to ${country} ${number}`;
        showScreen('screen-customer-otp');
        bindOTPInputs();
        startResendTimer();
      })
      .catch(() => {
        // Offline / no backend — simulate locally
        generatedOTP = generateOTPLocal();
        $('dev-otp-display').textContent = generatedOTP;
        $('otp-sent-to').textContent = `[Demo] Sent to ${country} ${number}`;
        showScreen('screen-customer-otp');
        bindOTPInputs();
        startResendTimer();
      });
  }

  async function sendOTPViaBackend(country, number) {
    const res = await fetch('/api/auth/send-otp', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ country, phone: number }),
      credentials: 'include',
    });
    if (res.status === 429) {
      const data = await res.json();
      showCooldownBanner(data.remaining || COOLDOWN_MS, phoneKey(country, number));
      throw new Error('cooldown');
    }
    if (!res.ok) throw new Error('send-otp failed');
    const data = await res.json();
    generatedOTP = data.dev_otp || '';  // only present in dev mode
    return data.dev_otp || null;
  }

  function showCooldownBanner(remainingMs, key) {
    const banner = $('cooldown-banner');
    if (!banner) return;
    banner.classList.remove('hidden');
    const update = () => {
      const rem = getRemainingCooldown(key) || remainingMs;
      $('cooldown-text').textContent =
        `You've already submitted a ticket. Please wait ${formatCooldown(rem)} before submitting again.`;
    };
    update();
    clearInterval(cooldownTimer);
    cooldownTimer = setInterval(() => {
      const rem = getRemainingCooldown(key);
      if (rem <= 0) { clearInterval(cooldownTimer); banner.classList.add('hidden'); return; }
      $('cooldown-text').textContent =
        `You've already submitted a ticket. Please wait ${formatCooldown(rem)} before submitting again.`;
    }, 1000);
  }

  // ── Handler: resend OTP ────────────────────────────────────
  function handleResendOTP() {
    sendOTPViaBackend(currentCountry, currentPhone)
      .then(otp => {
        if (otp) $('dev-otp-display').textContent = otp;
        clearError('otp-error');
        bindOTPInputs();
        startResendTimer();
      })
      .catch(() => {
        generatedOTP = generateOTPLocal();
        $('dev-otp-display').textContent = generatedOTP;
        clearError('otp-error');
        bindOTPInputs();
        startResendTimer();
      });
  }

  // ── Handler: verify OTP ────────────────────────────────────
  async function handleVerifyOTP() {
    clearError('otp-error');
    const entered = getOTPValue();

    if (entered.length !== 6) {
      showError('otp-error', 'Please enter all 6 digits.');
      return;
    }

    try {
      // Try backend verification
      const res = await fetch('/api/auth/verify-otp', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ country: currentCountry, phone: currentPhone, code: entered }),
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json();
        showError('otp-error', data.error || 'Incorrect OTP. Please try again.');
        qsa('.otp-digit').forEach(d => { d.value = ''; d.classList.remove('filled'); });
        qsa('.otp-digit')[0]?.focus();
        return;
      }
    } catch {
      // Offline fallback — check against locally generated OTP
      if (entered !== generatedOTP) {
        showError('otp-error', 'Incorrect OTP. Please try again.');
        qsa('.otp-digit').forEach(d => { d.value = ''; d.classList.remove('filled'); });
        qsa('.otp-digit')[0]?.focus();
        return;
      }
    }

    // Success — set cooldown
    const key = phoneKey(currentCountry, currentPhone);
    setCooldown(key);
    clearInterval(resendTimer);

    session = {
      role:      'customer',
      phone:     currentCountry + currentPhone.replace(/\D/g, ''),
      firstName: customerInfo.firstName,
      lastName:  customerInfo.lastName,
      email:     customerInfo.email,
      country:   customerInfo.country,
      city:      customerInfo.city,
      address:   customerInfo.address,
    };

    openCustomerPortal();
  }

  // ── Handler: employee login ────────────────────────────────
  async function handleEmployeeLogin() {
    clearError('emp-error');
    const email    = ($('emp-email')?.value    || '').trim();
    const password = ($('emp-password')?.value || '');

    if (!email)    { showError('emp-error', 'Please enter your company email.'); return; }
    if (!password) { showError('emp-error', 'Please enter your password.');       return; }

    // Disable button while checking
    const btn = $('btn-employee-login');
    if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }

    try {
      const res = await fetch('/api/auth/employee-login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
        credentials: 'include',
      });
      const data = await res.json();

      if (!res.ok) {
        showError('emp-error', data.error || 'Login failed. Please try again.');
        return;
      }

      session = { role: 'employee', name: data.name, email };
      openEmployeePortal();

    } catch {
      // Offline fallback — check demo credentials
      const isCompany = email.toLowerCase().endsWith('@omtpi.com.ph');
      if (!isCompany) {
        showError('emp-error', 'Access denied. Only @omtpi.com.ph addresses are allowed.');
        return;
      }
      const emp = DEMO_EMPLOYEES.find(e =>
        e.email.toLowerCase() === email.toLowerCase() && e.password === password
      );
      if (!emp) {
        showError('emp-error', 'Incorrect email or password.');
        return;
      }
      session = { role: 'employee', name: emp.name, email: emp.email };
      openEmployeePortal();

    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Sign in'; }
    }
  }

  // ── Portal transitions ─────────────────────────────────────
  function openCustomerPortal() {
    $('auth-gate').classList.add('hidden');
    $('app-shell').classList.remove('hidden');
    $('employee-app').classList.add('hidden');
    $('customer-portal').classList.remove('hidden');

    $('customer-user-info').textContent =
      `${session.firstName} ${session.lastName} · ${session.phone}`;

    CustomerPortal.init(session, handleSignOut);
  }

  function openEmployeePortal() {
    $('auth-gate').classList.add('hidden');
    $('app-shell').classList.remove('hidden');
    $('customer-portal').classList.add('hidden');
    $('employee-app').classList.remove('hidden');
    $('session-info').textContent = session.email;
    App.init();
  }

  function handleSignOut() {
    // Call backend logout
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});

    // Clear state
    session         = null;
    customerInfo    = {};
    currentPhone    = '';
    generatedOTP    = '';
    clearInterval(resendTimer);
    clearInterval(cooldownTimer);

    // Reset UI
    $('app-shell').classList.add('hidden');
    $('auth-gate').classList.remove('hidden');
    showScreen('screen-landing');

    // Clear all form fields
    [
      'c-first-name','c-last-name','c-email','c-address',
      'phone-number','emp-email','emp-password'
    ].forEach(id => { const el = $(id); if (el) el.value = ''; });

    const countrySel = $('c-country');
    if (countrySel) countrySel.value = '';
    const citySel = $('c-city');
    if (citySel) { citySel.innerHTML = '<option value="">— Select country first —</option>'; citySel.disabled = true; }

    qsa('.auth-error').forEach(e => e.classList.add('hidden'));
    qsa('.cooldown-banner').forEach(b => b.classList.add('hidden'));
  }

  // ── Public API ─────────────────────────────────────────────
  return {
    init,
    getSession:           () => session,
    handleSignOut,
    setCooldown,
    getRemainingCooldown,
    phoneKey,
    formatCooldown,
    COOLDOWN_MS,
  };

})();

document.addEventListener('DOMContentLoaded', () => Auth.init());
