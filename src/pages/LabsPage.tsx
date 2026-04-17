import React, { useState } from 'react';
import { useLocalLLM } from '@/hooks/useLocalLLM';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Badge } from '@/components/primitives/badge';
import { Loader2, Send, Cpu } from 'lucide-react';

export default function LabsPage() {
  const {
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
  } = useLocalLLM();

  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim() || isGenerating) return;
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
        </div>
        
        <div className="flex items-center gap-2">
          <select 
            className="bg-neutral-100 dark:bg-neutral-800 rounded-md px-3 py-1.5 text-sm"
            value={selectedModelId}
            onChange={(e) => setSelectedModelId(e.target.value)}
          >
            {availableModels.map(m => (
              <option key={m.id} value={m.id}>{m.friendlyName}</option>
            ))}
          </select>
          <Button onClick={loadModel} disabled={isInitializing} size="sm">
            {isInitializing ? <Loader2 className="animate-spin h-4 w-4" /> : "Load Model"}
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 space-y-4">
        {!messages.length && !progress && (
          <div className="flex flex-col items-center justify-center h-full text-neutral-400">
            <Cpu size={48} className="mb-2 opacity-20" />
            <p>Ready for local inference</p>
          </div>
        )}

        {progress && (
          <div className="max-w-md mx-auto p-6 bg-white dark:bg-neutral-900 rounded-2xl border border-blue-200">
            <p className="text-sm font-medium mb-2">{progress.text}</p>
            <div className="h-2 w-full bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress.progress * 100}%` }} />
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] px-4 py-2 rounded-2xl ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-neutral-200 dark:bg-neutral-800'}`}>
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              {msg.role === 'assistant' && !msg.content && <Loader2 className="animate-spin h-4 w-4 opacity-50" />}
            </div>
          </div>
        ))}
      </main>

      <footer className="p-6 bg-white dark:bg-neutral-900 border-t border-neutral-200">
        <div className="max-w-4xl mx-auto flex gap-2">
          <Input 
            placeholder="Ask something..." 
            value={input}
            onChange={(e: any) => setInput(e.target.value)}
            onKeyDown={(e: any) => e.key === 'Enter' && handleSend()}
          />
          <Button onClick={handleSend} disabled={isGenerating || isInitializing}>
            <Send size={18} />
          </Button>
        </div>
      </footer>
    </div>
  );
}