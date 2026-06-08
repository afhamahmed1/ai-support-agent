import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { LlmService } from './llm.service';

interface Chunk {
  title: string;
  text: string;
  embedding: number[];
}

export interface RetrievedChunk {
  title: string;
  text: string;
  score: number;
}

/**
 * Minimal in-memory vector store: embeds the knowledge base on startup and
 * retrieves the most similar sections via cosine similarity.
 *
 * Swap this for a pgvector / Pinecone adapter in production — the public
 * `search()` contract stays the same.
 */
@Injectable()
export class VectorStoreService implements OnModuleInit {
  private readonly logger = new Logger(VectorStoreService.name);
  private chunks: Chunk[] = [];

  constructor(private readonly llm: LlmService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ingest();
    } catch (err) {
      this.logger.error(`Failed to ingest knowledge base: ${(err as Error).message}`);
    }
  }

  private async ingest(): Promise<void> {
    const path = join(__dirname, '..', '..', 'data', 'knowledge-base.md');
    const sections = this.splitByHeading(readFileSync(path, 'utf-8'));
    if (!sections.length) return;

    const embeddings = await this.llm.embed(sections.map((s) => s.text));
    this.chunks = sections.map((s, i) => ({ ...s, embedding: embeddings[i] }));
    this.logger.log(`Ingested ${this.chunks.length} knowledge-base sections.`);
  }

  /** Split markdown into one chunk per (#, ##, ###) heading. */
  private splitByHeading(markdown: string): Array<{ title: string; text: string }> {
    const out: Array<{ title: string; text: string }> = [];
    let title = 'Overview';
    let buffer: string[] = [];

    const flush = (): void => {
      const body = buffer.join('\n').trim();
      if (body) out.push({ title, text: `${title}\n${body}` });
      buffer = [];
    };

    for (const line of markdown.split('\n')) {
      const heading = /^#{1,3}\s+(.*)/.exec(line);
      if (heading) {
        flush();
        title = heading[1].trim();
      } else {
        buffer.push(line);
      }
    }
    flush();
    return out;
  }

  async search(query: string, k = 4): Promise<RetrievedChunk[]> {
    if (!this.chunks.length) return [];
    const [q] = await this.llm.embed([query]);
    return this.chunks
      .map((c) => ({ title: c.title, text: c.text, score: cosineSimilarity(q, c.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}
