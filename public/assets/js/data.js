/**
 * data.js
 * Central data store: ticket array and CRUD helpers.
 * No DOM manipulation here — pure data logic.
 */

const TicketStore = (() => {
  /** @type {Ticket[]} */
  let tickets = [
    {
      id: 'TK-001',
      type: 'internal',
      dept: 'IT',
      subject: 'VPN not connecting from home office',
      priority: 'high',
      status: 'open',
      requester: 'Maria Santos',
      assignee: 'IT Support',
      created: '2026-04-10',
      updated: '2026-04-13',
      comments: [
        { author: 'IT Support', time: 'Apr 11', text: 'We are looking into the VPN gateway issue. Please try restarting your device first.' }
      ]
    },
    {
      id: 'TK-002',
      type: 'external',
      dept: 'Billing',
      subject: 'Invoice #4821 shows wrong billing amount',
      priority: 'medium',
      status: 'progress',
      requester: 'James Lim',
      assignee: 'Billing Team',
      created: '2026-04-11',
      updated: '2026-04-13',
      comments: [
        { author: 'Billing Team', time: 'Apr 12', text: 'We have located the discrepancy and are processing a corrected invoice.' }
      ]
    },
    {
      id: 'TK-003',
      type: 'internal',
      dept: 'HR',
      subject: 'Cannot access payslip portal — login loop',
      priority: 'medium',
      status: 'open',
      requester: 'Carlos Reyes',
      assignee: 'HR Systems',
      created: '2026-04-12',
      updated: '2026-04-12',
      comments: []
    },
    {
      id: 'TK-004',
      type: 'external',
      dept: 'Support',
      subject: 'API integration returning 401 errors after key rotation',
      priority: 'critical',
      status: 'open',
      requester: 'Priya Mehta',
      assignee: 'Dev Team',
      created: '2026-04-13',
      updated: '2026-04-14',
      comments: [
        { author: 'Dev Team', time: 'Apr 13', text: 'Investigating the token refresh flow. Will provide a hotfix ETA shortly.' }
      ]
    },
    {
      id: 'TK-005',
      type: 'internal',
      dept: 'Facilities',
      subject: 'Office printer on floor 3 shows paper jam error',
      priority: 'low',
      status: 'resolved',
      requester: 'Ana Flores',
      assignee: 'Facilities',
      created: '2026-04-09',
      updated: '2026-04-10',
      comments: [
        { author: 'Facilities', time: 'Apr 10', text: 'Jammed paper removed and printer is back online.' }
      ]
    },
    {
      id: 'TK-006',
      type: 'external',
      dept: 'Support',
      subject: 'Product dashboard loads blank page on Safari 17',
      priority: 'high',
      status: 'progress',
      requester: 'David Park',
      assignee: 'Frontend Team',
      created: '2026-04-12',
      updated: '2026-04-14',
      comments: [
        { author: 'Frontend Team', time: 'Apr 13', text: 'Reproduced the issue. A CSS compatibility fix is in review.' }
      ]
    },
    {
      id: 'TK-007',
      type: 'internal',
      dept: 'IT',
      subject: 'New laptop setup — missing dev tools and licenses',
      priority: 'medium',
      status: 'open',
      requester: 'Sofia Tan',
      assignee: 'IT Support',
      created: '2026-04-14',
      updated: '2026-04-14',
      comments: []
    },
    {
      id: 'TK-008',
      type: 'external',
      dept: 'Billing',
      subject: 'Request to upgrade subscription from Starter to Pro',
      priority: 'low',
      status: 'closed',
      requester: 'Michael Wu',
      assignee: 'Billing Team',
      created: '2026-04-08',
      updated: '2026-04-09',
      comments: [
        { author: 'Billing Team', time: 'Apr 9', text: 'Subscription upgraded successfully. Confirmation email sent.' }
      ]
    },
  ];

  let idCounter = 9;

  /** Get today's date as YYYY-MM-DD */
  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  return {
    /** Return a shallow copy of all tickets */
    getAll() {
      return [...tickets];
    },

    /** Find a ticket by ID */
    getById(id) {
      return tickets.find(t => t.id === id) || null;
    },

    /** Create a new ticket, returns the created ticket */
    create({ type, dept, subject, priority, requester, assignee = 'Unassigned', description = '' }) {
      const id = 'TK-' + String(idCounter++).padStart(3, '0');
      const ticket = {
        id, type, dept, subject, priority,
        status: 'open',
        requester, assignee,
        created: today(),
        updated: today(),
        description,
        comments: []
      };
      tickets.unshift(ticket);
      return ticket;
    },

    /** Update status of a ticket */
    setStatus(id, status) {
      const t = tickets.find(tk => tk.id === id);
      if (!t) return null;
      t.status = status;
      t.updated = today();
      return t;
    },

    /** Add a comment to a ticket */
    addComment(id, { author, text }) {
      const t = tickets.find(tk => tk.id === id);
      if (!t) return null;
      const comment = { author, time: formatDate(new Date()), text };
      t.comments.push(comment);
      t.updated = today();
      return comment;
    },

    /** Filter tickets by view and optional status filter */
    filter({ view = 'all', statusFilter = 'all', query = '' }) {
      return tickets.filter(t => {
        // View filter
        if (view === 'internal' && (t.type !== 'internal' || t.status === 'closed')) return false;
        if (view === 'external' && (t.type !== 'external' || t.status === 'closed')) return false;
        if (view === 'resolved' && t.status !== 'resolved' && t.status !== 'closed') return false;
        if (view === 'all' && (t.status === 'resolved' || t.status === 'closed')) return false;

        // Status sub-filter
        if (statusFilter !== 'all' && t.status !== statusFilter) return false;

        // Search query
        if (query) {
          const q = query.toLowerCase();
          if (
            !t.id.toLowerCase().includes(q) &&
            !t.subject.toLowerCase().includes(q) &&
            !t.requester.toLowerCase().includes(q) &&
            !t.dept.toLowerCase().includes(q)
          ) return false;
        }

        return true;
      });
    },

    /** Summary counts for dashboard */
    getSummary() {
      return {
        open:     tickets.filter(t => t.status === 'open').length,
        progress: tickets.filter(t => t.status === 'progress').length,
        resolved: tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length,
        critical: tickets.filter(t => t.priority === 'critical' && t.status === 'open').length,
      };
    }
  };
})();

/** Format a Date object as "Apr 14" */
function formatDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
