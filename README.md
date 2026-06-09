# Embeddable AI Support Agent for SaaS

A drop-in AI support agent you can add to any SaaS product with a single `<script>` tag. It answers customer questions from **your own docs** (RAG) and can **take actions** via tool-calling: check an order, create a support ticket, or escalate to a human.

Built with **NestJS + TypeScript** and the **OpenAI API**. Provider-agnostic LLM layer, multi-tenant-friendly, and production-extensible.

> One line to embed:
> ```html
> <script src="https://your-host/widget.js" data-api-url="https://your-host"></script>
> ```

<!-- Add a screenshot or GIF here once you run it: docs/demo.gif -->

## Features
- **RAG over your docs**: grounded answers from a knowledge base, with source tracking (no invented policies).
- **Tool-calling**: the agent can call typed functions (order lookup, ticket creation, human escalation) and use the results in its reply.
- **Streaming responses (SSE)**: token-by-token answers from `POST /api/chat/stream`; the widget renders them live, with a JSON fallback.
- **Embeddable widget**: dependency-free vanilla-JS chat widget; drop it into any site.
- **Provider-agnostic LLM layer**: swap OpenAI for another provider by implementing one small interface.
- **Clean NestJS architecture**: modular, DI-based, DTO-validated, with unit tests.
- **Pluggable vector store**: zero-setup in-memory search for local dev; set `DATABASE_URL` and the same code runs on Postgres + pgvector.

## Architecture
```
Browser widget ──POST /api/chat──▶ ChatController
                                       │
                                       ▼
                                  ChatService ── orchestrates ──────┐
                      ┌────────────────┼───────────────┐           │
                      ▼                ▼               ▼           ▼
              VectorStoreService   ToolsService    LlmService   (chat history)
              (embed + retrieve)  (typed funcs)  (OpenAI chat
                      │                            + embeddings)
                      ▼
              data/knowledge-base.md
```
**Flow:** retrieve the relevant doc chunks, send them with the question and tool definitions to the LLM, run any tool the model asks for and feed the result back, then return the grounded answer with its sources.

## Quick start
```bash
git clone https://github.com/afhamahmed1/ai-support-agent.git
cd ai-support-agent
npm install
cp .env.example .env        # add your OPENAI_API_KEY
npm run start:dev
```
Open **http://localhost:3000/demo.html** to chat with the agent, or call the API directly:

To run with persistent embeddings (Postgres + pgvector) instead of the in-memory store:
```bash
OPENAI_API_KEY=sk-... docker compose up --build
```
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"How much is the Pro plan and is there a free trial?"}'
```

## Configuration
| Var | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | (none) | **Required.** Your OpenAI key. |
| `PORT` | `3000` | HTTP port. |
| `OPENAI_MODEL` | `gpt-4o-mini` | Chat model. |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model. |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins. |
| `DATABASE_URL` | (none) | Optional. Postgres URL with the pgvector extension; embeddings persist there instead of memory. `docker compose up` provides one. |

## API
**`POST /api/chat`**
```jsonc
// request
{ "message": "How do I export my data?", "history": [] }
// response
{
  "answer": "You can export raw events as CSV or JSON from Settings → Data → Export...",
  "sources": ["Exporting your data"],
  "toolsUsed": []
}
```
**`POST /api/chat/stream`** — same request body, answered as Server-Sent Events:
```
data: {"type":"sources","sources":["Exporting your data"]}
data: {"type":"token","token":"You can"}
data: {"type":"token","token":" export raw events"}
data: {"type":"tool","name":"create_ticket"}        // only when the agent calls a tool
data: {"type":"done","answer":"You can export raw events...","sources":[...],"toolsUsed":[...]}
```

**`GET /api/health`** → `{ "status": "ok" }`

## Embedding the widget
```html
<script src="https://your-host/widget.js"
        data-api-url="https://your-host"
        data-title="Ask AI"></script>
```

## Adding a tool
Tools are plain typed functions. Declare one in `src/agent/tools.service.ts`:
```ts
{
  name: 'get_order_status',
  description: 'Look up the status of a customer order by ID',
  parameters: {
    type: 'object',
    properties: { orderId: { type: 'string' } },
    required: ['orderId'],
  },
}
```
...then handle it in `execute()`. The agent decides when to call it.

## Project structure
```
src/
├── main.ts                       # bootstrap, CORS, static widget hosting
├── app.module.ts
├── config/configuration.ts
└── agent/
    ├── agent.module.ts
    ├── chat.controller.ts        # POST /api/chat, /api/chat/stream (SSE), GET /api/health
    ├── chat.service.ts           # RAG + tool-calling orchestration (sync + streaming)
    ├── llm.service.ts            # OpenAI chat + embeddings + token streaming (swappable)
    ├── vector-store.service.ts   # chunking + embedding facade
    ├── vector-store/             # backends: in-memory (default), pgvector (DATABASE_URL)
    ├── tools.service.ts          # typed, executable tools
    └── dto/chat-request.dto.ts
public/   widget.js, demo.html
data/     knowledge-base.md
test/     chat.service.spec.ts
```

## Deploying
- **Render:** the repo includes a [`render.yaml`](render.yaml) blueprint. Create a new Blueprint service, point it at this repo, set `OPENAI_API_KEY`, done.
- **Anywhere with Docker:** `docker build -t ai-support-agent . && docker run -p 3000:3000 -e OPENAI_API_KEY=sk-... ai-support-agent`

## Roadmap
- [x] pgvector vector-store adapter (`DATABASE_URL`)
- [x] Streaming responses (SSE)
- [ ] Per-tenant knowledge bases (multi-tenant isolation)
- [ ] Analytics: unanswered questions + CSAT
- [ ] Admin UI for managing docs and tools

## License
MIT © Afham Ahmed
