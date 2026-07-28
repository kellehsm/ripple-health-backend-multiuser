type Listener = (online: boolean, pending: number) => void;

const listeners = new Set<Listener>();
let _online = true;
let _pending = 0;

export function setNetworkOnline(online: boolean): void {
  if (_online === online) return;
  _online = online;
  _notify();
}

export function setNetworkPending(count: number): void {
  if (_pending === count) return;
  _pending = count;
  _notify();
}

export function getNetworkState(): { online: boolean; pending: number } {
  return { online: _online, pending: _pending };
}

export function subscribeNetwork(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function _notify(): void {
  const snapshot = { online: _online, pending: _pending };
  listeners.forEach(l => l(snapshot.online, snapshot.pending));
}
