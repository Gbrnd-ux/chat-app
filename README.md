<div align="center">
  <img src="assets/banner.svg" width="100%" alt="AI Multimodal Chat — chat AI dengan generasi gambar, dokumen, dan UI" />
</div>

<br/>

<div align="center">
  <img src="https://img.shields.io/badge/NEXT.JS-14-1a1a1a?style=for-the-badge&logo=next.js&logoColor=white&labelColor=0d0d0d" alt="Next.js 14" />
  <img src="https://img.shields.io/badge/TYPESCRIPT-1a1a1a?style=for-the-badge&logo=typescript&logoColor=white&labelColor=0d0d0d" alt="TypeScript" />
  <img src="https://img.shields.io/badge/TAILWIND%20CSS-1a1a1a?style=for-the-badge&logo=tailwind-css&logoColor=white&labelColor=0d0d0d" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/MONACO%20EDITOR-1a1a1a?style=for-the-badge&logo=visualstudiocode&logoColor=white&labelColor=0d0d0d" alt="Monaco Editor" />
  <img src="https://img.shields.io/badge/STATUS-DEMO%20%2F%20BETA-1a1a1a?style=for-the-badge&labelColor=0d0d0d" alt="Status: Demo / Beta" />
</div>

<br/>

<h2 align="center">ABOUT</h2>

<p align="center">
  <b>AI Multimodal Chat</b> adalah antarmuka obrolan cerdas yang tidak hanya menjawab teks,<br/>
  tetapi juga menganalisis <b>gambar</b>, menghasilkan <b>gambar</b>, <b>dokumen</b>, dan <b>UI interaktif</b>.<br/><br/>
  Proyek ini dibuat untuk mendemonstrasikan arsitektur aplikasi AI modern<br/>
  yang responsif, aman (sandboxed), dan siap menghadapi batasan <i>serverless environment</i>.
</p>

<br/>

<h2 align="center">FEATURES</h2>

<table align="center" width="100%">
  <tr>
    <td width="33%" valign="top">
      <b>💬 Chat streaming</b><br/>
      Streaming respons real-time dengan Markdown rendering.
    </td>
    <td width="33%" valign="top">
      <b>👁️ Vision</b><br/>
      Analisis gambar yang dilampirkan dengan deskripsi teliti.
    </td>
    <td width="33%" valign="top">
      <b>🎨 Prompt-to-UI</b><br/>
      Generate UI dari deskripsi natural. Preview di panel kanan, edit pakai Monaco Editor.
    </td>
  </tr>
  <tr>
    <td width="33%" valign="top">
      <b>🖼️ Image generation</b><br/>
      Buat gambar dengan FLUX.1 lewat provider yang tersedia.
    </td>
    <td width="33%" valign="top">
      <b>📄 Document generation</b><br/>
      Buat Word (.docx) &amp; Excel (.xlsx) dari deskripsi teks.
    </td>
    <td width="33%" valign="top">
      <b>🔒 Sandboxed preview</b><br/>
      UI hasil AI dijalankan di dalam iframe dengan CSP ketat — tidak bisa akses data aplikasi.
    </td>
  </tr>
  <tr>
    <td width="33%" valign="top">
      <b>🌙 Dark mode</b><br/>
      UI bersih terinspirasi aplikasi AI terkemuka (Claude, Vercel).
    </td>
    <td width="33%" valign="top">
      <b>⚡ Multi-provider</b><br/>
      Ganti provider AI via satu env variable.
    </td>
    <td width="33%" valign="top">
      <b>🔑 API key rotation</b><br/>
      Otomatis pindah ke API key berikutnya saat kena rate limit.
    </td>
  </tr>
</table>

<br/>

## 📊 Status Fitur

| Fitur | Status | Catatan |
|---|---|---|
| 💬 Chat Streaming | ✅ **Stable** | Multi-provider (Gemini, OpenRouter) |
| 👁️ Vision (Analisis Gambar) | ✅ **Stable** | Model vision dari Gemini |
| 🎨 Prompt-to-UI | ✅ **Stable** | Artifact panel + Monaco Editor |
| 📄 Document Generator | ✅ **Stable** | Word (.docx) & Excel (.xlsx) |
| 🖼️ Image Generation | ✅ **Stable** | Via provider image |
| 🎬 Video Generation | 🚧 **Coming Soon** | Dalam pengembangan, akan hadir segera |
| 🔍 Web Search | ❌ **Belum ada** | Roadmap Q3 |
| 👤 User Account | ❌ **Belum ada** | Roadmap Q4 |

### Catatan Video Generation

Fitur video generation **sedang dalam pengembangan** karena:
- API tier gratis butuh 5-15 menit per video
- Sedang mencari provider yang lebih reliable

Saat ini **tidak aktif** di UI. Akan diumumkan saat siap.

<br/>

<h2 align="center">PREVIEW</h2>

<table align="center" width="100%">
  <tr>
    <td width="50%" align="center" valign="top">
      <b>Chat &amp; Artifact Panel</b><br/><br/>
      <!-- Ganti dengan: <img src="assets/screenshot-chat.png" width="100%" alt="Chat dengan artifact panel" /> -->
      <i>Screenshot UI chat + panel UI generator</i>
    </td>
    <td width="50%" align="center" valign="top">
      <b>Dokumen &amp; Gambar</b><br/><br/>
      <!-- Ganti dengan: <img src="assets/screenshot-docs.png" width="100%" alt="Fitur dokumen dan gambar" /> -->
      <i>Screenshot UI dokumen dan image generation</i>
    </td>
  </tr>
</table>

<br/>

