import { ProgressInfo } from './ai.types';

/**
 * Maps the raw InitProgressReport from web-llm to our standard application structure.
 */
export function parseProgressMessage(text: string, progress: number): ProgressInfo {
  return {
    text,
    progress: Math.max(0, Math.min(1, progress))
  };
}
