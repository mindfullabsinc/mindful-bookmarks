import { SUPPORTED_MODELS } from './modelRegistry';
import { checkWebGPUSupport } from './webgpuDetector';
import { WorkerRequest, WorkerResponse, ProgressInfo, ModelMetadata } from './ai.types';
import { createAIWorker } from './workerFactory';

/**
 * Singleton Client to be imported into React UI components.
 * Offloads heavy LLM work to a background Web Worker.
 */
class AIClient {
  private static instance: AIClient;
  private worker: Worker | null = null;
  
  // Callbacks and promise handlers
  private progressCallback: ((p: ProgressInfo) => void) | null = null;
  private resolveInit: (() => void) | null = null;
  private rejectInit: ((err: Error) => void) | null = null;
  
  private onTokenCallback: ((token: string) => void) | null = null;
  private resolveGenerate: (() => void) | null = null;
  private rejectGenerate: ((err: Error) => void) | null = null;

  private constructor() {}

  public static getInstance(): AIClient {
    if (!AIClient.instance) {
      AIClient.instance = new AIClient();
    }
    return AIClient.instance;
  }

  /** Lazy initialization of the Web Worker */
  private initWorker() {
    if (!this.worker) {
      this.worker = createAIWorker();
      this.worker.onmessage = this.handleWorkerMessage.bind(this);
    }
  }

  private handleWorkerMessage(event: MessageEvent<WorkerResponse>) {
    const res = event.data;
    switch (res.type) {
      case 'INIT_PROGRESS':
        if (this.progressCallback) this.progressCallback(res.payload);
        break;
      case 'INIT_COMPLETE':
        if (this.resolveInit) this.resolveInit();
        break;
      case 'INIT_ERROR':
        if (this.rejectInit) this.rejectInit(new Error(res.error));
        break;
      case 'GENERATE_TOKEN':
        if (this.onTokenCallback) this.onTokenCallback(res.payload.token);
        break;
      case 'GENERATE_COMPLETE':
        if (this.resolveGenerate) this.resolveGenerate();
        break;
      case 'GENERATE_ERROR':
        if (this.rejectGenerate) this.rejectGenerate(new Error(res.error));
        break;
    }
  }

  // --- Public API ---

  public getAvailableModels(): ModelMetadata[] {
    return SUPPORTED_MODELS;
  }

  public async checkSupport(): Promise<boolean> {
    return await checkWebGPUSupport();
  }

  public onProgress(callback: (p: ProgressInfo) => void) {
    this.progressCallback = callback;
  }

  public async selectModel(modelId: string): Promise<void> {
    this.initWorker();
    return new Promise((resolve, reject) => {
      this.resolveInit = resolve;
      this.rejectInit = reject;
      
      const req: WorkerRequest = { type: 'INIT_MODEL', payload: { modelId } };
      this.worker!.postMessage(req);
    });
  }

  public async generateResponse(prompt: string, onToken: (token: string) => void): Promise<void> {
    this.initWorker();
    this.onTokenCallback = onToken;
    
    return new Promise((resolve, reject) => {
      this.resolveGenerate = resolve;
      this.rejectGenerate = reject;
      
      const req: WorkerRequest = { type: 'GENERATE', payload: { prompt } };
      this.worker!.postMessage(req);
    });
  }
}

export const aiClient = AIClient.getInstance();
