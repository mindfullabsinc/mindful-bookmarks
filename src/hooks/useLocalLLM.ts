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
  
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [loadedModelId, setLoadedModelId] = useState<string | null>(null);
  
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

  // Returns a promise that resolves when the model is ready
  const loadModel = async (modelIdToLoad?: string) => {
    const targetId = modelIdToLoad || selectedModelId;
    
    // If already loaded, skip
    if (isModelLoaded && loadedModelId === targetId) return true;

    setIsInitializing(true);
    try {
      await aiClient.selectModel(targetId);
      setIsModelLoaded(true);
      setLoadedModelId(targetId);
      return true;
    } catch (err) {
      console.error("Initialization failed", err);
      return false;
    } finally {
      setIsInitializing(false);
      setProgress(null);
    }
  };

  const sendMessage = async (text: string) => {
    const trimmedText = text.trim();
    if (!trimmedText) return;

    // 1. Immediately show the user's message
    const newMessages: Message[] = [...messages, { role: 'user', content: trimmedText }];
    setMessages(newMessages);

    // 2. Check if we need to load/download the model first
    if (!isModelLoaded || loadedModelId !== selectedModelId) {
      const success = await loadModel(selectedModelId);
      if (!success) {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Error: Failed to load the local model.' }]);
        return;
      }
    }

    // 3. Trigger assistant response
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
    setIsGenerating(true);

    try {
      let fullResponse = "";
      await aiClient.generateResponse(trimmedText, (token) => {
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
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant') {
            last.content = "Error: The model encountered an issue during generation.";
        }
        return updated;
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return {
    isSupported,
    availableModels,
    selectedModelId,
    setSelectedModelId,
    isModelLoaded,
    progress,
    isInitializing,
    isGenerating,
    messages,
    loadModel,
    sendMessage
  };
}