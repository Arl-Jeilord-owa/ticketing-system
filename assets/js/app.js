/**
 * app.js
 * Main application controller.
 * Wires up navigation, search, table clicks, and dashboard tabs.
 * Depends on: data.js, utils.js, render.js, panel.js, modal.js
 */

const App = (() => {
  let currentView = 'dashboard';
  let currentStatusFilter = 'all';
  let searchQuery = '';

  /** ── Navigation ── */
  function navigateTo(view) {
    currentView = view;
    currentStatusFilter = 'all';

    // Update sidebar active state
    qsa('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === view);
    });

    $('view-title').textContent = VIEW_LABELS[view] || view;
    refreshContent();
    Panel.close();
  }

  /** ── Render the main content area ── */
  function refreshContent() {
    updateBadges();
    const area = $('content-area');

    if (currentView === 'dashboard') {
      area.innerHTML = renderDashboard();
      bindDashTabs();
      renderDashTab('recent');
      return;
    }

    const tickets = TicketStore.filter({
      view: currentView,
      statusFilter: currentStatusFilter,
      query: searchQuery,
    });

    area.innerHTML =
      renderFilters(currentView === 'resolved') +
      renderTable(tickets);

    bindFilterBtns();
    bindTableRows();
  }

  /** ── Badge counters in sidebar ── */
  function updateBadges() {
    const all      = TicketStore.filter({ view: 'all' });
    const internal = TicketStore.filter({ view: 'internal' });
    const external = TicketStore.filter({ view: 'external' });

    $('badge-all').textContent = all.length;
    $('badge-int').textContent = internal.length;
    $('badge-ext').textContent = external.length;
  }

  /** ── Dashboard tab rendering ── */
  function bindDashTabs() {
    const tabsEl = $('dash-tabs');
    if (!tabsEl) return;
    tabsEl.addEventListener('click', e => {
      const tab = e.target.closest('[data-dash]');
      if (!tab) return;
      qsa('.tab', tabsEl).forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderDashTab(tab.dataset.dash);
    });
  }

  function renderDashTab(key) {
    let tickets;
    const all = TicketStore.getAll();
    if (key === 'recent')     tickets = [...all].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 6);
    if (key === 'critical')   tickets = all.filter(t => t.priority === 'critical' || t.priority === 'high');
    if (key === 'unassigned') tickets = all.filter(t => t.assignee === 'Unassigned' || t.status === 'open');
    tickets = tickets || [];

    const area = $('dash-content');
    if (area) {
      area.innerHTML = renderTable(tickets);
      bindTableRows(area);
    }
  }

  /** ── Status filter buttons ── */
  function bindFilterBtns() {
    qsa('[data-status-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentStatusFilter = btn.dataset.statusFilter;
        qsa('[data-status-filter]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const filtered = TicketStore.filter({
          view: currentView,
          statusFilter: currentStatusFilter,
          query: searchQuery,
        });
        const tbody = $('ticket-tbody');
        if (tbody) tbody.innerHTML = renderRows(filtered);
        bindTableRows();
      });
    });
  }

  /** ── Table row clicks → open panel ── */
  function bindTableRows(root = document) {
    qsa('[data-ticket-id]', root).forEach(row => {
      row.addEventListener('click', () => {
        Panel.open(row.dataset.ticketId);
      });
    });
  }

  /** ── Sidebar navigation clicks ── */
  function bindSidebar() {
    $('sidebar').addEventListener('click', e => {
      const item = e.target.closest('.nav-item');
      if (!item) return;

      if (item.id === 'new-ticket-nav') {
        Modal.open();
        return;
      }

      const view = item.dataset.view;
      if (view) navigateTo(view);
    });
  }

  /** ── Top bar ── */
  function bindTopbar() {
    $('new-ticket-btn').addEventListener('click', () => Modal.open());
    $('panel-close-btn').addEventListener('click', () => Panel.close());

    $('search-input').addEventListener('input', e => {
      searchQuery = e.target.value.toLowerCase();
      if (currentView !== 'dashboard') refreshContent();
    });

    const signoutBtn = $('btn-signout');
    if (signoutBtn) signoutBtn.addEventListener('click', () => Auth.handleSignOut());
  }

  /** ── Boot ── */
  function init() {
    bindSidebar();
    bindTopbar();
    navigateTo('dashboard');
  }

  return { init, navigateTo, refreshContent };
})();

// App.init() is called by auth.js after employee login succeeds.
// Do NOT auto-init here.
