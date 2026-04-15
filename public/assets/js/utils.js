/**
 * utils.js
 * Shared utility functions: DOM helpers, avatar generation, toast.
 */

/** Get element by ID */
function $(id) {
  return document.getElementById(id);
}

/** Query one element */
function qs(selector, root = document) {
  return root.querySelector(selector);
}

/** Query all elements */
function qsa(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

/** Get initials from a full name (up to 2 chars) */
function getInitials(name) {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/** Return avatar class based on index */
function avatarClass(index) {
  return 'avatar-' + (index % 5);
}

/** Map priority value → CSS class */
function priorityClass(priority) {
  return { low: 'pri-low', medium: 'pri-medium', high: 'pri-high', critical: 'pri-critical' }[priority] || 'pri-low';
}

/** Map status value → CSS class */
function statusClass(status) {
  return { open: 'status-open', progress: 'status-progress', resolved: 'status-resolved', closed: 'status-closed' }[status] || 'status-open';
}

/** Map ticket type → CSS class */
function typeClass(type) {
  return type === 'internal' ? 'type-internal' : 'type-external';
}

/** Show a brief toast message */
function showToast(message, duration = 2500) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/** Escape HTML to prevent XSS */
function escapeHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(str).replace(/[&<>"']/g, c => map[c]);
}

/** Human-readable label for a view key */
const VIEW_LABELS = {
  dashboard: 'Dashboard',
  all:       'All tickets',
  internal:  'Internal queue',
  external:  'External queue',
  resolved:  'Resolved tickets',
};
