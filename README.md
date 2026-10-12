<div align="center">
  <img src="assets/banner.svg" width="100%" alt="AI Multimodal Chat, chat AI asinkron dengan generasi gambar, video, dan dokumen" />
</div>

<br/>

<div align="center">
  <img src="https://img.shields.io/badge/NEXT.JS-15-1a1a1a?style=for-the-badge&logo=next.js&logoColor=white&labelColor=0d0d0d" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/TYPESCRIPT-1a1a1a?style=for-the-badge&logo=typescript&logoColor=white&labelColor=0d0d0d" alt="TypeScript" />
  <img src="https://img.shields.io/badge/TAILWIND%20CSS-1a1a1a?style=for-the-badge&logo=tailwind-css&logoColor=white&labelColor=0d0d0d" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/STATUS-DEMO%20%2F%20BETA-1a1a1a?style=for-the-badge&labelColor=0d0d0d" alt="Status: Demo / Beta" />
</div>

<br/>

<h2 align="center">ABOUT</h2>

<p align="center">
  <b>AI Multimodal Chat</b> adalah antarmuka obrolan cerdas yang tidak hanya menjawab teks,<br/>
  tetapi juga menghasilkan <b>gambar</b>, <b>dokumen</b>, dan <b>video</b>.<br/><br/>
  Proyek ini dibuat untuk mendemonstrasikan arsitektur aplikasi AI modern<br/>
  yang responsif dan siap menghadapi batasan <i>serverless environment</i>.
</p>

<br/>

<h2 align="center">PREVIEW</h2>

<table align="center" width="100%">
  <tr>
    <td width="50%" align="center" valign="top">
      <b>Chat &amp; Gambar</b><br/><br/>
      <!-- Ganti dengan: <img src="assets/screenshot-chat.png" width="100%" alt="Fitur chat dan gambar" /> -->
      <i>Screenshot UI chat</i>
    </td>
    <td width="50%" align="center" valign="top">
      <b>Video &amp; Dokumen</b><br/><br/>
      <!-- Ganti dengan: <img src="assets/screenshot-video.png" width="100%" alt="Fitur video dan dokumen" /> -->
      <i>Screenshot UI video dan dokumen</i>
    </td>
  </tr>
</table>

<br/>

<h2 align="center">FEATURES</h2>

<table align="center" width="100%">
  <tr>
    <td width="50%" valign="top">
      <b>Multi-modal</b><br/>
      Percakapan teks, generasi gambar, generasi video, dan pembuatan dokumen Word/Excel.
    </td>
    <td width="50%" valign="top">
      <b>Dark mode UI</b><br/>
      Antarmuka bersih, responsif, dan nyaman dipakai, terinspirasi dari aplikasi AI terkemuka.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <b>Smart error handling</b><br/>
      Membedakan <i>rate limit</i>, <i>server down</i>, dan <i>invalid prompt</i>, lalu menampilkan pesan yang jelas.
    </td>
    <td width="50%" valign="top">
      <b>Secure proxy</b><br/>
      API route internal menyembunyikan URL eksternal dan menangani masalah CORS.
    </td>
  </tr>
</table>

<br/>

<h2 align="center">TECHNICAL HIGHLIGHTS</h2>

<p align="center">
  Membuat UI itu mudah. Membuatnya stabil di production adalah tantangan sebenarnya.
</p>

<div align="center">
  <img src="assets/flow.svg" width="100%" alt="Alur Fire-and-Forget: frontend mengirim tugas, backend mengembalikan videoId, frontend polling status, video di-stream lewat proxy" />
</div>

<br/>

<table align="center" width="100%">
  <tr>
    <td width="33%" valign="top">
      <b>Asynchronous polling</b><br/><br/>
      <b>Masalah:</b> Vercel paket Hobby membatasi fungsi maksimal 60 detik, sedangkan video Agnes AI butuh 5 sampai 15 menit.<br/><br/>
      <b>Solusi:</b> arsitektur <i>Fire-and-Forget</i>. Backend hanya mengirim tugas dan langsung mengembalikan <code>videoId</code> (~2 detik). Frontend melakukan polling ke <code>/api/check-video</code> setiap 10 detik sampai status <code>completed</code>.
    </td>
    <td width="33%" valign="top">
      <b>API key rotation</b><br/><br/>
      <b>Masalah:</b> tier gratis Agnes AI punya kuota harian dan rate limit. Jika satu akun habis, aplikasi macet.<br/><br/>
      <b>Solusi:</b> backend memilih acak maksimal 5 API key dari <i>environment variables</i>. Saat satu key terkena limit (401/429), sistem pindah ke key berikutnya tanpa disadari pengguna.
    </td>
    <td width="33%" valign="top">
      <b>Video proxy &amp; streaming</b><br/><br/>
      <b>Masalah:</b> URL video sering terkena batasan CORS dan cepat kedaluwarsa.<br/><br/>
      <b>Solusi:</b> endpoint <code>/api/video-proxy</code> memvalidasi domain (whitelist) lalu meneruskan <i>stream</i> langsung dari server Agnes ke browser, sehingga beban memori server tetap kecil.
    </td>
  </tr>
</table>

<br/>

<h2 align="center">TECH STACK</h2>

<div align="center">
  <img src="assets/stack.svg" width="100%" alt="Next.js 15, TypeScript, Tailwind CSS, Agnes AI, Vercel, Route Handlers, Polling, Key Rotation" />
</div>

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
# atau
yarn install
```

**3. Siapkan environment variables**

```bash
cp .env.example .env.local
```

Buka `.env.local`, lalu isi dengan API key [Agnes AI](https://apihub.agnes-ai.com/) milik Anda, dipisahkan dengan koma:

```env
AGNES_API_KEYS=sk-key-akun1,sk-key-akun2,sk-key-akun3
```

**4. Jalankan development server**

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) di browser.

<br/>

<h2 align="center">DISCLAIMER</h2>

<p align="center">
  Fitur video berstatus <b>DEMO / BETA</b> karena memakai API Agnes AI tier gratis.
</p>

<table align="center" width="100%">
  <tr>
    <td width="33%" valign="top">
      <b>Waktu proses</b><br/>
      Pembuatan video bisa memakan 5 sampai 15 menit, tergantung antrean server Agnes.
    </td>
    <td width="33%" valign="top">
      <b>Antrean penuh</b><br/>
      Server kadang mengembalikan error 503 (Queue Full). Aplikasi sudah punya retry otomatis; jika antrean benar-benar penuh, coba lagi beberapa menit kemudian.
    </td>
    <td width="33%" valign="top">
      <b>Batas IP</b><br/>
      Maksimal 5 API key dicoba per request untuk mencegah pemblokiran IP oleh Agnes AI.
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