<h2 align="center">TECHNICAL HIGHLIGHTS</h2>

<p align="center">
  Membuat UI itu mudah. Membuatnya <b>stabil</b>, <b>aman</b>, dan <b>responsif</b> di production adalah tantangan sebenarnya.
</p>

<table align="center" width="100%">
  <tr>
    <td width="50%" valign="top">
      <b>🎨 Prompt-to-UI dengan Sandbox</b><br/><br/>
      <b>Masalah:</b> AI bisa menghasilkan HTML/JS arbitrer yang berpotensi berbahaya jika dirender langsung.<br/><br/>
      <b>Solusi:</b> Kode AI dijalankan di dalam <code>iframe</code> dengan atribut <code>sandbox="allow-scripts"</code> (tanpa <code>allow-same-origin</code>). Ditambah CSP yang memblokir semua network request, storage access, dan form submission. Hasilnya: user bisa melihat &amp; mengedit UI tanpa risiko.
    </td>
    <td width="50%" valign="top">
      <b>🔑 API key rotation</b><br/><br/>
      <b>Masalah:</b> Tier gratis penyedia AI punya kuota harian dan rate limit.<br/><br/>
      <b>Solusi:</b> Backend memilih acak maksimal 5 API key dari environment variables. Saat satu key terkena limit (401/429), sistem pindah ke key berikutnya tanpa disadari pengguna.
    </td>
  </tr>
</table>

<br/>

<h2 align="center">TECH STACK</h2>

<div align="center">
  <img src="assets/stack.svg" width="100%" alt="Next.js 14, TypeScript, Tailwind CSS, Monaco Editor, Vercel, Route Handlers, Key Rotation" />
</div>

<br/>

<table align="center" width="100%">
  <tr>
    <td width="50%" valign="top">
      <b>Frontend</b><br/>
      • Next.js 14 (App Router)<br/>
      • TypeScript<br/>
      • Tailwind CSS<br/>
      • Monaco Editor (code editing)<br/>
      • React Hooks (state management)
    </td>
    <td width="50%" valign="top">
      <b>Backend &amp; AI</b><br/>
      • Next.js Route Handlers<br/>
      • Gemini / Grok / OpenRouter<br/>
      • FLUX (image generation)<br/>
      • LocalStorage (persist chat)
    </td>
  </tr>
</table>

<br/>

<h2 align="center">GETTING STARTED</h2>

**1. Clone repositori**

```bash
git clone https://github.com/Gbrnd-ux/chat-app.git
cd chat-app
```

**2. Install dependencies**

```bash
npm install
```

**3. Siapkan environment variables**

```bash
cp .env.example .env.local
```

Buka `.env.local`, lalu isi minimal:

```env
# Provider AI (pilih salah satu: gemini, grok, openrouter)
AI_PROVIDER=gemini

# API Key (sesuai provider yang dipilih)
GEMINI_API_KEY=your_key_here
```

**4. Jalankan development server**

```bash
npm run dev
```

Buka http://localhost:3000 di browser.

<br/>

<h2 align="center">CARA PAKAI PROMPT-TO-UI</h2>

<p align="center">
  Cukup ketik deskripsi UI dalam bahasa natural, contoh:
</p>

```text
Buatkan landing page kafe minimalis dengan tema gelap.
Ada hero section, menu kopi, dan footer.
```

<p align="center">
  AI akan menghasilkan HTML + Tailwind CSS, dan panel preview otomatis terbuka di kanan.<br/>
  Anda bisa klik <b>"Kode"</b> untuk edit langsung di Monaco Editor.
</p>

<br/>

<h2 align="center">DISCLAIMER</h2>

<p align="center">
  Proyek ini berstatus <b>DEMO / BETA</b> dan memakai API tier gratis,<br/>
  sehingga kuota dan kecepatan respons bisa berubah sewaktu-waktu.
</p>

<table align="center" width="100%">
  <tr>
    <td width="50%" valign="top">
      <b>Rate limit</b><br/>
      Maksimal 5 API key dicoba per request untuk mencegah pemblokiran IP.
    </td>
    <td width="50%" valign="top">
      <b>Video generation</b><br/>
      Belum aktif. Lihat <a href="#catatan-video-generation">Catatan Video Generation</a> di atas.
    </td>
  </tr>
</table>

<p align="center"><sub>Proyek ini dibuat murni untuk tujuan pembelajaran dan portofolio.</sub></p>

<br/>

<h2 align="center">CONTRIBUTING</h2>

<p align="center">
  Kontribusi terbuka untuk siapa saja.<br/>
  Punya ide fitur atau perbaikan bug? Buka <a href="https://github.com/Gbrnd-ux/chat-app/issues">issue</a> atau kirim pull request.
</p>

<br/>

<h2 align="center">LET'S CONNECT</h2>

<p align="center">
  <a href="mailto:gibrandpradana@gmail.com">
    <img src="https://img.shields.io/badge/EMAIL-0d0d0d?style=for-the-badge&logo=gmail&logoColor=white" alt="Email" />
  </a>
  <a href="https://github.com/Gbrnd-ux">
    <img src="https://img.shields.io/badge/GITHUB-0d0d0d?style=for-the-badge&logo=github&logoColor=white" alt="GitHub" />
  </a>
  <a href="https://instagram.com/gbrnd.d">
    <img src="https://img.shields.io/badge/INSTAGRAM-0d0d0d?style=for-the-badge&logo=instagram&logoColor=white" alt="Instagram" />
  </a>
</p>

<div align="center">
  <img src="assets/footer.svg" width="100%" alt="Thanks for stopping by" />
</div>
