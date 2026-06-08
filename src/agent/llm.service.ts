import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type {
  ChatCompletionMessage,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';

/**
 * Thin wrapper around the LLM provider. Everything provider-specific lives here,
 * so swapping OpenAI for another backend only touches this file.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly embeddingModel: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY is not set — requests will fail until it is configured.');
    }
    this.client = new OpenAI({ apiKey });
    this.model = this.config.get<string>('openai.model') ?? 'gpt-4o-mini';
    this.embeddingModel =
      this.config.get<string>('openai.embeddingModel') ?? 'text-embedding-3-small';
  }

  async embed(input: string[]): Promise<number[][]> {
    const res = await this.client.embeddings.create({ model: this.embeddingModel, input });
    return res.data.map((d) => d.embedding);
  }

  async chat(
    messages: ChatCompletionMessageParam[],
    tools?: ChatCompletionTool[],
  ): Promise<ChatCompletionMessage> {
    const hasTools = Boolean(tools && tools.length);
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages,
      tools: hasTools ? tools : undefined,
      tool_choice: hasTools ? 'auto' : undefined,
      temperature: 0.2,
    });
    return res.choices[0].message;
  }
}
