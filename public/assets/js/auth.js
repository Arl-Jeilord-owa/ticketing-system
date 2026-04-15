/**
 * auth.js
 * Authentication gate logic.
 *
 * CUSTOMER flow:
 *   1. Pick role → customer
 *   2. Enter PH (+63) or JP (+81) phone number (validated)
 *   3. Cooldown check: 1-hour cooldown per phone number (stored in localStorage)
 *   4. Receive simulated OTP (demo: shown on screen)
 *   5. Enter 6-digit OTP → verified → enter customer portal
 *
 * EMPLOYEE flow:
 *   1. Pick role → employee
 *   2. Enter @omtpi.com.ph email OR cPanel-allowlisted email + password
 *   3. Validate → enter full agent dashboard
 *
 * Real implementation notes:
 *   - Replace simulateOTPSend() with an SMS gateway API call (e.g. Semaphore for PH, Twilio)
 *   - Replace validateEmployeeCredentials() with a backend auth endpoint
 *   - Move cooldown tracking server-side to prevent localStorage manipulation
 */

const Auth = (() => {

  /* ─────────────────────────────────────────
     Constants
  ───────────────────────────────────────── */

  const COOLDOWN_MS      = 0; // 60 * 60 * 1000 = 1 hour
  const OTP_RESEND_SECS  = 60;
  const OTP_EXPIRY_SECS  = 300; // 5 minutes

  /** cPanel-registered allowlist (extend as needed) */
  const CPANEL_ALLOWLIST = [
    'support@omtpi.com.ph',
    'it@omtpi.com.ph',
    'hr@omtpi.com.ph',
    'billing@omtpi.com.ph',
    'agent@omtpi.com.ph',
    'admin@omtpi.com.ph',
  ];

  /** Demo employee credentials (replace with real backend check) */
  const DEMO_EMPLOYEES = [
    { email: 'agent@omtpi.com.ph',   password: 'password123', name: 'Support Agent' },
    { email: 'it@omtpi.com.ph',      password: 'password123', name: 'IT Support' },
    { email: 'hr@omtpi.com.ph',      password: 'password123', name: 'HR Team' },
    { email: 'admin@omtpi.com.ph',   password: 'password123', name: 'Admin' },
  ];

  /* ─────────────────────────────────────────
     State
  ───────────────────────────────────────── */
  let currentPhone    = '';
  let currentCountry  = '+63';
  let generatedOTP    = '';
  let otpTimerHandle  = null;
  let resendTimerHandle = null;
  let otpSecondsLeft  = OTP_RESEND_SECS;
  let session         = null; // { role, name, phone? }

  /* ─────────────────────────────────────────
     Screen switching
  ───────────────────────────────────────── */
  function showScreen(id) {
    qsa('.auth-screen').forEach(s => s.classList.remove('active'));
    const el = $(id);
    if (el) el.classList.add('active');
  }

  /* ─────────────────────────────────────────
     Phone number validation
  ───────────────────────────────────────── */
  function validatePhone(country, number) {
    const digits = number.replace(/\D/g, '');
    if (country === '+63') {
      // PH: 10 digits starting with 9 (mobile) or 2-digit area + 7 digits (landline)
      return /^9\d{9}$/.test(digits) || /^[2-9]\d{9}$/.test(digits);
    }
    if (country === '+81') {
      // JP: 10 or 11 digits
      return /^\d{10,11}$/.test(digits);
    }
    return false;
  }

  /* ─────────────────────────────────────────
     Cooldown (1-hour lock per phone number)
  ───────────────────────────────────────── */
  const COOLDOWN_KEY = 'omtpi_ticket_cooldown';

  function getCooldowns() {
    try {
      return JSON.parse(localStorage.getItem(COOLDOWN_KEY) || '{}');
    } catch { return {}; }
  }

  function setCooldown(phoneKey) {
    const map = getCooldowns();
    map[phoneKey] = Date.now();
    localStorage.setItem(COOLDOWN_KEY, JSON.stringify(map));
  }

  function getRemainingCooldown(phoneKey) {
    const map = getCooldowns();
    const ts  = map[phoneKey];
    if (!ts) return 0;
    const elapsed  = Date.now() - ts;
    const remaining = COOLDOWN_MS - elapsed;
    return remaining > 0 ? remaining : 0;
  }

  function formatCooldownTime(ms) {
    const totalSec = Math.ceil(ms / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  }

  function phoneKey(country, number) {
    return country + number.replace(/\D/g, '');
  }

  /* ─────────────────────────────────────────
     OTP generation (6 digits)
  ───────────────────────────────────────── */
  function generateOTP() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  /** Simulate sending OTP — replace with SMS API call in production */
  function simulateOTPSend(country, number, otp) {
    console.log(`[DEMO] OTP for ${country}${number}: ${otp}`);
    // In production: POST to /api/send-otp { country, number, otp }
  }

  /* ─────────────────────────────────────────
     OTP countdown timer
  ───────────────────────────────────────── */
  function startResendTimer() {
    clearInterval(resendTimerHandle);
    otpSecondsLeft = OTP_RESEND_SECS;
    const timerEl  = $('otp-timer');
    const resendBtn = $('btn-resend-otp');
    const timerLabel = document.querySelector('.otp-timer-label');

    if (resendBtn) resendBtn.classList.add('hidden');
    if (timerLabel) timerLabel.style.display = '';

    resendTimerHandle = setInterval(() => {
      otpSecondsLeft--;
      if (timerEl) timerEl.textContent = otpSecondsLeft;
      if (otpSecondsLeft <= 0) {
        clearInterval(resendTimerHandle);
        if (timerLabel) timerLabel.style.display = 'none';
        if (resendBtn) resendBtn.classList.remove('hidden');
      }
    }, 1000);
  }

  /* ─────────────────────────────────────────
     OTP digit input: auto-advance & backspace
  ───────────────────────────────────────── */
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
          digits[i - 1].focus();
          digits[i - 1].value = '';
          digits[i - 1].classList.remove('filled');
        }
        if (e.key === 'ArrowLeft'  && i > 0) digits[i - 1].focus();
        if (e.key === 'ArrowRight' && i < digits.length - 1) digits[i + 1].focus();
      });

      input.addEventListener('paste', e => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
        [...text.slice(0, 6)].forEach((ch, j) => {
          if (digits[j]) { digits[j].value = ch; digits[j].classList.add('filled'); }
        });
        const last = Math.min(text.length, digits.length - 1);
        digits[last].focus();
      });
    });

    digits[0].focus();
  }

  function getOTPValue() {
    return qsa('.otp-digit').map(i => i.value).join('');
  }

  /* ─────────────────────────────────────────
     Employee validation
  ───────────────────────────────────────── */
  function isAllowedEmail(email) {
    const lower = email.toLowerCase().trim();
    if (lower.endsWith('@omtpi.com.ph')) return true;
    if (CPANEL_ALLOWLIST.includes(lower)) return true;
    return false;
  }

  function validateEmployeeCredentials(email, password) {
    // Demo: check against static list
    // Production: POST /api/employee/login { email, password }
    const emp = DEMO_EMPLOYEES.find(e =>
      e.email.toLowerCase() === email.toLowerCase() && e.password === password
    );
    return emp || null;
  }

  /* ─────────────────────────────────────────
     Error display helpers
  ───────────────────────────────────────── */
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

  /* ─────────────────────────────────────────
     Boot: bind all auth UI events
  ───────────────────────────────────────── */
  function init() {
    /* Role selection */
    $('btn-role-customer').addEventListener('click', () => showScreen('screen-customer-phone'));
    $('btn-role-employee').addEventListener('click', () => showScreen('screen-employee-login'));

    /* Back buttons */
    $('back-from-phone').addEventListener('click',    () => showScreen('screen-landing'));
    $('back-from-otp').addEventListener('click',      () => showScreen('screen-customer-phone'));
    $('back-from-employee').addEventListener('click', () => showScreen('screen-landing'));

    /* ── Phone screen ── */
    $('btn-send-otp').addEventListener('click', handleSendOTP);
    $('phone-number').addEventListener('keydown', e => { if (e.key === 'Enter') handleSendOTP(); });

    /* ── OTP screen ── */
    $('btn-verify-otp').addEventListener('click', handleVerifyOTP);
    $('btn-resend-otp').addEventListener('click', handleResendOTP);

    /* ── Employee screen ── */
    $('btn-employee-login').addEventListener('click', handleEmployeeLogin);
    $('emp-password').addEventListener('keydown', e => { if (e.key === 'Enter') handleEmployeeLogin(); });

    /* Password toggle */
    $('toggle-pw').addEventListener('click', () => {
      const input = $('emp-password');
      const isText = input.type === 'text';
      input.type = isText ? 'password' : 'text';
      $('pw-eye-show').classList.toggle('hidden', !isText);
      $('pw-eye-hide').classList.toggle('hidden', isText);
    });
  }

  /* ─────────────────────────────────────────
     Handler: Send OTP
  ───────────────────────────────────────── */
  function handleSendOTP() {
    clearError('phone-error');
    const country = $('phone-country').value;
    const number  = $('phone-number').value.trim();
    currentCountry = country;
    currentPhone   = number;

    if (!validatePhone(country, number)) {
      showError('phone-error',
        country === '+63'
          ? 'Invalid PH number. Enter a valid 10-digit mobile number (e.g. 9171234567).'
          : 'Invalid JP number. Enter a valid 10–11 digit number including area code.'
      );
      return;
    }

    const key       = phoneKey(country, number);
    const remaining = getRemainingCooldown(key);

    if (remaining > 0) {
      showCooldownOnPhoneScreen(remaining, key);
      return;
    }

    // Generate and send OTP
    generatedOTP = generateOTP();
    simulateOTPSend(country, number, generatedOTP);

    // Show on OTP screen
    $('otp-sent-to').textContent = `Sent to ${country} ${number}`;
    $('dev-otp-display').textContent = generatedOTP;

    showScreen('screen-customer-otp');
    bindOTPInputs();
    startResendTimer();
  }

  /* ─────────────────────────────────────────
     Handler: Resend OTP
  ───────────────────────────────────────── */
  function handleResendOTP() {
    generatedOTP = generateOTP();
    simulateOTPSend(currentCountry, currentPhone, generatedOTP);
    $('dev-otp-display').textContent = generatedOTP;
    clearError('otp-error');
    bindOTPInputs();
    startResendTimer();
  }

  /* ─────────────────────────────────────────
     Handler: Verify OTP
  ───────────────────────────────────────── */
  function handleVerifyOTP() {
    clearError('otp-error');
    const entered = getOTPValue();

    if (entered.length !== 6) {
      showError('otp-error', 'Please enter all 6 digits.');
      return;
    }

    if (entered !== generatedOTP) {
      showError('otp-error', 'Incorrect OTP. Please try again.');
      qsa('.otp-digit').forEach(d => { d.value = ''; d.classList.remove('filled'); });
      qsa('.otp-digit')[0].focus();
      return;
    }

    // Success — set cooldown and open customer portal
    const key = phoneKey(currentCountry, currentPhone);
    setCooldown(key);
    clearInterval(resendTimerHandle);

    session = { role: 'customer', phone: currentCountry + currentPhone };
    openCustomerPortal();
  }

  /* ─────────────────────────────────────────
     Cooldown display on phone screen
  ───────────────────────────────────────── */
  function showCooldownOnPhoneScreen(remainingMs, key) {
    const banner = $('cooldown-banner');
    banner.classList.remove('hidden');

    const update = () => {
      const rem = getRemainingCooldown(key);
      if (rem <= 0) {
        clearInterval(otpTimerHandle);
        banner.classList.add('hidden');
        return;
      }
      $('cooldown-text').textContent =
        `You've already submitted a ticket. Please wait ${formatCooldownTime(rem)} before submitting again.`;
    };
    update();
    clearInterval(otpTimerHandle);
    otpTimerHandle = setInterval(update, 1000);
  }

  /* ─────────────────────────────────────────
     Handler: Employee login
  ───────────────────────────────────────── */
  function handleEmployeeLogin() {
    clearError('emp-error');
    const email    = $('emp-email').value.trim();
    const password = $('emp-password').value;

    if (!email) { showError('emp-error', 'Please enter your company email.'); return; }
    if (!isAllowedEmail(email)) {
      showError('emp-error', 'Access denied. Only @omtpi.com.ph addresses or registered cPanel mailboxes are allowed.');
      return;
    }
    if (!password) { showError('emp-error', 'Please enter your password.'); return; }

    const emp = validateEmployeeCredentials(email, password);
    if (!emp) {
      showError('emp-error', 'Incorrect email or password. Please try again.');
      return;
    }

    session = { role: 'employee', name: emp.name, email: emp.email };
    openEmployeePortal();
  }

  /* ─────────────────────────────────────────
     Portal transitions
  ───────────────────────────────────────── */
  function openCustomerPortal() {
    $('auth-gate').classList.add('hidden');
    $('app-shell').classList.remove('hidden');
    $('employee-app').classList.add('hidden');
    $('customer-portal').classList.remove('hidden');
    $('customer-user-info').textContent = `Logged in as ${session.phone}`;
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
    session = null;
    currentPhone = '';
    generatedOTP = '';
    clearInterval(otpTimerHandle);
    clearInterval(resendTimerHandle);
    $('app-shell').classList.add('hidden');
    $('auth-gate').classList.remove('hidden');
    showScreen('screen-landing');
    // Reset form fields
    if ($('phone-number'))  $('phone-number').value  = '';
    if ($('emp-email'))     $('emp-email').value     = '';
    if ($('emp-password'))  $('emp-password').value  = '';
    qsa('.auth-error').forEach(e => e.classList.add('hidden'));
    qsa('.cooldown-banner').forEach(b => b.classList.add('hidden'));
  }

  function getSession() { return session; }

  return { init, getSession, handleSignOut, setCooldown, getRemainingCooldown, phoneKey, formatCooldownTime, COOLDOWN_MS };
})();

document.addEventListener('DOMContentLoaded', () => Auth.init());
