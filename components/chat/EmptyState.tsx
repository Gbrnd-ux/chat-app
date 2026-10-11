"use client";
const SAMPLES = [
  "Jelaskan event loop di JavaScript dengan analogi sederhana.",
  "Buatkan function TypeScript untuk debounce.",
  "Apa perbedaan SSR, SSG, dan ISR di Next.js?",
  "Tolong review kode ini dan sebutkan 3 perbaikannya: function sum(a,b){return a+b}",
];

export function EmptyState({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="h-full grid place-items-center px-6">
      <div className="max-w-xl w-full text-center">
        <h1 className="text-2xl md:text-3xl font-semibold mb-2">
          Ada yang bisa saya bantu?
        </h1>
        <p className="text-neutral-400 mb-6">
          Mulai dari salah satu contoh, atau tulis pertanyaanmu sendiri.
        </p>
        <div className="grid gap-2">
          {SAMPLES.map((s) => (
            <button
              key={s}
              onClick={() => onPick(s)}
              className="text-left rounded-xl border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 px-4 py-3 text-sm"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}