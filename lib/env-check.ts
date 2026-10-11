// lib/env-check.ts

type Check = {
  name: string;
  ok: boolean;
  hint?: string;
};

export function checkEnv(): Check[] {
  const provider = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();

  const checks: Check[] = [
    {
      name: "AI_PROVIDER",
      ok: ["gemini", "grok", "openrouter"].includes(provider),
      hint: `Harus salah satu dari: gemini | grok | openrouter. Sekarang: "${provider}"`,
    },
  ];

  // Cek key sesuai provider aktif
  if (provider === "gemini") {
    checks.push({
      name: "GEMINI_API_KEY",
      ok: !!process.env.GEMINI_API_KEY,
      hint: "Dapatkan di https://aistudio.google.com/apikey",
    });
  }
  if (provider === "grok") {
    checks.push({
      name: "GROK_API_KEY",
      ok: !!process.env.GROK_API_KEY,
      hint: "Dapatkan di https://console.x.ai",
    });
  }
  if (provider === "openrouter") {
    checks.push({
      name: "OPENROUTER_API_KEY",
      ok: !!process.env.OPENROUTER_API_KEY,
      hint: "Dapatkan di https://openrouter.ai/keys",
    });
  }

  // NVIDIA opsional (untuk generate gambar), tapi kalau kosong catat sebagai info
  checks.push({
    name: "NVIDIA_API_KEY",
    ok: !!process.env.NVIDIA_API_KEY,
    hint: "Opsional. Tanpa ini, generate gambar akan fallback ke Pollinations (watermark). Dapatkan di https://build.nvidia.com",
  });

  return checks;
}

export function runEnvCheckOnce() {
  if (typeof window !== "undefined") return;

  // Hindari log berulang di hot-reload
  const g = globalThis as any;
  if (g.__envChecked) return;
  g.__envChecked = true;

  const checks = checkEnv();
  const errors = checks.filter(
    (c) => !c.ok && c.name !== "NVIDIA_API_KEY" // NVIDIA opsional
  );
  const warns = checks.filter(
    (c) => !c.ok && c.name === "NVIDIA_API_KEY"
  );

  console.log("");
  console.log("──────────────────────────────────────────");
  console.log("  Environment Check");
  console.log("──────────────────────────────────────────");

  for (const c of checks) {
    if (c.ok) {
      console.log(`  ✅ ${c.name}`);
    } else if (warns.includes(c)) {
      console.log(`  ⚠️  ${c.name}  → ${c.hint}`);
    } else {
      console.log(`  ❌ ${c.name}  → ${c.hint}`);
    }
  }

  console.log("──────────────────────────────────────────");

  if (errors.length > 0) {
    console.error(
      `\n  ${errors.length} environment variable wajib belum diisi. Aplikasi mungkin tidak berfungsi.\n`
    );
  } else {
    console.log("  Semua env wajib sudah terisi.\n");
  }
}