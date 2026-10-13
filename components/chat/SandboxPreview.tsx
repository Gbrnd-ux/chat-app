import React, { useMemo } from 'react';

interface SandboxPreviewProps {
  code: string;
}

export const SandboxPreview: React.FC<SandboxPreviewProps> = ({ code }) => {
  const srcDoc = useMemo(() => {
    // Kita bungkus kode AI dengan struktur HTML dasar dan Tailwind CDN
    return `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            body { font-family: sans-serif; margin: 0; padding: 0; }
          </style>
        </head>
        <body>
          ${code}
        </body>
      </html>
    `;
  }, [code]);

  return (
    <div className="w-full h-full bg-white rounded-lg overflow-hidden border border-gray-200 shadow-sm">
      <iframe
        srcDoc={srcDoc}
        sandbox="allow-scripts" // Hanya izinkan script, blokir akses ke parent window/localStorage
        className="w-full h-full border-0"
        title="UI Preview"
      />
    </div>
  );
};