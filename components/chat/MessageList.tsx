"use client";
import { MessageBubble } from "./MessageBubble";
import { useAutoScroll } from "@/hooks/useAutoScroll";
import type { ChatMessage } from "@/lib/storage";

type Props = {
  messages: ChatMessage[];
  streamingId: string | null;
  onRegenerate: () => void;
  onRegenerateImage: (messageId: string) => void;
  onEdit: (id: string, content: string) => void;
  typing?: boolean;
  activeArtifactId?: string | null;
  onOpenArtifact?: (messageId: string) => void;
};

export function MessageList({
  messages,
  streamingId,
  onRegenerate,
  onRegenerateImage,
  onEdit,
  typing,
  activeArtifactId,
  onOpenArtifact,
}: Props) {
  const { ref, pinned, jumpToBottom } = useAutoScroll<HTMLDivElement>([
    messages.length,
    messages[messages.length - 1]?.content,
  ]);

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={ref}
        className="h-full overflow-y-auto px-4 md:px-8 py-6 space-y-6"
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.map((m, i) => (
          <MessageBubble
            key={m.id}
            message={m}
            streaming={m.id === streamingId}
            isLast={i === messages.length - 1}
            onRegenerate={onRegenerate}
            onRegenerateImage={onRegenerateImage}
            onEdit={(c) => onEdit(m.id, c)}
            activeArtifactId={activeArtifactId}
            onOpenArtifact={onOpenArtifact}
          />
        ))}
        {typing && (
          <div className="text-neutral-400 text-sm animate-pulse">Sedang mengetik...</div>
        )}
      </div>

      {!pinned && (
        <button
          onClick={jumpToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-neutral-800 border border-neutral-700 px-3 py-1.5 text-sm shadow-lg hover:bg-neutral-700"
        >
          Ke pesan terbaru
        </button>
      )}
    </div>
  );
}