import { useState, useEffect, useCallback } from 'react';
import { aiClient } from '@/scripts/ai/aiClient';
import { ProgressInfo, ModelMetadata } from '@/scripts/ai/ai.types';

export type Message = {
  role: 'user' | 'assistant';
  content: string;
};

export function useLocalLLM() {
  const [isSupported, setIsSupported] = useState<boolean | null>(null);
  const [availableModels] = useState<ModelMetadata[]>(aiClient.getAvailableModels());
  const [selectedModelId, setSelectedModelId] = useState<string>(availableModels[0]?.id || '');
  const [progress, setProgress] = useState<ProgressInfo | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    aiClient.checkSupport().then(setIsSupported);
  }, []);

  useEffect(() => {
    aiClient.onProgress((p) => setProgress(p));
  }, []);

  const loadModel = async () => {
    setIsInitializing(true);
    try {
      await aiClient.selectModel(selectedModelId);
    } catch (err) {
      console.error("Initialization failed", err);
    } finally {
      setIsInitializing(false);
      setProgress(null);
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    const newMessages: Message[] = [...messages, { role: 'user', content: text }];
    setMessages([...newMessages, { role: 'assistant', content: '' }]);
    setIsGenerating(true);

    try {
      let fullResponse = "";
      await aiClient.generateResponse(text, (token) => {
        fullResponse += token;
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant') {
            last.content = fullResponse;
          }
          return updated;
        });
      });
    } catch (err) {
      console.error("Generation failed", err);
    } finally {
      setIsGenerating(false);
    }
  };

  return {
    isSupported,
    availableModels,
    selectedModelId,
    setSelectedModelId,
    progress,
    isInitializing,
    isGenerating,
    messages,
    loadModel,
    sendMessage
  };
}