<div align="center">
  <img src="assets/banner.svg" width="100%" alt="TanyAI — Ask anything. Understand everything." />
</div>

<br/>

<div align="center">
  <img src="https://img.shields.io/badge/NEXT.JS-16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/TYPESCRIPT-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/TAILWIND%20CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/SUPABASE-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/GEMINI-8E75B2?style=for-the-badge&logo=googlegemini&logoColor=white" alt="Gemini" />
  <img src="https://img.shields.io/badge/OPENROUTER-6467F2?style=for-the-badge" alt="OpenRouter" />
  <img src="https://img.shields.io/badge/DEPLOY-VERCEL-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel" />
</div>

<br/>

<p align="center">
  <a href="#about">About</a> ·
  <a href="#features">Features</a> ·
  <a href="#tech-stack">Tech Stack</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#getting-started">Getting Started</a> ·
  <a href="#environment-variables">Environment</a> ·
  <a href="#contributing">Contributing</a>
</p>

<br/>

<h2 align="center">ABOUT</h2>

<p align="center">
  <b>TanyAI</b> is a multi-modal AI chat that reads what you give it.<br/>
  Ask in plain text, drop in an image, or upload a <b>PDF</b> or <b>Word</b> file and chat with its contents.<br/><br/>
  Under the hood: a Retrieval-Augmented Generation (RAG) pipeline on <b>Supabase + pgvector</b>,<br/>
  automatic <b>API key rotation</b> and <b>provider fallback</b>, and word-by-word <b>streaming</b> responses.<br/><br/>
  <i>"Tanya" means "ask" in Indonesian. Tanya apa saja, TanyAI yang bantu cari jawabannya.</i>
</p>

<br/>

<h2 align="center">FEATURES</h2>

<table align="center" width="100%">
  <tr>
    <td width="33%" valign="top">
      <b>💬 Multi-modal chat</b><br/>
      One conversation for text, images (Vision), and documents. No switching tools.
    </td>
    <td width="33%" valign="top">
      <b>📚 Chat with your documents</b><br/>
      Upload PDF or Word files. TanyAI indexes them in a vector database and answers with grounded context (RAG).
    </td>
    <td width="33%" valign="top">
      <b>🔄 Key rotation &amp; provider fallback</b><br/>
      Hit a rate limit? TanyAI switches to the next API key, then to the next provider, automatically.
    </td>
  </tr>
  <tr>
    <td width="33%" valign="top">
      <b>🧭 Intent detection</b><br/>
      Understands whether you want a regular answer or a UI generated, and routes the request to the right pipeline.
    </td>
    <td width="33%" valign="top">
      <b>⚡ Real-time streaming</b><br/>
      Answers appear word by word, handled by a custom stream parser that stays smooth across providers.
    </td>
    <td width="33%" valign="top">
      <b>🧱 Modern, type-safe stack</b><br/>
      Next.js 16 App Router, TypeScript end to end, Tailwind CSS, and PostgreSQL with pgvector.
    </td>
  </tr>
</table>

<br/>

<h2 align="center">TECH STACK</h2>

<div align="center">
  <img src="assets/stack.svg" width="100%" alt="Next.js 16, TypeScript, Tailwind CSS, Supabase, pgvector, Gemini API, OpenRouter, Vercel AI SDK, Mammoth, Unpdf" />
</div>

<br/>

<table align="center" width="100%">
  <tr>
    <td width="50%" valign="top">
      <b>Frontend</b><br/>
      • Next.js 16 (App Router)<br/>
      • TypeScript<br/>
      • Tailwind CSS<br/>
      • Custom streaming parser
    </td>
    <td width="50%" valign="top">
      <b>Backend &amp; AI</b><br/>
      • Next.js Route Handlers<br/>
      • Supabase (PostgreSQL + pgvector)<br/>
      • Gemini API (chat, vision, embeddings)<br/>
      • OpenRouter API (fallback provider)<br/>
      • Vercel AI SDK (optional)<br/>
      • Mammoth (Word parser) · Unpdf (PDF parser)
    </td>
  </tr>
</table>

<br/>

<h2 align="center">ARCHITECTURE</h2>

<h3>System overview</h3>

Every message goes through intent detection first. UI-generation requests and regular chat take different paths, but both share the same provider router and streaming layer.

```mermaid
flowchart LR
  U["User"] --> UI["Next.js UI<br/>App Router"]
  UI --> API["Route Handlers"]
  API --> INTENT{"Intent detection"}
  INTENT -->|"UI request"| UIG["UI generator"]
  INTENT -->|"Chat / Vision / Docs"| CHAT["Chat pipeline"]
  CHAT <--> RAG["RAG retriever"]
  RAG <--> DB[("Supabase<br/>PostgreSQL + pgvector")]
  CHAT --> ROUTER["Provider router<br/>key rotation + fallback"]
  UIG --> ROUTER
  ROUTER --> G["Gemini API"]
  ROUTER --> O["OpenRouter API"]
  G --> PARSER["Custom stream parser"]
  O --> PARSER
  PARSER -->|"word-by-word"| UI
```

