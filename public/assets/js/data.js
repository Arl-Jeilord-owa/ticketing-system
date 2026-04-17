/**
 * data.js — API client for /api/tickets/*
 *
 * Replaces the old in-memory mock store.
 * All methods are async and return Promises.
 * Falls back to local mock data if the backend is unreachable (offline demo mode).
 *
 * Field name mapping (DB → frontend):
 *   ticket_no  → id
 *   created_at → created
 *   updated_at → updated
 *   body (comment) → text
 */

const TicketStore = (() => {

  // ── Offline / demo fallback ────────────────────────────────
  let _offlineMode = false;
  let _mockTickets = [
    { id:'TK-0001', ticket_no:'TK-0001', type:'internal', dept:'IT',
      subject:'VPN not connecting from home office', priority:'high', status:'open',
      requester:'Maria Santos', assignee:'IT Support',
      created_at:'2026-04-10', updated_at:'2026-04-13', comments:[] },
    { id:'TK-0002', ticket_no:'TK-0002', type:'external', dept:'Billing',
      subject:'Invoice #4821 shows wrong billing amount', priority:'medium', status:'progress',
      requester:'James Lim', assignee:'Billing Team',
      created_at:'2026-04-11', updated_at:'2026-04-13', comments:[] },
    { id:'TK-0003', ticket_no:'TK-0003', type:'internal', dept:'HR',
      subject:'Cannot access payslip portal — login loop', priority:'medium', status:'open',
      requester:'Carlos Reyes', assignee:'HR Systems',
      created_at:'2026-04-12', updated_at:'2026-04-12', comments:[] },
    { id:'TK-0004', ticket_no:'TK-0004', type:'external', dept:'Support',
      subject:'API integration returning 401 errors after key rotation', priority:'critical', status:'open',
      requester:'Priya Mehta', assignee:'Dev Team',
      created_at:'2026-04-13', updated_at:'2026-04-14', comments:[] },
    { id:'TK-0005', ticket_no:'TK-0005', type:'internal', dept:'Facilities',
      subject:'Office printer on floor 3 shows paper jam error', priority:'low', status:'resolved',
      requester:'Ana Flores', assignee:'Facilities',
      created_at:'2026-04-09', updated_at:'2026-04-10', comments:[] },
    { id:'TK-0006', ticket_no:'TK-0006', type:'external', dept:'Support',
      subject:'Product dashboard loads blank page on Safari 17', priority:'high', status:'progress',
      requester:'David Park', assignee:'Frontend Team',
      created_at:'2026-04-12', updated_at:'2026-04-14', comments:[] },
    { id:'TK-0007', ticket_no:'TK-0007', type:'internal', dept:'IT',
      subject:'New laptop setup — missing dev tools and licenses', priority:'medium', status:'open',
      requester:'Sofia Tan', assignee:'IT Support',
      created_at:'2026-04-14', updated_at:'2026-04-14', comments:[] },
    { id:'TK-0008', ticket_no:'TK-0008', type:'external', dept:'Billing',
      subject:'Request to upgrade subscription from Starter to Pro', priority:'low', status:'closed',
      requester:'Michael Wu', assignee:'Billing Team',
      created_at:'2026-04-08', updated_at:'2026-04-09', comments:[] },
  ];
  let _mockIdCounter = 9;

  // ── Normalise a DB row so the frontend always sees consistent fields ──
  function normalise(t) {
    return {
      ...t,
      id:      t.ticket_no || t.id,      // always use ticket_no as the display ID
      created: (t.created_at || t.created || '').slice(0, 10),
      updated: (t.updated_at || t.updated || '').slice(0, 10),
    };
  }

  // ── Generic fetch wrapper ──────────────────────────────────
  async function apiFetch(path, options = {}) {
    const res = await fetch(path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw Object.assign(new Error(err.error || 'API error'), { status: res.status });
    }
    return res.json();
  }

  // ── Mock helpers (offline mode) ────────────────────────────
  function mockFilter({ view, statusFilter, query }) {
    return _mockTickets.filter(t => {
      if (view === 'internal' && (t.type !== 'internal' || t.status === 'closed')) return false;
      if (view === 'external' && (t.type !== 'external' || t.status === 'closed')) return false;
      if (view === 'resolved' && t.status !== 'resolved' && t.status !== 'closed') return false;
      if (view === 'all'      && (t.status === 'resolved' || t.status === 'closed')) return false;
      if (statusFilter && statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!t.id.toLowerCase().includes(q) &&
            !t.subject.toLowerCase().includes(q) &&
            !t.requester.toLowerCase().includes(q)) return false;
      }
      return true;
    }).map(normalise);
  }

  // ── Public API ─────────────────────────────────────────────
  return {

    /**
     * Fetch a filtered list of tickets.
     * @param {{ view, statusFilter, query }} opts
     * @returns {Promise<Ticket[]>}
     */
    async filter({ view = 'all', statusFilter = 'all', query = '' } = {}) {
      if (_offlineMode) return mockFilter({ view, statusFilter, query });
      try {
        const params = new URLSearchParams();
        if (view)         params.set('view',   view);
        if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
        if (query)        params.set('q',      query);
        const data = await apiFetch('/api/tickets?' + params.toString());
        return (data.tickets || []).map(normalise);
      } catch (err) {
        if (err.status === 401) throw err; // let app handle auth errors
        console.warn('[TicketStore] Falling back to offline mode:', err.message);
        _offlineMode = true;
        return mockFilter({ view, statusFilter, query });
      }
    },

    /**
     * Fetch all tickets (used by dashboard tabs).
     * @returns {Promise<Ticket[]>}
     */
    async getAll() {
      if (_offlineMode) return _mockTickets.map(normalise);
      try {
        const data = await apiFetch('/api/tickets');
        return (data.tickets || []).map(normalise);
      } catch {
        _offlineMode = true;
        return _mockTickets.map(normalise);
      }
    },

    /**
     * Fetch a single ticket with its comments.
     * @param {string} ticketNo  e.g. "TK-0001"
     * @returns {Promise<{ ticket, comments }>}
     */
    async getById(ticketNo) {
      if (_offlineMode) {
        const t = _mockTickets.find(t => t.id === ticketNo || t.ticket_no === ticketNo);
        return t ? { ticket: normalise(t), comments: t.comments || [] } : null;
      }
      try {
        // The backend route uses DB id (integer). We first need to resolve ticket_no → id.
        // We pass ticket_no and let the backend accept it (see routes/tickets.js update below).
        const data = await apiFetch('/api/tickets/by-no/' + encodeURIComponent(ticketNo));
        return {
          ticket:   normalise(data.ticket),
          comments: (data.comments || []).map(c => ({
            ...c,
            time: new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            text: c.body,
          })),
        };
      } catch {
        return null;
      }
    },

    /**
     * Create a new ticket (employee portal).
     * @returns {Promise<{ ticketNo }>}
     */
    async create({ type, dept, subject, priority, requester, assignee, description, email, phone }) {
      if (_offlineMode) {
        const id = 'TK-' + String(_mockIdCounter++).padStart(4, '0');
        const t = {
          id, ticket_no: id, type, dept, subject, priority,
          status: 'open', requester, assignee: assignee || 'Unassigned',
          description, email, phone,
          created_at: new Date().toISOString().slice(0,10),
          updated_at: new Date().toISOString().slice(0,10),
          comments: [],
        };
        _mockTickets.unshift(t);
        return { ticketNo: id };
      }
      const data = await apiFetch('/api/tickets', {
        method: 'POST',
        body:   JSON.stringify({ type, dept, subject, priority, requester, assignee, description, email, phone }),
      });
      return data; // { success, ticketNo }
    },

    /**
     * Submit a ticket as a customer (includes profile fields).
     */
    async submitCustomer(payload) {
      if (_offlineMode) {
        return this.create(payload);
      }
      const data = await apiFetch('/api/tickets', {
        method: 'POST',
        body:   JSON.stringify(payload),
      });
      return data;
    },

    /**
     * Update a ticket's status.
     * @param {string} ticketNo
     * @param {string} status
     */
    async setStatus(ticketNo, status) {
      if (_offlineMode) {
        const t = _mockTickets.find(t => t.id === ticketNo || t.ticket_no === ticketNo);
        if (t) { t.status = status; t.updated_at = new Date().toISOString().slice(0,10); }
        return;
      }
      // We need numeric ID — backend supports lookup by ticket_no
      await apiFetch('/api/tickets/by-no/' + encodeURIComponent(ticketNo) + '/status', {
        method: 'PATCH',
        body:   JSON.stringify({ status }),
      });
    },

    /**
     * Add a comment to a ticket.
     */
    async addComment(ticketNo, { author, text }) {
      if (_offlineMode) {
        const t = _mockTickets.find(t => t.id === ticketNo || t.ticket_no === ticketNo);
        if (t) t.comments.push({ author, text, time: formatDate(new Date()) });
        return;
      }
      await apiFetch('/api/tickets/by-no/' + encodeURIComponent(ticketNo) + '/comments', {
        method: 'POST',
        body:   JSON.stringify({ body: text }),
      });
    },

    /**
     * Fetch dashboard summary counts.
     * @returns {Promise<{ open_count, progress_count, resolved_count, critical_count }>}
     */
    async getSummary() {
      if (_offlineMode) {
        return {
          open_count:     _mockTickets.filter(t => t.status === 'open').length,
          progress_count: _mockTickets.filter(t => t.status === 'progress').length,
          resolved_count: _mockTickets.filter(t => t.status === 'resolved' || t.status === 'closed').length,
          critical_count: _mockTickets.filter(t => t.priority === 'critical' && t.status === 'open').length,
        };
      }
      try {
        return await apiFetch('/api/tickets/summary');
      } catch {
        _offlineMode = true;
        return this.getSummary();
      }
    },

    isOffline() { return _offlineMode; },
  };

})();

/** Format a Date object as "Apr 14" */
function formatDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
