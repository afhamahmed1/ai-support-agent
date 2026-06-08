# Embeddable AI Support Agent for SaaS

A drop-in AI support agent you can add to any SaaS product with a single `<script>` tag. It answers customer questions from **your own docs** (RAG) and can **take actions** via tool-calling — check an order, create a support ticket, or escalate to a human.

Built with **NestJS + TypeScript** and the **OpenAI API**. Provider-agnostic LLM layer, multi-tenant-friendly, and production-extensible.

> One line to embed:
> ```html
> <script src="https://your-host/widget.js" data-api-url="https://your-host"></script>
> ```

<!-- Add a screenshot or GIF here once you run it: docs/demo.gif -->

## Features
- **RAG over your docs** — grounded answers from a knowledge base, with source tracking (no invented policies).
- **Tool-calling** — the agent can call typed functions (order lookup, ticket creation, human escalation) and use the results in its reply.
- **Embeddable widget** — dependency-free vanilla-JS chat widget; drop it into any site.
- **Provider-agnostic LLM layer** — swap OpenAI for another provider by implementing one small interface.
- **Clean NestJS architecture** — modular, DI-based, DTO-validated, with unit tests.
- **Zero-setup vector store** — in-memory cosine search for local dev; swap for pgvector/Pinecone in production.

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
**Flow:** retrieve relevant doc chunks → send them + the question + tool definitions to the LLM → if the model requests a tool, execute it and feed the result back → return the grounded answer plus the sources used.

## Quick start
```bash
git clone https://github.com/afhamahmed1/ai-support-agent.git
cd ai-support-agent
npm install
cp .env.example .env        # add your OPENAI_API_KEY
npm run start:dev
```
Open **http://localhost:3000/demo.html** to chat with the agent, or call the API directly:
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"How much is the Pro plan and is there a free trial?"}'
```

## Configuration
| Var | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | — | **Required.** Your OpenAI key. |
| `PORT` | `3000` | HTTP port. |
| `OPENAI_MODEL` | `gpt-4o-mini` | Chat model. |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model. |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins. |

## API
**`POST /api/chat`**
```jsonc
// request
{ "message": "How do I export my data?", "history": [] }
// response
{
  "answer": "You can export raw events as CSV or JSON from Settings → Data → Export…",
  "sources": ["Exporting your data"],
  "toolsUsed": []
}
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
…then handle it in `execute()`. The agent decides when to call it.

## Project structure
```
src/
├── main.ts                       # bootstrap, CORS, static widget hosting
├── app.module.ts
├── config/configuration.ts
└── agent/
    ├── agent.module.ts
    ├── chat.controller.ts        # POST /api/chat, GET /api/health
    ├── chat.service.ts           # RAG + tool-calling orchestration
    ├── llm.service.ts            # OpenAI chat + embeddings (swappable)
    ├── vector-store.service.ts   # in-memory embeddings + cosine search
    ├── tools.service.ts          # typed, executable tools
    └── dto/chat-request.dto.ts
public/   widget.js, demo.html
data/     knowledge-base.md
test/     chat.service.spec.ts
```

## Roadmap
- [ ] pgvector / Pinecone vector-store adapter
- [ ] Per-tenant knowledge bases (multi-tenant isolation)
- [ ] Streaming responses (SSE)
- [ ] Analytics: unanswered questions + CSAT
- [ ] Admin UI for managing docs and tools

## License
MIT © Afham Ahmed
