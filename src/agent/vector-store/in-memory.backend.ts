import { ChunkRecord, RetrievedChunk, VectorBackend } from './vector-backend';

/** Zero-setup backend for local dev: cosine similarity over an array. */
export class InMemoryBackend implements VectorBackend {
  private chunks: ChunkRecord[] = [];

  async replaceAll(chunks: ChunkRecord[]): Promise<void> {
    this.chunks = chunks;
  }

  async search(embedding: number[], k: number): Promise<RetrievedChunk[]> {
    return this.chunks
      .map((c) => ({
        title: c.title,
        text: c.text,
        score: cosineSimilarity(embedding, c.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
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
