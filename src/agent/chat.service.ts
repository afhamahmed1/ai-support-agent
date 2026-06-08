import { Injectable, Logger } from '@nestjs/common';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { LlmService } from './llm.service';
import { VectorStoreService } from './vector-store.service';
import { ToolsService } from './tools.service';
import { ChatMessageDto } from './dto/chat-request.dto';

export interface ChatResult {
  answer: string;
  sources: string[];
  toolsUsed: string[];
}

const MAX_TOOL_ITERATIONS = 4;

const SYSTEM_PROMPT = `You are a helpful customer-support assistant for a SaaS product.
Answer ONLY using the provided context and tool results. If the context does not contain the
answer, say you don't know and offer to create a support ticket. Be concise and friendly.`;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly store: VectorStoreService,
    private readonly tools: ToolsService,
  ) {}

  async ask(message: string, history: ChatMessageDto[] = []): Promise<ChatResult> {
    const retrieved = await this.store.search(message, 4);
    const context = retrieved.map((r, i) => `[${i + 1}] ${r.text}`).join('\n\n');

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'system',
        content: `Context from the knowledge base:\n\n${context || '(no relevant docs found)'}`,
      },
      ...history.map((m) => ({ role: m.role, content: m.content }) as ChatCompletionMessageParam),
      { role: 'user', content: message },
    ];

    const toolsUsed: string[] = [];

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const reply = await this.llm.chat(messages, this.tools.definitions);
      messages.push(reply as ChatCompletionMessageParam);

      const calls = reply.tool_calls ?? [];
      if (!calls.length) {
        return {
          answer: reply.content ?? '',
          sources: dedupe(retrieved.map((r) => r.title)),
          toolsUsed,
        };
      }

      // The model asked for one or more tools, run them and feed results back.
      for (const call of calls) {
        if (call.type !== 'function') continue;
        toolsUsed.push(call.function.name);

        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || '{}');
        } catch {
          this.logger.warn(`Invalid JSON arguments for tool ${call.function.name}`);
        }

        const result = await this.tools.execute(call.function.name, args);
        messages.push({ role: 'tool', tool_call_id: call.id, content: result });
      }
    }

    this.logger.warn(`Tool loop exceeded ${MAX_TOOL_ITERATIONS} iterations.`);
    return {
      answer:
        "I'm having trouble completing that request right now. Would you like me to create a support ticket?",
      sources: dedupe(retrieved.map((r) => r.title)),
      toolsUsed,
    };
  }
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}
