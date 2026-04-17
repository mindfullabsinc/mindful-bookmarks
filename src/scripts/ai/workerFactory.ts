export function createAIWorker(): Worker {
  return new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
}
