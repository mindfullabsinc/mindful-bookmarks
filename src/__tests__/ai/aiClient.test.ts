import { aiClient } from '../../scripts/ai/aiClient';
import { SUPPORTED_MODELS } from '../../scripts/ai/modelRegistry';

class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  
  postMessage(data: any) {
    // Simulate async processing
    setTimeout(() => {
      if (!this.onmessage) return;

      if (data.type === 'INIT_MODEL') {
        this.onmessage({ data: { type: 'INIT_PROGRESS', payload: { text: 'Loading', progress: 0.5 } } } as MessageEvent);
        this.onmessage({ data: { type: 'INIT_COMPLETE' } } as MessageEvent);
      } 
      
      if (data.type === 'GENERATE') {
        this.onmessage({ data: { type: 'GENERATE_TOKEN', payload: { token: 'Hello ' } } } as MessageEvent);
        this.onmessage({ data: { type: 'GENERATE_TOKEN', payload: { token: 'world' } } } as MessageEvent);
        this.onmessage({ data: { type: 'GENERATE_COMPLETE', payload: { fullText: 'Hello world' } } } as MessageEvent);
      }
    }, 10);
  }
}

// Intercept the factory import entirely
jest.mock('../../scripts/ai/workerFactory', () => ({
  createAIWorker: () => new MockWorker()
}));

describe('aiClient', () => {
  it('should act as a singleton instance', () => {
    expect(aiClient).toBeDefined();
  });

  it('should return available models matching the registry', () => {
    const models = aiClient.getAvailableModels();
    expect(models).toEqual(SUPPORTED_MODELS);
  });

  it('should initialize a model and emit progress events', async () => {
    const progressMock = jest.fn();
    aiClient.onProgress(progressMock);

    await aiClient.selectModel('test-model-id');

    expect(progressMock).toHaveBeenCalledWith({ text: 'Loading', progress: 0.5 });
  });

  it('should generate a response and emit streaming tokens', async () => {
    const tokenMock = jest.fn();

    await aiClient.generateResponse('Say hello', tokenMock);

    expect(tokenMock).toHaveBeenCalledTimes(2);
    expect(tokenMock).toHaveBeenNthCalledWith(1, 'Hello ');
    expect(tokenMock).toHaveBeenNthCalledWith(2, 'world');
  });
});
