import { useState } from 'react';
import { CodeEditor } from './CodeEditor';
import { SandboxPreview } from './SandboxPreview';

export const PromptToUIWorkspace = () => {
  const [code, setCode] = useState<string>('<h1 class="text-3xl font-bold text-center mt-10">Halo Kafe!</h1>');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async (prompt: string) => {
    setIsGenerating(true);
    // Panggil API route Anda di sini (misal: /api/chat dengan mode UI_GENERATOR)
    // const response = await fetch('/api/chat', { ... })
    // setCode(response.data.code)
    setIsGenerating(false);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-gray-50 p-4 gap-4">
      {/* Header / Prompt Input */}
      <div className="flex gap-2">
        <input 
          type="text" 
          placeholder="Buatkan landing page kafe..." 
          className="flex-1 p-2 border rounded-md"
          onKeyDown={(e) => e.key === 'Enter' && handleGenerate(e.currentTarget.value)}
        />
        <button className="bg-blue-600 text-white px-4 py-2 rounded-md">Generate</button>
      </div>

      {/* Split Screen */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Editor Panel */}
        <div className="w-1/2 flex flex-col">
          <h3 className="text-sm font-semibold mb-2 text-gray-700">Code Editor</h3>
          <div className="flex-1">
            <CodeEditor code={code} onChange={(val) => setCode(val || '')} />
          </div>
        </div>

        {/* Preview Panel */}
        <div className="w-1/2 flex flex-col">
          <h3 className="text-sm font-semibold mb-2 text-gray-700">Live Preview</h3>
          <div className="flex-1">
            <SandboxPreview code={code} />
          </div>
        </div>
      </div>
    </div>
  );
};