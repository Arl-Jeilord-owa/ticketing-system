const TicketStore = (() => {
  let _offlineMode = false;

  let _mockTickets = [
    {
      id: 'TK-0001',
      ticket_no: 'TK-0001',
      type: 'internal',
      dept: 'IT',
      subject: 'VPN not connecting from home office',
      priority: 'high',
      status: 'open',
      requester: 'Maria Santos',
      assignee: 'IT Support',
      created_at: '2026-04-10',
      updated_at: '2026-04-13',
      comments: []
    },
    {
      id: 'TK-0002',
      ticket_no: 'TK-0002',
      type: 'internal',
      dept: 'HR',
      subject: 'Cannot access payslip portal — login loop',
      priority: 'medium',
      status: 'progress',
      requester: 'Carlos Reyes',
      assignee: 'HR Systems',
      created_at: '2026-04-11',
      updated_at: '2026-04-13',
      comments: []
    }
  ];

  let _mockIdCounter = 3;

  function normalise(t) {
    return {
      ...t,
      id: t.ticket_no || t.id,
      created: (t.created_at || t.created || '').slice(0, 10),
      updated: (t.updated_at || t.updated || '').slice(0, 10),
    };
  }

  async function apiFetch(path, options = {}) {
    const res = await fetch(path, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw Object.assign(new Error(err.error || 'API error'), { status: res.status });
    }

    return res.json();
  }

  function mockFilter({ view, statusFilter, query }) {
    return _mockTickets.filter(t => {
      if (view === 'internal' && (t.type !== 'internal' || t.status === 'closed')) return false;
      if (view === 'resolved' && t.status !== 'resolved' && t.status !== 'closed') return false;
      if (view === 'all' && (t.status === 'resolved' || t.status === 'closed')) return false;
      if (statusFilter && statusFilter !== 'all' && t.status !== statusFilter) return false;

      if (query) {
        const q = query.toLowerCase();
        if (
          !t.id.toLowerCase().includes(q) &&
          !t.subject.toLowerCase().includes(q) &&
          !t.requester.toLowerCase().includes(q) &&
          !(t.dept || '').toLowerCase().includes(q)
        ) return false;
      }

      return true;
    }).map(normalise);
  }

  return {
    isOffline() {
      return _offlineMode;
    },

    async filter({ view = 'all', statusFilter = 'all', query = '' } = {}) {
      if (_offlineMode) return mockFilter({ view, statusFilter, query });

      try {
        const params = new URLSearchParams();
        if (view) params.set('view', view);
        if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
        if (query) params.set('q', query);

        const data = await apiFetch('/api/tickets?' + params.toString());
        return (data.tickets || []).map(normalise);
      } catch (err) {
        if (err.status === 401) throw err;
        _offlineMode = true;
        return mockFilter({ view, statusFilter, query });
      }
    },

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

    async getSummary() {
      if (_offlineMode) {
        return {
          open: _mockTickets.filter(t => t.status === 'open').length,
          progress: _mockTickets.filter(t => t.status === 'progress').length,
          resolved: _mockTickets.filter(t => ['resolved', 'closed'].includes(t.status)).length,
          critical: _mockTickets.filter(t => t.priority === 'critical' && t.status === 'open').length,
        };
      }

      try {
        return await apiFetch('/api/tickets/summary');
      } catch {
        _offlineMode = true;
        return {
          open: 0,
          progress: 0,
          resolved: 0,
          critical: 0,
        };
      }
    },

    async getById(ticketNo) {
      if (_offlineMode) {
        const t = _mockTickets.find(t => t.id === ticketNo || t.ticket_no === ticketNo);
        return t ? { ticket: normalise(t), comments: t.comments || [] } : null;
      }

      try {
        const data = await apiFetch('/api/tickets/by-no/' + encodeURIComponent(ticketNo));
        return {
          ticket: normalise(data.ticket),
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

    async create(payload) {
      if (_offlineMode) {
        const ticketNo = 'TK-' + String(_mockIdCounter++).padStart(4, '0');
        _mockTickets.unshift({
          id: ticketNo,
          ticket_no: ticketNo,
          type: 'internal',
          dept: payload.dept || 'IT',
          subject: payload.subject,
          priority: payload.priority || 'medium',
          status: 'open',
          requester: payload.requester,
          assignee: payload.assignee || 'Unassigned',
          description: payload.description || '',
          created_at: new Date().toISOString().slice(0, 10),
          updated_at: new Date().toISOString().slice(0, 10),
          comments: []
        });
        return { ticketNo };
      }

      return apiFetch('/api/tickets', {
        method: 'POST',
        body: JSON.stringify({
          ...payload,
          type: 'internal'
        }),
      });
    },

    async setStatus(ticketNo, status) {
      if (_offlineMode) {
        const t = _mockTickets.find(t => t.ticket_no === ticketNo || t.id === ticketNo);
        if (t) t.status = status;
        return { success: true };
      }

      return apiFetch('/api/tickets/' + encodeURIComponent(ticketNo) + '/status', {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    },

    async addComment(ticketNo, body) {
      if (_offlineMode) {
        const t = _mockTickets.find(t => t.ticket_no === ticketNo || t.id === ticketNo);
        if (t) {
          t.comments = t.comments || [];
          t.comments.push({
            author: 'Agent',
            text: body,
            time: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          });
        }
        return { success: true };
      }

      return apiFetch('/api/tickets/' + encodeURIComponent(ticketNo) + '/comments', {
        method: 'POST',
        body: JSON.stringify({ body }),
      });
    },
  };
})();