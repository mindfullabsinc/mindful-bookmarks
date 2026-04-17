export interface ModelMetadata {
  id: string;
  friendlyName: string;
  estimatedSize: string;
}

export interface ProgressInfo {
  text: string;
  progress: number; // 0 to 1 scale
}

// Requests from Main Thread -> Worker
export type WorkerRequest =
  | { type: 'INIT_MODEL'; payload: { modelId: string } }
  | { type: 'GENERATE'; payload: { prompt: string } }
  | { type: 'CHECK_SUPPORT' };

// Responses from Worker -> Main Thread
export type WorkerResponse =
  | { type: 'INIT_PROGRESS'; payload: ProgressInfo }
  | { type: 'INIT_COMPLETE' }
  | { type: 'INIT_ERROR'; error: string }
  | { type: 'GENERATE_TOKEN'; payload: { token: string } }
  | { type: 'GENERATE_COMPLETE'; payload: { fullText: string } }
  | { type: 'GENERATE_ERROR'; error: string }
  | { type: 'SUPPORT_RESULT'; payload: { isSupported: boolean } };
