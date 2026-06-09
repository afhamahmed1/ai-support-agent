import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { LlmService } from './llm.service';
import { RetrievedChunk, VectorBackend } from './vector-store/vector-backend';
import { InMemoryBackend } from './vector-store/in-memory.backend';
import { PgVectorBackend } from './vector-store/pgvector.backend';

export type { RetrievedChunk } from './vector-store/vector-backend';

/**
 * Embeds the knowledge base on startup and retrieves the most similar
 * sections for a query. Storage is pluggable: in-memory by default (zero
 * setup), pgvector when DATABASE_URL is set.
 */
@Injectable()
export class VectorStoreService implements OnModuleInit {
  private readonly logger = new Logger(VectorStoreService.name);
  private readonly backend: VectorBackend;
  private ready = false;

  constructor(
    private readonly llm: LlmService,
    config: ConfigService,
  ) {
    const databaseUrl = config.get<string>('databaseUrl');
    this.backend = databaseUrl ? new PgVectorBackend(databaseUrl) : new InMemoryBackend();
    this.logger.log(`Vector store backend: ${databaseUrl ? 'pgvector' : 'in-memory'}`);
  }

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
    await this.backend.replaceAll(sections.map((s, i) => ({ ...s, embedding: embeddings[i] })));
    this.ready = true;
    this.logger.log(`Ingested ${sections.length} knowledge-base sections.`);
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
    if (!this.ready) return [];
    const [q] = await this.llm.embed([query]);
    return this.backend.search(q, k);
  }
}
