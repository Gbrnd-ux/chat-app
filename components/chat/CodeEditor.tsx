import Editor from '@monaco-editor/react';

interface CodeEditorProps {
  code: string;
  onChange: (value: string | undefined) => void;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ code, onChange }) => {
  return (
    <div className="w-full h-full border border-gray-200 rounded-lg overflow-hidden">
      <Editor
        height="100%"
        defaultLanguage="html"
        value={code}
        onChange={onChange}
        theme="vs-dark"
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          wordWrap: 'on',
          scrollBeyondLastLine: false,
        }}
      />
    </div>
  );
};