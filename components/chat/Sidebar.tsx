"use client";

import type { Conversation } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";

export function Sidebar({
  items,
  activeId,
  userEmail,
  onNew,
  onSelect,
  onDelete,
  onClose,
}: {
  items: Conversation[];
  activeId?: string;
  userEmail?: string;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onClose?: () => void;
}) {
  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

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
              onClick={(e) => {
                e.stopPropagation();
                onDelete(c.id);
              }}
              className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 px-1"
              aria-label="Hapus"
            >
              ×
            </button>
          </div>
        ))}
      </nav>

      {/* User Info & Logout Button */}
      <div className="p-3 border-t border-neutral-800 flex items-center justify-between gap-2 bg-neutral-950/70">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-xs font-semibold text-neutral-300 shrink-0">
            {userEmail ? userEmail.slice(0, 2).toUpperCase() : "U"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-neutral-200 truncate font-medium">
              {userEmail || "Akun Saya"}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs text-neutral-400 hover:text-red-400 px-2 py-1.5 rounded-lg hover:bg-neutral-900 transition shrink-0 flex items-center gap-1.5 border border-transparent hover:border-neutral-800"
          title="Keluar dari akun"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}