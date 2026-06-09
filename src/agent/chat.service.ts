import { Injectable, Logger } from '@nestjs/common';
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from 'openai/resources/chat/completions';
import { LlmService } from './llm.service';
import { VectorStoreService, RetrievedChunk } from './vector-store.service';
import { ToolsService } from './tools.service';
import { ChatMessageDto } from './dto/chat-request.dto';

export interface ChatResult {
  answer: string;
  sources: string[];
  toolsUsed: string[];
}

export type ChatStreamEvent =
  | { type: 'sources'; sources: string[] }
  | { type: 'token'; token: string }
  | { type: 'tool'; name: string }
  | { type: 'done'; answer: string; sources: string[]; toolsUsed: string[] }
  | { type: 'error'; message: string };

const MAX_TOOL_ITERATIONS = 4;

const FALLBACK_ANSWER =
  "I'm having trouble completing that request right now. Would you like me to create a support ticket?";

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
    const sources = dedupe(retrieved.map((r) => r.title));
    const messages = this.buildMessages(message, history, retrieved);
    const toolsUsed: string[] = [];

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const reply = await this.llm.chat(messages, this.tools.definitions);
      messages.push(reply as ChatCompletionMessageParam);

      const calls = reply.tool_calls ?? [];
      if (!calls.length) {
        return { answer: reply.content ?? '', sources, toolsUsed };
      }

      // The model asked for one or more tools, run them and feed results back.
      for (const call of calls) {
        if (call.type !== 'function') continue;
        toolsUsed.push(call.function.name);
        messages.push(await this.executeCall(call));
      }
    }

    this.logger.warn(`Tool loop exceeded ${MAX_TOOL_ITERATIONS} iterations.`);
    return { answer: FALLBACK_ANSWER, sources, toolsUsed };
  }

  /**
   * Streaming variant: same retrieval and tool loop as ask(), but content
   * tokens are emitted as they arrive. Events: sources -> token* / tool* -> done.
   */
  async *askStream(
    message: string,
    history: ChatMessageDto[] = [],
  ): AsyncGenerator<ChatStreamEvent> {
    const retrieved = await this.store.search(message, 4);
    const sources = dedupe(retrieved.map((r) => r.title));
    yield { type: 'sources', sources };

    const messages = this.buildMessages(message, history, retrieved);
    const toolsUsed: string[] = [];

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const round = this.llm.chatStream(messages, this.tools.definitions);
      let answer = '';
      let next = await round.next();
      while (!next.done) {
        answer += next.value;
        yield { type: 'token', token: next.value };
        next = await round.next();
      }
      const reply = next.value;
      messages.push(reply as ChatCompletionMessageParam);

      const calls = reply.tool_calls ?? [];
      if (!calls.length) {
        yield { type: 'done', answer, sources, toolsUsed };
        return;
      }

      for (const call of calls) {
        if (call.type !== 'function') continue;
        toolsUsed.push(call.function.name);
        yield { type: 'tool', name: call.function.name };
        messages.push(await this.executeCall(call));
      }
    }

    this.logger.warn(`Tool loop exceeded ${MAX_TOOL_ITERATIONS} iterations.`);
    yield { type: 'done', answer: FALLBACK_ANSWER, sources, toolsUsed };
  }

  private buildMessages(
    message: string,
    history: ChatMessageDto[],
    retrieved: RetrievedChunk[],
  ): ChatCompletionMessageParam[] {
    const context = retrieved.map((r, i) => `[${i + 1}] ${r.text}`).join('\n\n');
    return [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'system',
        content: `Context from the knowledge base:\n\n${context || '(no relevant docs found)'}`,
      },
      ...history.map((m) => ({ role: m.role, content: m.content }) as ChatCompletionMessageParam),
      { role: 'user', content: message },
    ];
  }

  private async executeCall(
    call: ChatCompletionMessageToolCall,
  ): Promise<ChatCompletionMessageParam> {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(call.function.arguments || '{}');
    } catch {
      this.logger.warn(`Invalid JSON arguments for tool ${call.function.name}`);
    }
    const result = await this.tools.execute(call.function.name, args);
    return { role: 'tool', tool_call_id: call.id, content: result };
  }
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}
