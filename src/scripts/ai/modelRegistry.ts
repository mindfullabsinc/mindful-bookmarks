import { ModelMetadata } from './ai.types';

/**
 * Standard list of officially optimized Web-LLM models.
 * Find more at: https://github.com/mlc-ai/web-llm
 */
export const SUPPORTED_MODELS: ModelMetadata[] = [
  {
    id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    friendlyName: 'Llama 3.2 1B (Balanced, ~800MB)',
    estimatedSize: '800MB'
  },
  {
    id: 'Llama-3-8B-Instruct-q4f16_1-MLC',
    friendlyName: 'Llama 3 8B (High Quality, ~5GB)',
    estimatedSize: '5GB'
  }
];
