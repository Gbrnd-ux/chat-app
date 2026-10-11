"use client";
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { CodeBlock } from "./CodeBlock";
import "highlight.js/styles/github-dark.css";

export function Markdown({ content }: { content: string }) {
  return (
    <div className="text-[15px] leading-7 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-3 [&_a]:text-sky-400 [&_a]:underline">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // ✅ Override `pre` untuk fenced code block.
          // ReactMarkdown menganggap <pre> block-level, jadi tidak dibungkus <p>.
          pre({ children }: any) {
            const codeEl = React.Children.toArray(children)[0] as
              | React.ReactElement<any>
              | undefined;
            const className = codeEl?.props?.className;
            const codeContent = codeEl?.props?.children;
            return <CodeBlock className={className}>{codeContent}</CodeBlock>;
          },
          // ✅ Override `code` HANYA untuk inline code
          code({ inline, className, children, ...props }: any) {
            if (inline) {
              return (
                <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-[13px]">
                  {children}
                </code>
              );
            }
            // Block code ditangani oleh override `pre` di atas.
            // Return apa adanya untuk kasus edge.
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}