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
        // 🔥 PRIORITAS: Gemini 3.5 Flash (Pintar, data up-to-date 2024-2029, respons cepat & akurat)
        modelsText: withOverride([
          "gemini-3.5-flash",
          "gemini-3.5-flash-lite",
          "gemini-3.7-flash",
          "gemini-2.5-flash",
        ]),
        modelsVision: withOverride([
          "gemini-3.5-flash",
          "gemini-3.5-flash-lite",
          "gemini-3.7-flash",
          "gemini-2.5-flash",
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