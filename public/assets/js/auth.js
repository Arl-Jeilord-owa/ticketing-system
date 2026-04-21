const Auth = (() => {
  let session = null;

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

  function showEmployeeApp() {
    $('auth-gate')?.classList.add('hidden');
    $('app-shell')?.classList.remove('hidden');
    $('employee-app')?.classList.remove('hidden');

    if (session?.name && $('session-info')) {
      $('session-info').textContent = `${session.name} · ${session.empRole || 'employee'}`;
    }

    App.init();
  }

  async function handleEmployeeLogin() {
    clearError('emp-error');

    const email = ($('emp-email')?.value || '').trim();
    const password = ($('emp-password')?.value || '').trim();

    if (!email || !password) {
      showError('emp-error', 'Email and password are required.');
      return;
    }

    try {
      const res = await fetch('/api/auth/employee-login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        showError('emp-error', data.error || 'Login failed.');
        return;
      }

      session = data.user || { email };
      showEmployeeApp();

    } catch (err) {
      console.error('[employee-login]', err);
      showError('emp-error', 'Server error. Please try again.');
    }
  }

  async function checkSession() {
    try {
      const res = await fetch('/api/auth/session', {
        credentials: 'include',
      });

      if (!res.ok) return;

      const data = await res.json();
      if (data?.authenticated && data.user?.role === 'employee') {
        session = data.user;
        showEmployeeApp();
      }
    } catch {}
  }

  async function handleSignOut() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {}

    location.reload();
  }

  function bindUI() {
    $('btn-employee-login')?.addEventListener('click', handleEmployeeLogin);

    $('toggle-pw')?.addEventListener('click', () => {
      const input = $('emp-password');
      const show = $('pw-eye-show');
      const hide = $('pw-eye-hide');
      if (!input) return;

      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      show?.classList.toggle('hidden', isPassword);
      hide?.classList.toggle('hidden', !isPassword);
    });

    $('emp-password')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleEmployeeLogin();
    });
  }

  function init() {
    bindUI();
    checkSession();
  }

  return {
    init,
    handleSignOut,
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  Auth.init();
});