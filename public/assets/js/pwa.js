/**
 * pwa.js — Service Worker registration, install prompt, offline detection,
 *           and mobile navigation wiring for OMTPI HelpDesk
 *
 * Load this AFTER app.js in index.html.
 */

// ── Service Worker Registration ────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        console.log('[PWA] Service worker registered:', reg.scope);

        // Notify user when a new version is available
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showToast('🔄 Update available — refresh to apply');
            }
          });
        });
      })
      .catch(err => console.warn('[PWA] SW registration failed:', err));
  });
}

// ── Offline / Online detection ─────────────────────────────
function updateOnlineStatus() {
  const banner = document.getElementById('offline-banner');
  if (!banner) return;
  if (navigator.onLine) {
    banner.classList.remove('show');
  } else {
    banner.classList.add('show');
  }
}

window.addEventListener('online',  updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

// ── Install Prompt (A2HS) ──────────────────────────────────
let _deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _deferredInstallPrompt = e;

  // Show banner after a short delay so it doesn't interrupt loading
  setTimeout(() => {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.classList.add('show');
  }, 3000);
});

window.addEventListener('appinstalled', () => {
  _deferredInstallPrompt = null;
  const banner = document.getElementById('pwa-install-banner');
  if (banner) banner.classList.remove('show');
  showToast('✅ OMTPI HelpDesk installed!');
});

function triggerInstall() {
  if (!_deferredInstallPrompt) return;
  _deferredInstallPrompt.prompt();
  _deferredInstallPrompt.userChoice.then(choice => {
    if (choice.outcome === 'accepted') {
      console.log('[PWA] Install accepted');
    }
    _deferredInstallPrompt = null;
  });
}

function dismissInstallBanner() {
  const banner = document.getElementById('pwa-install-banner');
  if (banner) banner.classList.remove('show');
  // Don't show again this session
  sessionStorage.setItem('pwa-banner-dismissed', '1');
}

// ── Mobile Navigation ──────────────────────────────────────
function initMobileNav() {
  // Bottom nav items
  document.querySelectorAll('.mobile-nav-item[data-view]').forEach(item => {
    item.addEventListener('click', () => {
      const view = item.dataset.view;

      // Update active state
      document.querySelectorAll('.mobile-nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      // Sync with desktop sidebar
      document.querySelectorAll('.nav-item[data-view]').forEach(n => n.classList.remove('active'));
      const desktopNav = document.querySelector(`.nav-item[data-view="${view}"]`);
      if (desktopNav) desktopNav.classList.add('active');

      // Update title and render
      const titleEl = document.getElementById('view-title');
      const mobileTitle = document.getElementById('mobile-view-title');
      const label = viewTitles[view] || view;
      if (titleEl) titleEl.textContent = label;
      if (mobileTitle) mobileTitle.textContent = label;

      renderView(view);
    });
  });

  // Sidebar toggle (tablet / hamburger)
  const toggleBtn = document.getElementById('btn-sidebar-toggle');
  const sidebar   = document.getElementById('sidebar');
  const overlay   = document.getElementById('sidebar-overlay');

  function openSidebar() {
    sidebar?.classList.add('mobile-open');
    overlay?.classList.add('visible');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    sidebar?.classList.remove('mobile-open');
    overlay?.classList.remove('visible');
    document.body.style.overflow = '';
  }

  toggleBtn?.addEventListener('click', openSidebar);
  overlay?.addEventListener('click', closeSidebar);

  // Close sidebar when a nav item is tapped on mobile
  document.querySelectorAll('.nav-item[data-view]').forEach(item => {
    item.addEventListener('click', () => {
      if (window.innerWidth <= 768) closeSidebar();

      // Sync mobile nav active state
      const view = item.dataset.view;
      document.querySelectorAll('.mobile-nav-item').forEach(n => n.classList.remove('active'));
      const mobileItem = document.querySelector(`.mobile-nav-item[data-view="${view}"]`);
      if (mobileItem) mobileItem.classList.add('active');

      // Update mobile title
      const mobileTitle = document.getElementById('mobile-view-title');
      if (mobileTitle) mobileTitle.textContent = viewTitles[view] || view;
    });
  });

  // Mobile search toggle
  const searchBtn     = document.getElementById('btn-mobile-search');
  const searchOverlay = document.getElementById('mobile-search-overlay');
  const searchClose   = document.getElementById('btn-search-close');
  const searchInput   = document.getElementById('mobile-search-input');

  searchBtn?.addEventListener('click', () => {
    searchOverlay?.classList.add('open');
    setTimeout(() => searchInput?.focus(), 100);
  });

  searchClose?.addEventListener('click', () => {
    searchOverlay?.classList.remove('open');
  });

  searchInput?.addEventListener('input', e => {
    // Mirror into desktop search
    const desktopSearch = document.getElementById('search-input');
    if (desktopSearch) {
      desktopSearch.value = e.target.value;
      desktopSearch.dispatchEvent(new Event('input'));
    }
  });

  // Mobile new ticket button
  document.getElementById('btn-mobile-new-ticket')?.addEventListener('click', () => {
    if (typeof Modal !== 'undefined') Modal.open();
  });

  // Install banner buttons
  document.getElementById('btn-pwa-install')?.addEventListener('click', triggerInstall);
  document.getElementById('btn-pwa-dismiss')?.addEventListener('click', dismissInstallBanner);

  // Don't show banner if already dismissed this session
  if (sessionStorage.getItem('pwa-banner-dismissed')) {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.style.display = 'none';
  }
}

// ── Sync view title to mobile topbar ──────────────────────
function syncMobileTitle(title) {
  const el = document.getElementById('mobile-view-title');
  if (el) el.textContent = title;
}

// Patch renderView to also update mobile title
const _origRenderView = typeof renderView === 'function' ? renderView : null;
if (_origRenderView) {
  window.renderView = function(view) {
    syncMobileTitle(viewTitles[view] || view);
    return _origRenderView(view);
  };
}

// ── DOMContentLoaded init ──────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initMobileNav();
});