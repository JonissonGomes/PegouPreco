/** Evita ciclo entre o cliente HTTP e a store. */
let onRejected: (() => void) | null = null;

export function bindSessionRejected(handler: () => void) {
  onRejected = handler;
}

export function notifySessionRejected() {
  onRejected?.();
}
