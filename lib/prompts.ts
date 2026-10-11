// lib/prompts.ts

export function chatSystemPrompt(): string {
  return [
    "Kamu adalah asisten AI yang membantu, ramah, dan cerdas.",
    "",
    "Aturan:",
    "- Balas dalam bahasa yang sama dengan pertanyaan user.",
    "- Sesuaikan panjang jawaban dengan kompleksitas pertanyaan.",
    "- Jangan mengulang pertanyaan user di awal jawaban.",
    "- Gunakan Markdown dengan tepat.",
    "- Kalau tidak tahu, katakan tidak tahu. Jangan mengarang.",
    "- Hindari emoji berlebihan.",
  ].join("\n");
}

export function visionSystemPrompt(): string {
  return [
    "Kamu adalah asisten visual yang teliti dan jujur.",
    "",
    "Saat user melampirkan gambar:",
    "- Deskripsikan hanya apa yang benar-benar terlihat.",
    "- Kalau ragu, gunakan kata 'sepertinya' atau 'kemungkinan'.",
    "- Kalau ada teks di gambar, bacakan teksnya.",
    "- Kalau user bertanya tentang sesuatu yang tidak ada, katakan jelas.",
    "- Balas dalam bahasa yang sama dengan pertanyaan user.",
  ].join("\n");
}

/**
 * System prompt untuk LLM yang bertugas me-rewrite prompt gambar.
 * Target: prompt FLUX yang detail, dalam bahasa Inggris.
 */
export function imageRewriterSystemPrompt(): string {
  return [
    "You are an expert prompt engineer for the FLUX.1 image generation model.",
    "",
    "Your job: rewrite the user's image request into ONE detailed English prompt that FLUX will render accurately.",
    "",
    "Rules:",
    "- Output ONLY the rewritten prompt. No preamble, no explanation, no quotes.",
    "- Translate any non-English input to English.",
    "- Be specific about: subject, pose/action, expression, environment, lighting, style, quality.",
    "- If the user says a pose or action (sleeping, sitting, jumping), describe it explicitly with visual details (e.g. 'sleeping curled up, eyes closed, relaxed body').",
    "- Add style hints ONLY if the user mentioned a style or if it fits naturally (e.g. '3D render', 'photorealistic', 'watercolor').",
    "- End with quality tags: 'highly detailed, sharp focus, cinematic lighting, 8k'.",
    "- Keep the prompt under 200 words.",
    "- Never add text, watermarks, or signatures to the image.",
  ].join("\n");
}

/**
 * Fallback rewrite kalau LLM tidak tersedia.
 * Rule-based sederhana untuk pose & gaya umum.
 */
export function ruleBasedRewrite(raw: string): string {
  const t = raw.trim().toLowerCase();

  // Mapping aksi/pose Indonesia → frasa Inggris
  const poses: Array<[RegExp, string]> = [
    [/\btidur\b/, "sleeping curled up, eyes closed, relaxed body"],
    [/\btertidur\b/, "sleeping peacefully, eyes closed"],
    [/\bduduk\b/, "sitting upright"],
    [/\bberdiri\b/, "standing on all fours"],
    [/\blari\b|\bberlari\b/, "running, dynamic motion"],
    [/\blompat\b|\bmelompat\b/, "jumping mid-air, dynamic pose"],
    [/\bmakan\b/, "eating, chewing"],
    [/\bminum\b/, "drinking"],
    [/\bmain\b|\bbermain\b/, "playing, playful pose"],
  ];

  const styles: Array<[RegExp, string]> = [
    [/\bpixel ?art\b/, "pixel art style"],
    [/\brealis\b|\brealistic\b/, "photorealistic, 8k photography"],
    [/\b3d\b/, "3D render, octane"],
    [/\banime\b/, "anime style, cel shaded"],
    [/\bwatercolor\b|\bcat air\b/, "watercolor painting"],
    [/\bminimalis\b|\bminimalist\b/, "minimalist, clean background"],
    [/\bneon\b/, "neon lighting, cyberpunk"],
  ];

  let enriched = raw;
  for (const [re, phrase] of poses) {
    if (re.test(t)) {
      enriched += `, ${phrase}`;
    }
  }
  for (const [re, phrase] of styles) {
    if (re.test(t)) {
      enriched += `, ${phrase}`;
    }
  }

  // Selalu tambah quality tags
  enriched += ", highly detailed, sharp focus, cinematic lighting, 8k";
  return enriched;
}

/**
 * Rewrite prompt via Gemini Lite. Fallback ke rule-based kalau gagal.
 */
export async function rewriteImagePrompt(raw: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return ruleBasedRewrite(raw);

  const models = [
    "gemini-2.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-flash-lite-latest",
  ];

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.4,
          max_tokens: 250,
          messages: [
            { role: "system", content: imageRewriterSystemPrompt() },
            { role: "user", content: raw },
          ],
        }),
      });

      if (!res.ok) {
        console.warn(`[rewrite] ${model} gagal: ${res.status}`);
        continue;
      }

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content?.trim();
      if (content && content.length > 10) {
        console.log(`[rewrite] via ${model}: "${content.slice(0, 100)}"`);
        return content;
      }
    } catch (err: any) {
      console.warn(`[rewrite] ${model} error: ${err.message}`);
    }
  }

  console.warn("[rewrite] LLM gagal, pakai rule-based");
  return ruleBasedRewrite(raw);
}