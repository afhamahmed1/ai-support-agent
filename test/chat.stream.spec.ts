import { Test } from '@nestjs/testing';
import { ChatService, ChatStreamEvent } from '../src/agent/chat.service';
import { LlmService } from '../src/agent/llm.service';
import { VectorStoreService } from '../src/agent/vector-store.service';
import { ToolsService } from '../src/agent/tools.service';

async function collect(gen: AsyncGenerator<ChatStreamEvent>): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

/** Mirror LlmService.chatStream: yield tokens, return the assembled message. */
function mockRound(tokens: string[], message: unknown): AsyncGenerator<string, unknown> {
  return (async function* () {
    for (const t of tokens) yield t;
    return message;
  })();
}

function ofType<T extends ChatStreamEvent['type']>(
  events: ChatStreamEvent[],
  type: T,
): Extract<ChatStreamEvent, { type: T }>[] {
  return events.filter((e): e is Extract<ChatStreamEvent, { type: T }> => e.type === type);
}

describe('ChatService.askStream', () => {
  let chat: ChatService;
  let tools: ToolsService;
  const llm = { chat: jest.fn(), chatStream: jest.fn() };
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

  it('streams sources, then tokens, then done', async () => {
    llm.chatStream.mockReturnValueOnce(
      mockRound(['The Pro plan ', 'is $49/month.'], {
        role: 'assistant',
        content: 'The Pro plan is $49/month.',
        tool_calls: [],
      }),
    );

    const events = await collect(chat.askStream('How much is Pro?'));

    expect(events[0]).toEqual({ type: 'sources', sources: ['Pricing'] });
    expect(
      ofType(events, 'token')
        .map((e) => e.token)
        .join(''),
    ).toBe('The Pro plan is $49/month.');

    const [done] = ofType(events, 'done');
    expect(done.answer).toContain('$49');
    expect(done.sources).toContain('Pricing');
    expect(done.toolsUsed).toHaveLength(0);
  });

  it('emits a tool event between rounds and streams the follow-up answer', async () => {
    const execSpy = jest.spyOn(tools, 'execute');
    llm.chatStream
      .mockReturnValueOnce(
        mockRound([], {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'c1',
              type: 'function',
              function: { name: 'get_order_status', arguments: '{"orderId":"ORD-1"}' },
            },
          ],
        }),
      )
      .mockReturnValueOnce(
        mockRound(['Your order ', 'has shipped.'], {
          role: 'assistant',
          content: 'Your order has shipped.',
          tool_calls: [],
        }),
      );

    const events = await collect(chat.askStream('Where is my order ORD-1?'));

    expect(execSpy).toHaveBeenCalledWith('get_order_status', { orderId: 'ORD-1' });
    expect(ofType(events, 'tool').map((e) => e.name)).toContain('get_order_status');

    const [done] = ofType(events, 'done');
    expect(done.answer).toBe('Your order has shipped.');
    expect(done.toolsUsed).toContain('get_order_status');
  });
});
