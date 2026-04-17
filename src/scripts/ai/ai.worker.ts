/// <reference lib="webworker" />
import { MLCEngine, InitProgressReport } from '@mlc-ai/web-llm';
import { WorkerRequest, WorkerResponse } from './ai.types';
import { parseProgressMessage } from './progressHandler';

let engine: MLCEngine | null = null;

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;

  try {
    switch (req.type) {
      case 'INIT_MODEL': {
        // Instantiate the engine and set up the progress hook natively supported by Web-LLM
        engine = new MLCEngine();
        engine.setInitProgressCallback((report: InitProgressReport) => {
          postMessage({
            type: 'INIT_PROGRESS',
            payload: parseProgressMessage(report.text, report.progress)
          } as WorkerResponse);
        });

        // Pulls weights from HuggingFace and caches them locally via Cache API
        await engine.reload(req.payload.modelId);
        
        postMessage({ type: 'INIT_COMPLETE' } as WorkerResponse);
        break;
      }

      case 'GENERATE': {
        if (!engine) {
          throw new Error('LLM Engine is not initialized. Please load a model first.');
        }

        // Web-LLM uses OpenAI-compatible Chat Completions API
        const asyncChunkGenerator = await engine.chat.completions.create({
          messages: [{ role: 'user', content: req.payload.prompt }],
          stream: true,
        });
        
        let fullText = '';
        
        for await (const chunk of asyncChunkGenerator) {
          const token = chunk.choices[0]?.delta?.content || '';
          fullText += token;
          
          postMessage({ 
            type: 'GENERATE_TOKEN', 
            payload: { token } 
          } as WorkerResponse);
        }

        postMessage({ 
          type: 'GENERATE_COMPLETE', 
          payload: { fullText } 
        } as WorkerResponse);
        break;
      }
    }
  } catch (err: any) {
    const errorMsg = err.message || String(err);
    if (req.type === 'INIT_MODEL') {
      postMessage({ type: 'INIT_ERROR', error: errorMsg } as WorkerResponse);
    } else if (req.type === 'GENERATE') {
      postMessage({ type: 'GENERATE_ERROR', error: errorMsg } as WorkerResponse);
    }
  }
};
