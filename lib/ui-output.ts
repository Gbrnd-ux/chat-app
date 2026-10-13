// lib/ui-output.ts
export function extractHtml(raw: string): string {
  let text = raw.trim();

  const fence = text.match(/```[a-z]*[ \t]*\r?\n([\s\S]*?)(?:\r?\n```|$)/i);
  if (fence) text = fence[1].trim();

  const start = text.search(/<!doctype html|<html[\s>]/i);
  if (start > 0) text = text.slice(start);

  const end = text.toLowerCase().lastIndexOf("</html>");
  if (end !== -1) text = text.slice(0, end + "</html>".length);

  return text.trim();
}

export function isCompleteHtml(html: string): boolean {
  return /<\/html>\s*$/i.test(html.trim());
}

const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' https://cdn.tailwindcss.com",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

const ERROR_REPORTER = `<script>(function(){
function send(m){try{parent.postMessage({source:"ui-preview",type:"error",message:String(m).slice(0,500)},"*")}catch(e){}}
window.addEventListener("error",function(e){send(e.message)});
window.addEventListener("unhandledrejection",function(e){send(e.reason)});
})();</script>`;

const INJECTION = `<meta http-equiv="Content-Security-Policy" content="${CSP}">${ERROR_REPORTER}`;

export function buildPreviewDocument(html: string): string {
  const headOpen = /<head(?:\s[^>]*)?>/i;
  const htmlOpen = /<html(?:\s[^>]*)?>/i;

  if (headOpen.test(html)) return html.replace(headOpen, (m) => m + INJECTION);
  if (htmlOpen.test(html)) {
    return html.replace(htmlOpen, (m) => `${m}<head>${INJECTION}</head>`);
  }
  return `<!DOCTYPE html><html><head>${INJECTION}</head><body>${html}</body></html>`;
}

export const PREVIEW_SANDBOX = "allow-scripts";