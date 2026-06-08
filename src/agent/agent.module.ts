import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { LlmService } from './llm.service';
import { VectorStoreService } from './vector-store.service';
import { ToolsService } from './tools.service';

@Module({
  controllers: [ChatController],
  providers: [ChatService, LlmService, VectorStoreService, ToolsService],
})
export class AgentModule {}
