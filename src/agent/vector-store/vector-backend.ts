export interface ChunkRecord {
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
 * Storage backend for embedded knowledge-base chunks. The facade
 * (VectorStoreService) owns chunking and embedding; a backend only stores
 * vectors and runs similarity search.
 */
export interface VectorBackend {
  /** Replace the stored chunks with this set (the KB is re-ingested on boot). */
  replaceAll(chunks: ChunkRecord[]): Promise<void>;
  /** Return the k chunks most similar to the query embedding. */
  search(embedding: number[], k: number): Promise<RetrievedChunk[]>;
}
