import { Body, Controller, Get, HttpCode, Logger, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { ChatService, ChatResult, ChatStreamEvent } from './chat.service';
import { ChatRequestDto } from './dto/chat-request.dto';

@Controller('api')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(private readonly chat: ChatService) {}

  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }

  @Post('chat')
  ask(@Body() body: ChatRequestDto): Promise<ChatResult> {
    return this.chat.ask(body.message, body.history ?? []);
  }

  /**
   * Server-Sent Events stream. Emits `data: <json>` lines using the
   * ChatStreamEvent shape: sources, then token/tool events, then done.
   */
  @Post('chat/stream')
  @HttpCode(200)
  async stream(@Body() body: ChatRequestDto, @Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (event: ChatStreamEvent): void => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      for await (const event of this.chat.askStream(body.message, body.history ?? [])) {
        if (res.writableEnded || res.destroyed) return;
        send(event);
      }
    } catch (err) {
      this.logger.error(`Stream failed: ${(err as Error).message}`);
      if (!res.writableEnded && !res.destroyed) {
        send({ type: 'error', message: 'The agent hit an unexpected error.' });
      }
    } finally {
      if (!res.writableEnded) res.end();
    }
  }
}
