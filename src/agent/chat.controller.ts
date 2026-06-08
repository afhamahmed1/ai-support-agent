import { Body, Controller, Get, Post } from '@nestjs/common';
import { ChatService, ChatResult } from './chat.service';
import { ChatRequestDto } from './dto/chat-request.dto';

@Controller('api')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }

  @Post('chat')
  ask(@Body() body: ChatRequestDto): Promise<ChatResult> {
    return this.chat.ask(body.message, body.history ?? []);
  }
}
