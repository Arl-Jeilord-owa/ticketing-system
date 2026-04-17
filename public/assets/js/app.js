/**
 * app.js — Employee portal main controller.
 * All data operations are now async (real API calls via data.js).
 * Called by auth.js after successful employee login.
 */

const App = (() => {

  let currentView         = 'dashboard';
  let currentStatusFilter = 'all';
  let searchQuery         = '';
  let _loading            = false;

  // ── Loading indicator ──────────────────────────────────────
  function setLoading(on) {
    _loading = on;
    const area = $('content-area');
    if (!area) return;
    if (on && !area.querySelector('.loading-row')) {
      area.innerHTML = `
        <div class="loading-row">
          <div class="loading-spinner"></div>
          <span>Loading…</span>
        </div>`;
    }
  }

  // ── Navigation ─────────────────────────────────────────────
  function navigateTo(view) {
    currentView         = view;
    currentStatusFilter = 'all';

    qsa('.nav-item').forEach(item =>
      item.classList.toggle('active', item.dataset.view === view)
    );

    const titleEl = $('view-title');
    if (titleEl) titleEl.textContent = VIEW_LABELS[view] || view;

    refreshContent();
    Panel.close();
  }

  // ── Main content renderer (async) ─────────────────────────
  async function refreshContent() {
    if (_loading) return;
    setLoading(true);

    try {
      await updateBadges();
      const area = $('content-area');
      if (!area) return;

      if (currentView === 'dashboard') {
        area.innerHTML = renderDashboard();
        bindDashTabs();
        // Populate stat cards and first tab in parallel
        await Promise.all([
          populateStats(),
          renderDashTab('recent'),
        ]);
        return;
      }

      const tickets = await TicketStore.filter({
        view:         currentView,
        statusFilter: currentStatusFilter,
        query:        searchQuery,
      });

      area.innerHTML =
        renderFilters(currentView === 'resolved') +
        renderTable(tickets);

      bindFilterBtns();
      bindTableRows();

      if (TicketStore.isOffline()) {
        showOfflineBanner(area);
      }

    } catch (err) {
      if (err.status === 401) {
        showToast('Session expired. Please sign in again.');
        Auth.handleSignOut();
        return;
      }
      showToast('Failed to load tickets.');
      console.error('[App.refreshContent]', err);
    } finally {
      setLoading(false);
    }
  }

  function showOfflineBanner(container) {
    const banner = document.createElement('div');
    banner.className = 'offline-banner';
    banner.innerHTML = `
      <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
      </svg>
      Running in offline demo mode — changes will not be saved to the database.`;
    container.prepend(banner);
  }

  // ── Badge counters ─────────────────────────────────────────
  async function updateBadges() {
    try {
      const [allT, intT, extT] = await Promise.all([
        TicketStore.filter({ view: 'all' }),
        TicketStore.filter({ view: 'internal' }),
        TicketStore.filter({ view: 'external' }),
      ]);
      const badgeAll = $('badge-all');
      const badgeInt = $('badge-int');
      const badgeExt = $('badge-ext');
      if (badgeAll) badgeAll.textContent = allT.length;
      if (badgeInt) badgeInt.textContent = intT.length;
      if (badgeExt) badgeExt.textContent = extT.length;
    } catch { /* non-critical */ }
  }

  // ── Dashboard tabs ─────────────────────────────────────────
  function bindDashTabs() {
    const tabsEl = $('dash-tabs');
    if (!tabsEl) return;
    tabsEl.addEventListener('click', async e => {
      const tab = e.target.closest('[data-dash]');
      if (!tab) return;
      qsa('.tab', tabsEl).forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      await renderDashTab(tab.dataset.dash);
    });
  }

  async function renderDashTab(key) {
    const area = $('dash-content');
    if (!area) return;

    area.innerHTML = `<div class="loading-row"><div class="loading-spinner"></div></div>`;

    try {
      let tickets;
      if (key === 'summary') {
        await renderDashSummary();
        return;
      }

      const all = await TicketStore.getAll();
      if (key === 'recent')     tickets = [...all].sort((a,b) => (b.updated||'').localeCompare(a.updated||'')).slice(0, 8);
      if (key === 'critical')   tickets = all.filter(t => t.priority === 'critical' || t.priority === 'high');
      if (key === 'unassigned') tickets = all.filter(t => !t.assignee || t.assignee === 'Unassigned');
      tickets = tickets || [];

      area.innerHTML = renderTable(tickets);
      bindTableRows(area);
    } catch (err) {
      area.innerHTML = `<p style="padding:20px;color:var(--text-tertiary);">Could not load tickets.</p>`;
    }
  }

  // ── Status filter buttons ──────────────────────────────────
  function bindFilterBtns() {
    qsa('[data-status-filter]').forEach(btn => {
      btn.addEventListener('click', async () => {
        currentStatusFilter = btn.dataset.statusFilter;
        qsa('[data-status-filter]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tbody = $('ticket-tbody');
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-tertiary);">Loading…</td></tr>`;
        const filtered = await TicketStore.filter({
          view:         currentView,
          statusFilter: currentStatusFilter,
          query:        searchQuery,
        });
        if (tbody) {
          tbody.innerHTML = renderRows(filtered);
          bindTableRows();
        }
      });
    });
  }

  // ── Table row clicks → open panel ─────────────────────────
  function bindTableRows(root = document) {
    qsa('[data-ticket-id]', root).forEach(row => {
      row.addEventListener('click', () => Panel.open(row.dataset.ticketId));
    });
  }

  // ── Sidebar ────────────────────────────────────────────────
  function bindSidebar() {
    const sidebar = $('sidebar');
    if (!sidebar) return;
    sidebar.addEventListener('click', e => {
      const item = e.target.closest('.nav-item');
      if (!item) return;
      if (item.id === 'new-ticket-nav') { Modal.open(); return; }
      const view = item.dataset.view;
      if (view) navigateTo(view);
    });
  }

  // ── Topbar ─────────────────────────────────────────────────
  function bindTopbar() {
    const newBtn = $('new-ticket-btn');
    if (newBtn) newBtn.addEventListener('click', () => Modal.open());

    const closeBtn = $('panel-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => Panel.close());

    const searchEl = $('search-input');
    if (searchEl) {
      searchEl.addEventListener('input', e => {
        searchQuery = e.target.value.toLowerCase();
        if (currentView !== 'dashboard') refreshContent();
      });
    }

    const signoutBtn = $('btn-signout');
    if (signoutBtn) signoutBtn.addEventListener('click', () => Auth.handleSignOut());
  }

  // ── Init ───────────────────────────────────────────────────
  function init() {
    bindSidebar();
    bindTopbar();
    navigateTo('dashboard');
  }

  return { init, navigateTo, refreshContent, updateBadges };

})();

// App.init() is called by auth.js after employee login — not auto-init.
