import { Test } from '@nestjs/testing';
import { ChatService } from '../src/agent/chat.service';
import { LlmService } from '../src/agent/llm.service';
import { VectorStoreService } from '../src/agent/vector-store.service';
import { ToolsService } from '../src/agent/tools.service';

describe('ChatService', () => {
  let chat: ChatService;
  let tools: ToolsService;
  const llm = { chat: jest.fn() };
  const store = {
    search: jest
      .fn()
      .mockResolvedValue([{ title: 'Pricing', text: 'Pricing\nPro is $49/month', score: 0.9 }]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ChatService,
        ToolsService,
        { provide: LlmService, useValue: llm },
        { provide: VectorStoreService, useValue: store },
      ],
    }).compile();

    chat = moduleRef.get(ChatService);
    tools = moduleRef.get(ToolsService);
  });

  it('returns a grounded answer with sources when no tool is called', async () => {
    llm.chat.mockResolvedValueOnce({
      role: 'assistant',
      content: 'The Pro plan is $49/month.',
      tool_calls: [],
    });

    const res = await chat.ask('How much is Pro?');

    expect(res.answer).toContain('$49');
    expect(res.sources).toContain('Pricing');
    expect(res.toolsUsed).toHaveLength(0);
    expect(store.search).toHaveBeenCalledWith('How much is Pro?', 4);
  });

  it('executes a requested tool, then returns the follow-up answer', async () => {
    const execSpy = jest.spyOn(tools, 'execute');
    llm.chat
      .mockResolvedValueOnce({
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'c1',
            type: 'function',
            function: { name: 'get_order_status', arguments: '{"orderId":"ORD-1"}' },
          },
        ],
      })
      .mockResolvedValueOnce({
        role: 'assistant',
        content: 'Your order ORD-1 has shipped.',
        tool_calls: [],
      });

    const res = await chat.ask('Where is my order ORD-1?');

    expect(execSpy).toHaveBeenCalledWith('get_order_status', { orderId: 'ORD-1' });
    expect(res.toolsUsed).toContain('get_order_status');
    expect(res.answer).toContain('shipped');
  });
});
