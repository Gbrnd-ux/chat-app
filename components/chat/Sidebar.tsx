"use client";
import type { Conversation } from "@/lib/storage";

export function Sidebar({
  items,
  activeId,
  onNew,
  onSelect,
  onDelete,
  onClose,
}: {
  items: Conversation[];
  activeId?: string;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onClose?: () => void;
}) {
  return (
    <aside className="w-72 h-full shrink-0 border-r border-neutral-800 bg-neutral-950 flex flex-col">
      <div className="p-3 flex gap-2">
        <button
          onClick={onNew}
          className="flex-1 rounded-lg bg-sky-600 hover:bg-sky-500 px-3 py-2 text-sm font-medium"
        >
          + Chat baru
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="md:hidden rounded-lg border border-neutral-800 hover:bg-neutral-800 px-3 py-2 text-neutral-400"
            aria-label="Tutup sidebar"
          >
            ×
          </button>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-3 space-y-1 text-sm">
        {items.length === 0 && (
          <p className="px-3 py-2 text-neutral-500">Belum ada riwayat.</p>
        )}
        {items.map((c) => (
          <div
            key={c.id}
            className={[
              "group flex items-center gap-1 rounded-md px-2",
              c.id === activeId ? "bg-neutral-800" : "hover:bg-neutral-900",
            ].join(" ")}
          >
            <button
              onClick={() => onSelect(c.id)}
              className="flex-1 text-left truncate py-2"
            >
              {c.title || "Tanpa judul"}
            </button>
            <button
              onClick={() => onDelete(c.id)}
              className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 px-1"
              aria-label="Hapus"
            >
              ×
            </button>
          </div>
        ))}
      </nav>
    </aside>
  );
}