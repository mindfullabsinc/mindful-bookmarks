import React, { useState, useEffect, useRef } from 'react';
import { useLocalLLM } from '@/hooks/useLocalLLM';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Badge } from '@/components/primitives/badge';
import { Loader2, Send, Cpu, CheckCircle2 } from 'lucide-react';

export default function LabsPage() {
  const {
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
  } = useLocalLLM();

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom as messages stream in
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, progress]);

  const handleSend = () => {
    if (!input.trim() || isGenerating || isInitializing) return;
    sendMessage(input);
    setInput('');
  };

  return (
    <div className="flex flex-col h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 font-sans">
      <header className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">Mindful AI Labs</h1>
          <Badge forceLight>
            {isSupported === null ? "Checking..." : isSupported ? "WebGPU Active" : "No WebGPU"}
          </Badge>
          {isModelLoaded && !isInitializing && (
            <div className="flex items-center gap-1 text-xs text-green-600 font-medium">
              <CheckCircle2 size={14} /> Ready
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <select 
            className="bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            value={selectedModelId}
            onChange={(e) => setSelectedModelId(e.target.value)}
            disabled={isInitializing || isGenerating}
          >
            {availableModels.map(m => (
              <option key={m.id} value={m.id}>{m.friendlyName}</option>
            ))}
          </select>
          <Button onClick={() => loadModel()} disabled={isInitializing || isGenerating} size="sm" variant="outline">
            {isInitializing ? <Loader2 className="animate-spin h-4 w-4" /> : "Pre-load Model"}
          </Button>
        </div>
      </header>

      <main ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
        {!messages.length && !progress && (
          <div className="flex flex-col items-center justify-center h-full text-neutral-400">
            <Cpu size={48} className="mb-2 opacity-20" />
            <p className="text-center max-w-xs">Type a message to start. The model will download automatically if not already present.</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] px-4 py-2 shadow-sm rounded-2xl ${
              msg.role === 'user' 
                ? 'bg-blue-600 text-white rounded-tr-none' 
                : 'bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-tl-none'
            }`}>
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              {msg.role === 'assistant' && !msg.content && !isInitializing && (
                <Loader2 className="animate-spin h-4 w-4 opacity-50" />
              )}
            </div>
          </div>
        ))}

        {isInitializing && progress && (
          <div className="max-w-md mx-auto p-6 bg-white dark:bg-neutral-900 rounded-2xl border border-blue-200 shadow-lg animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center gap-2 mb-3">
              <Loader2 className="animate-spin h-4 w-4 text-blue-600" />
              <p className="text-sm font-semibold">{progress.text}</p>
            </div>
            <div className="h-2 w-full bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-600 transition-all duration-500" 
                style={{ width: `${progress.progress * 100}%` }} 
              />
            </div>
            <p className="text-[10px] text-neutral-400 mt-2 text-center uppercase tracking-widest font-bold">
              Downloading weights ({Math.round(progress.progress * 100)}%)
            </p>
          </div>
        )}
      </main>

      <footer className="p-6 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800">
        <div className="max-w-4xl mx-auto flex gap-2">
          <Input 
            placeholder={isInitializing ? "Downloading model..." : "Ask the local LLM..."}
            value={input}
            onChange={(e: any) => setInput(e.target.value)}
            onKeyDown={(e: any) => e.key === 'Enter' && handleSend()}
            disabled={isInitializing}
          />
          <Button onClick={handleSend} disabled={isGenerating || isInitializing || !input.trim()}>
            {isGenerating ? <Loader2 className="animate-spin h-4 w-4" /> : <Send size={18} />}
          </Button>
        </div>
      </footer>
    </div>
  );
}