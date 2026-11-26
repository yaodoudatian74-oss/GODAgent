// Registry of in-flight decisions (approvals, questions, takeover handoffs).
// A running turn awaits one of these; an HTTP endpoint resolves it.
const waiters = new Map(); // id -> { resolve, meta }

export const pending = {
  create(id, meta) {
    return new Promise((resolve) => { waiters.set(id, { resolve, meta }); });
  },
  resolve(id, value) {
    const w = waiters.get(id);
    if (!w) return false;
    waiters.delete(id);
    w.resolve(value);
    return true;
  },
  has(id) { return waiters.has(id); },
  list() { return [...waiters.entries()].map(([id, w]) => ({ id, meta: w.meta })); },
};
