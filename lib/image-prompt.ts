// lib/image-prompt.ts
// Server-only: memakai GEMINI_API_KEY. Jangan diimpor dari komponen client.
import "server-only";
import { IMAGE_QUALITY_TAGS, imageRewriterSystemPrompt } from "./prompts";

/* ------------------------------------------------------------------ */
/* Konfigurasi                                                         */
/* ------------------------------------------------------------------ */

const ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

const MAX_INPUT_CHARS = 500;
const MAX_OUTPUT_WORDS = 180;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_OUTPUT_TOKENS = 500;

const DEFAULT_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-flash-lite-latest",
];

function getModels(): string[] {
  const fromEnv = process.env.GEMINI_REWRITE_MODELS?.split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_MODELS;
}

const debug = (...args: unknown[]) => {
  if (process.env.NODE_ENV !== "production") console.warn("[rewrite]", ...args);
};

/* ------------------------------------------------------------------ */
/* Tipe                                                                */
/* ------------------------------------------------------------------ */

export class InvalidPromptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPromptError";
  }
}

class FatalProviderError extends Error {}

export interface RewriteResult {
  prompt: string;
  source: "llm" | "rule-based";
  model?: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    finish_reason?: string;
    message?: { content?: unknown };
  }>;
}

type Rule = readonly [RegExp, string];

/* ------------------------------------------------------------------ */
/* Input & output hygiene                                              */
/* ------------------------------------------------------------------ */

export function normalizeInput(raw: unknown): string {
  if (typeof raw !== "string") throw new InvalidPromptError("Prompt harus berupa teks.");
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (cleaned.length === 0) throw new InvalidPromptError("Prompt tidak boleh kosong.");
  return cleaned.slice(0, MAX_INPUT_CHARS);
}

const REFUSAL_RE =
  /^(maaf|mohon maaf|sorry|i('| a)m sorry|i can(?:'|no)t|i cannot|i('| a)m unable|as an ai)\b/i;

export function sanitizeModelOutput(text: string): string | null {
  let out = text.trim();

  out = out.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/, "");
  out = out.replace(/^(?:rewritten\s+)?prompt\s*:\s*/i, "");
  out = out.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");
  out = out.replace(/\s+/g, " ").trim();

  const words = out.split(" ").filter(Boolean);
  if (words.length < 4) return null;
  if (REFUSAL_RE.test(out)) return null;

  if (words.length > MAX_OUTPUT_WORDS) {
    out = words.slice(0, MAX_OUTPUT_WORDS).join(" ").replace(/[,.;:\s]+$/, "");
  }
  return ensureQualityTags(out);
}

function ensureQualityTags(prompt: string): string {
  if (/sharp focus/i.test(prompt) && /cinematic lighting/i.test(prompt)) return prompt;
  return `${prompt.replace(/[,.\s]+$/, "")}, ${IMAGE_QUALITY_TAGS}`;
}

/* ------------------------------------------------------------------ */
/* Fallback rule-based                                                 */
/* ------------------------------------------------------------------ */

const SUBJECTS: Rule[] = [
  [/\bkucing\b/, "cat"],
  [/\banjing\b/, "dog"],
  [/\bburung\b/, "bird"],
  [/\bnaga\b/, "dragon"],
  [/\brobot\b/, "robot"],
  [/\bkota\b/, "city"],
  [/\bhutan\b/, "forest"],
  [/\bgunung\b/, "mountain"],
  [/\bpantai\b/, "beach"],
  [/\blaut\b/, "ocean"],
  [/\bbunga\b/, "flowers"],
  [/\brumah\b/, "house"],
  [/\bmobil\b/, "car"],
  [/\bsenja\b/, "at sunset"],
  [/\bmalam\b/, "at night"],
  [/\bpagi\b/, "in the morning light"],
];

const POSES: Rule[] = [
  [/\b(?:ter)?tidur\b/, "sleeping peacefully, eyes closed, relaxed pose"],
  [/\bduduk\b/, "sitting upright"],
  [/\bberdiri\b/, "standing upright"],
  [/\b(?:ber)?lari\b/, "running, dynamic motion"],
  [/\b(?:me)?lompat\b/, "jumping mid-air, dynamic pose"],
  [/\bmakan\b/, "eating"],
  [/\bminum\b/, "drinking"],
  [/\b(?:ber)?main\b/, "playing, playful pose"],
];

const STYLES: Rule[] = [
  [/\bpixel ?art\b/, "pixel art style"],
  [/\brealis(?:tic)?\b/, "photorealistic, 8k photography"],
  [/\b3d\b/, "3D render"],
  [/\banime\b/, "anime style, cel shaded"],
  [/\bwatercolou?r\b|\bcat air\b/, "watercolor painting"],
  [/\bminimalis(?:t)?\b/, "minimalist, clean background"],
  [/\bneon\b/, "neon lighting, cyberpunk"],
];

function collect(text: string, rules: readonly Rule[], into: Set<string>): void {
  for (const [re, phrase] of rules) if (re.test(text)) into.add(phrase);
}

export function ruleBasedRewrite(raw: string): string {
  const base = normalizeInput(raw);
  const lower = base.toLowerCase();

  const hints = new Set<string>();
  collect(lower, SUBJECTS, hints);
  collect(lower, POSES, hints);
  collect(lower, STYLES, hints);

  return [base, ...hints, IMAGE_QUALITY_TAGS].join(", ");
}

/* ------------------------------------------------------------------ */
/* Rewrite via LLM                                                     */
/* ------------------------------------------------------------------ */

async function callModel(model: string, userText: string, apiKey: string): Promise<string | null> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [
        { role: "system", content: imageRewriterSystemPrompt() },
        { role: "user", content: `<user_request>\n${userText}\n</user_request>` },
      ],
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });

  if (res.status === 401 || res.status === 403) {
    throw new FatalProviderError(`HTTP ${res.status}`);
  }
  if (!res.ok) {
    debug(`${model} gagal: HTTP ${res.status}`);
    return null;
  }

  const data = (await res.json()) as ChatCompletionResponse;
  const choice = data.choices?.[0];
  if (choice?.finish_reason === "length") {
    debug(`${model}: output terpotong`);
    return null;
  }
  const content = choice?.message?.content;
  return typeof content === "string" ? sanitizeModelOutput(content) : null;
}

export async function rewriteImagePromptDetailed(raw: string): Promise<RewriteResult> {
  const input = normalizeInput(raw);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { prompt: ruleBasedRewrite(input), source: "rule-based" };
  }

  for (const model of getModels()) {
    try {
      const prompt = await callModel(model, input, apiKey);
      if (prompt) return { prompt, source: "llm", model };
    } catch (err) {
      if (err instanceof FatalProviderError) {
        debug(`kredensial ditolak (${err.message}), berhenti mencoba model lain`);
        break;
      }
      const name = err instanceof Error ? err.name : "unknown";
      debug(`${model} error: ${name}`);
    }
  }

  return { prompt: ruleBasedRewrite(input), source: "rule-based" };
}

/** Versi sederhana: hanya mengembalikan string. */
export async function rewriteImagePrompt(raw: string): Promise<string> {
  return (await rewriteImagePromptDetailed(raw)).prompt;
}