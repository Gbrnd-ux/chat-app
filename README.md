<div align="center">
  <h1>🤖 AI Multimodal Chat</h1>
  <p><b>Asynchronous AI Chat with Image, Video, and Document Generation</b></p>
  
  <p>
    <img src="https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js" alt="Next.js" />
    <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
    <img src="https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel" />
  </p>
</div>

<br/>

## 📖 Tentang Proyek

**AI Multimodal Chat** adalah aplikasi antarmuka obrolan cerdas yang tidak hanya bisa menjawab pertanyaan teks, tetapi juga dapat menghasilkan gambar, dokumen, dan video. Proyek ini dibangun untuk mendemonstrasikan arsitektur aplikasi AI modern yang tangguh, responsif, dan siap menghadapi batasan *serverless environment*.

### 🖼️ Tampilan Aplikasi

| Fitur Chat & Gambar | Fitur Video & Dokumen |
| :---: | :---: |
| *[Masukkan Screenshot UI Chat Anda di Sini]* | *[Masukkan Screenshot UI Video/Dokumen di Sini]* |

<br/>

## ✨ Fitur Utama

- **Multi-Modal Interface**: Dukungan untuk percakapan teks, generasi gambar, generasi video, dan pembuatan dokumen (Word/Excel).
- **Modern Dark Mode UI**: Antarmuka pengguna yang bersih, responsif, dan nyaman digunakan (terinspirasi dari antarmuka AI terkemuka).
- **Smart Error Handling**: Membedakan antara *rate limit*, *server down*, dan *invalid prompt*, lalu memberikan pesan yang jelas kepada pengguna.
- **Secure Proxy**: Menggunakan API route internal untuk menyembunyikan URL eksternal dan menangani masalah CORS.

<br/>

## 🧠 Tantangan Teknis & Solusi (Technical Highlights)

Ini adalah bagian terpenting dari proyek ini. Membuat UI itu mudah, tetapi membuatnya berjalan stabil di lingkungan produksi adalah tantangan tersendiri.

### 1. Mengatasi Serverless Timeout (Asynchronous Polling)
**Masalah:** Vercel (paket Hobby) memiliki batas waktu eksekusi fungsi maksimal 60 detik. Sementara itu, API pembuatan video (Agnes AI) dapat memakan waktu 5 hingga 15 menit untuk menyelesaikan satu video. Jika kita menunggu di backend, koneksi akan terputus.  
**Solusi:** Saya merancang arsitektur **Fire-and-Forget**:
- Backend hanya mengirim tugas ke Agnes AI, mendapatkan `videoId`, dan langsung mengembalikannya ke frontend (hanya butuh ~2 detik).
- Frontend secara otomatis melakukan **polling** ke endpoint `/api/check-video` setiap 10 detik hingga statusnya `completed`.

### 2. Multi-API Key Rotation (Resilience)
**Masalah:** API gratis Agnes AI memiliki kuota harian dan batas rate limit. Jika satu akun habis, seluruh aplikasi akan macet.  
**Solusi:** Saya menerapkan sistem rotasi API Key di backend. Sistem akan memilih secara acak maksimal **5 API Key** dari *environment variables*. Jika satu key terkena limit (401/429), sistem akan otomatis beralih ke key berikutnya tanpa membuat pengguna sadar.

### 3. Video Proxy & Streaming
**Masalah:** URL video dari Agnes AI seringkali memiliki batasan CORS dan masa kedaluwarsa yang singkat.  
**Solusi:** Membuat endpoint `/api/video-proxy` yang memvalidasi domain (whitelist) dan meneruskan *streaming* video langsung dari server Agnes ke browser pengguna, mengurangi beban memori server.

<br/>

## 🛠️ Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **AI Provider**: [Agnes AI](https://apihub.agnes-ai.com/) (Video Generation)
- **Deployment**: [Vercel](https://vercel.com/)

<br/>

## 🚀 Cara Menjalankan Secara Lokal

Ikuti langkah-langkah berikut untuk menjalankan proyek ini di komputer Anda:

1. **Clone repositori ini:**
   ```bash
   git clone https://github.com/Gbrnd-ux/[nama-repo-anda].git
   cd [nama-repo-anda]
