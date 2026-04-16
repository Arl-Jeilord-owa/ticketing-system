/**
 * data.js
 * Central data store: ticket array and CRUD helpers.
 * No DOM manipulation here — pure data logic.
 */

const TicketStore = (() => {
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
      archived: false,
      favorite: false,
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
      archived: false,
      favorite: true,
      comments: [
        { author: 'Billing Team', time: 'Apr 12', text: 'We have located the discrepancy and are processing a corrected invoice.' }
      ]
    }
  ];

  let idCounter = 3;

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  return {
    getAll() {
      return [...tickets];
    },

    getById(id) {
      return tickets.find(t => t.id === id) || null;
    },

    create({ type, dept, subject, priority, requester, assignee = 'Unassigned', description = '', email = '', phone = '' }) {
      const id = 'TK-' + String(idCounter++).padStart(3, '0');
      const ticket = {
        id,
        type,
        dept,
        subject,
        priority,
        status: 'open',
        requester,
        assignee,
        created: today(),
        updated: today(),
        description,
        email,
        phone,
        archived: false,
        favorite: false,
        comments: []
      };
      tickets.unshift(ticket);
      return ticket;
    },

    update(id, updates) {
      const t = tickets.find(tk => tk.id === id);
      if (!t) return null;
      Object.assign(t, updates);
      t.updated = today();
      return t;
    },

    setStatus(id, status) {
      const t = tickets.find(tk => tk.id === id);
      if (!t) return null;
      t.status = status;
      t.updated = today();
      return t;
    },

    toggleFavorite(id) {
      const t = tickets.find(tk => tk.id === id);
      if (!t) return null;
      t.favorite = !t.favorite;
      t.updated = today();
      return t;
    },

    toggleArchive(id) {
      const t = tickets.find(tk => tk.id === id);
      if (!t) return null;
      t.archived = !t.archived;
      t.updated = today();
      return t;
    },

    remove(id) {
      const index = tickets.findIndex(tk => tk.id === id);
      if (index === -1) return false;
      tickets.splice(index, 1);
      return true;
    },

    addComment(id, { author, text }) {
      const t = tickets.find(tk => tk.id === id);
      if (!t) return null;
      const comment = { author, time: formatDate(new Date()), text };
      t.comments.push(comment);
      t.updated = today();
      return comment;
    },

    filter({ view = 'all', statusFilter = 'all', query = '' }) {
      return tickets.filter(t => {
        if (t.archived && view !== 'archived') return false;
        if (view === 'archived' && !t.archived) return false;
        if (view === 'favorites' && !t.favorite) return false;
        if (view === 'internal' && (t.type !== 'internal' || t.status === 'closed')) return false;
        if (view === 'external' && (t.type !== 'external' || t.status === 'closed')) return false;
        if (view === 'resolved' && t.status !== 'resolved' && t.status !== 'closed') return false;
        if (view === 'all' && (t.status === 'resolved' || t.status === 'closed')) return false;

        if (statusFilter !== 'all' && t.status !== statusFilter) return false;

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

    getSummary() {
      return {
        open: tickets.filter(t => t.status === 'open' && !t.archived).length,
        progress: tickets.filter(t => t.status === 'progress' && !t.archived).length,
        resolved: tickets.filter(t => (t.status === 'resolved' || t.status === 'closed') && !t.archived).length,
        critical: tickets.filter(t => t.priority === 'critical' && t.status === 'open' && !t.archived).length,
      };
    }
  };
})();

function formatDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}