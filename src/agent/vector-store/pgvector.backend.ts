import { Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { ChunkRecord, RetrievedChunk, VectorBackend } from './vector-backend';

/**
 * pgvector-backed store. Ingest replaces the table contents, which is right
 * for one small knowledge base; move to incremental upserts (and per-tenant
 * tables or a tenant_id column) for large or multi-tenant corpora.
 *
 * Note: the table is created with the dimension of the first ingest. If you
 * change the embedding model, drop the kb_chunks table once.
 */
export class PgVectorBackend implements VectorBackend {
  private readonly logger = new Logger(PgVectorBackend.name);
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async replaceAll(chunks: ChunkRecord[]): Promise<void> {
    if (!chunks.length) return;
    const dim = chunks[0].embedding.length;
    const client = await this.pool.connect();
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
      await client.query(
        `CREATE TABLE IF NOT EXISTS kb_chunks (
           id SERIAL PRIMARY KEY,
           title TEXT NOT NULL,
           body TEXT NOT NULL,
           embedding vector(${dim}) NOT NULL
         )`,
      );
      await client.query('BEGIN');
      await client.query('TRUNCATE kb_chunks');
      for (const c of chunks) {
        await client.query(
          'INSERT INTO kb_chunks (title, body, embedding) VALUES ($1, $2, $3::vector)',
          [c.title, c.text, toVectorLiteral(c.embedding)],
        );
      }
      await client.query('COMMIT');
      this.logger.log(`Stored ${chunks.length} chunks in pgvector.`);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async search(embedding: number[], k: number): Promise<RetrievedChunk[]> {
    const res = await this.pool.query(
      `SELECT title, body, 1 - (embedding <=> $1::vector) AS score
         FROM kb_chunks
        ORDER BY embedding <=> $1::vector
        LIMIT $2`,
      [toVectorLiteral(embedding), k],
    );
    return res.rows.map((r) => ({ title: r.title, text: r.body, score: Number(r.score) }));
  }
}

function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}
