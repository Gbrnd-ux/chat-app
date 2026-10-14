// lib/providers.ts

export type ProviderName = "gemini" | "openrouter";

export type ProviderConfig = {
  url: string;
  apiKeys: string[];
  modelsText: string[];
  modelsVision: string[];
  extraHeaders?: Record<string, string>;
};

// Helper: baca banyak key dari env, dipisahkan koma
function parseKeys(envVar: string | undefined): string[] {
  if (!envVar) return [];
  return envVar
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

export function getProviderConfig(provider: ProviderName): ProviderConfig | null {
  const override = process.env.AI_MODEL?.trim();
  const withOverride = (defaults: string[]) =>
    override ? [override, ...defaults.filter((m) => m !== override)] : defaults;

  switch (provider) {
    case "gemini":
      return {
        url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        apiKeys: parseKeys(
          process.env.GEMINI_API_KEYS ?? process.env.GEMINI_API_KEY
        ),
        // 🔥 UPDATE: 3.5 Flash-Lite jadi prioritas utama karena lebih stabil.
        modelsText: withOverride([
          "gemini-3.5-flash-lite",     // ← PRIORITAS UTAMA BARU (lebih stabil)
          "gemini-3.5-flash",          // ← Prioritas kedua (coba lagi, mungkin sudah longgar)
          "gemini-3.1-flash-lite",
          "gemini-2.5-flash-lite",
          "gemini-flash-lite-latest",
        ]),
        modelsVision: withOverride([
          "gemini-3.5-flash-lite",     // ← Sama untuk vision
          "gemini-3.5-flash",
          "gemini-3.1-flash-lite",
          "gemini-2.5-flash-lite",
          "gemini-flash-lite-latest",
        ]),
      };

    case "openrouter":
      return {
        url: "https://openrouter.ai/api/v1/chat/completions",
        apiKeys: parseKeys(
          process.env.OPENROUTER_API_KEYS ?? process.env.OPENROUTER_API_KEY
        ),
        // 🔥 Model pintar OpenRouter sebagai cadangan lintas-penyedia
        modelsText: withOverride([
          "qwen/qwen3.6-plus-preview:free",              // Pintar untuk coding
          "minimax/minimax-m2.5:free",                   // Cepat & akurat
          "nvidia/nemotron-3-super-120b-a12b:free",      // Penalaran
          "qwen/qwen3-coder:free",                       // Spesialis coding
          "nvidia/nemotron-3-ultra-550b-a55b:free",      // Cadangan terakhir
        ]),
        modelsVision: withOverride([
          "nvidia/nemotron-3-ultra-550b-a55b:free",      // Cek apakah support vision
        ]),
        extraHeaders: {
          "HTTP-Referer":
            process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
          "X-Title": "tanyai",
        },
      };

    default:
      return null;
  }
}