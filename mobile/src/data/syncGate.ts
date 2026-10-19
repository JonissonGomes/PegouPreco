/** Geração do sync. Trocar de conta invalida um pull que ainda está no ar. */
let generation = 0;

export function bumpSyncGeneration() {
  generation += 1;
}

export function syncGeneration() {
  return generation;
}
