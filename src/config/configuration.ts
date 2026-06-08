export interface AppConfig {
  port: number;
  corsOrigins: string;
  openai: {
    apiKey: string;
    model: string;
    embeddingModel: string;
  };
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  corsOrigins: process.env.CORS_ORIGINS ?? '*',
  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? '',
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    embeddingModel: process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small',
  },
});