<h3>How RAG works</h3>

1. **Ingest.** The uploaded file is parsed with **Unpdf** (PDF) or **Mammoth** (DOCX), cleaned, and split into chunks.
2. **Embed and store.** Each chunk is converted into an embedding and saved in Supabase with **pgvector**.
3. **Retrieve.** At question time, the query is embedded and the most similar chunks are found with a cosine-similarity search.
4. **Generate.** The top chunks are added to the prompt, so the model answers from your document, and the response streams back to the UI.

```mermaid
flowchart TB
  subgraph Ingestion
    A["Upload PDF / DOCX"] --> B{"File type"}
    B -->|"PDF"| C["Unpdf"]
    B -->|"DOCX"| D["Mammoth"]
    C --> E["Clean and chunk text"]
    D --> E
    E --> F["Generate embeddings"]
    F --> G[("pgvector")]
  end
  subgraph Retrieval
    H["User question"] --> I["Embed query"]
    I --> J["Cosine similarity search"]
    G --> J
    J --> K["Top-k chunks"]
    K --> L["Build grounded prompt"]
    L --> M["LLM streams the answer"]
  end
```

<h3>Resilience: key rotation and provider fallback</h3>

Free-tier quotas and rate limits are a fact of life. TanyAI treats them as a normal case, not an error: the user keeps chatting while the backend quietly picks another key or provider.

```mermaid
flowchart LR
  R["Request"] --> P1["Primary provider<br/>pick an API key"]
  P1 -->|"OK"| S["Stream response"]
  P1 -->|"401 / 429"| K["Rotate to next key"]
  K -->|"OK"| S
  K -->|"keys exhausted"| P2["Fallback provider"]
  P2 --> S
```

<br/>

<h2 align="center">GETTING STARTED</h2>

**Prerequisites**

- Node.js 20.9 or newer
- A [Supabase](https://supabase.com) project
- At least one API key from [Google AI Studio](https://aistudio.google.com) (Gemini) and/or [OpenRouter](https://openrouter.ai)

**1. Clone the repository**

```bash
git clone https://github.com/Gbrnd-ux/tanyai.git
cd tanyai
```

**2. Install dependencies**

```bash
npm install
```

**3. Set up Supabase (pgvector)**

Open the **SQL Editor** in your Supabase dashboard and run:

```sql
-- Enable vector search
create extension if not exists vector;

-- Document chunks
create table if not exists documents (
  id bigserial primary key,
  file_name text not null,
  content text not null,
  metadata jsonb default '{}'::jsonb,
  embedding vector(768)  -- match your embedding model's dimension
);

-- Fast similarity search
create index if not exists documents_embedding_idx
  on documents using hnsw (embedding vector_cosine_ops);

-- Retrieval function
create or replace function match_documents(
  query_embedding vector(768),
  match_count int default 5,
  match_threshold float default 0.5
)
returns table (id bigint, content text, metadata jsonb, similarity float)
language sql stable
as $$
  select
    id,
    content,
    metadata,
    1 - (embedding <=> query_embedding) as similarity
  from documents
  where 1 - (embedding <=> query_embedding) > match_threshold
  order by embedding <=> query_embedding
  limit match_count;
$$;
```

**4. Configure environment variables**

```bash
cp .env.example .env.local
```

Fill in `.env.local`. See [Environment Variables](#environment-variables) below.

**5. Run the development server**

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

<br/>

<h2 align="center">ENVIRONMENT VARIABLES</h2>

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key. **Server-side only, never expose it to the client.** |
| `AI_PROVIDER` | ✅ | Primary provider: `gemini` or `openrouter` |
| `GEMINI_API_KEYS` | ✅ if using Gemini | One or more keys, comma-separated, used for rotation |
| `OPENROUTER_API_KEYS` | Optional | One or more keys, comma-separated. Used as primary or as fallback. |
| `OPENROUTER_MODEL` | Optional | Model ID to use on OpenRouter |

Example `.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# AI providers
AI_PROVIDER=gemini
GEMINI_API_KEYS=key_1,key_2,key_3
OPENROUTER_API_KEYS=key_1,key_2
```

> **Security note:** never commit `.env.local`. Keep the service role key on the server only.

<br/>

<h2 align="center">TRY IT</h2>

<p align="center">Some prompts to get started:</p>

```text
Summarize the attached PDF in five bullet points.
```

```text
What does this screenshot show? Explain it step by step.
```

```text
Build a dark-themed landing page for a small coffee shop.
```

<br/>

<h2 align="center">CONTRIBUTING</h2>

<p align="center">
  Contributions are welcome.<br/>
  Got a feature idea or found a bug? Open an <a href="https://github.com/Gbrnd-ux/tanyai/issues">issue</a> or send a pull request.
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
