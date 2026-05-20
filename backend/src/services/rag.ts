import OpenAI from 'openai';
import { supabase } from '../db/supabase';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface DocChunk {
  topic: string;
  content: string;
  similarity: number;
}

/**
 * Retrieve the top-k most relevant Phaser 3 doc chunks for a given query.
 * Returns empty array if RAG is unavailable (no API key, empty table, etc.).
 */
export async function retrievePhaserDocs(query: string, k = 5): Promise<DocChunk[]> {
  if (!process.env.OPENAI_API_KEY) return [];

  try {
    // Embed the query
    const res = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    });
    const embedding = res.data[0].embedding;

    // pgvector similarity search via Supabase RPC
    const { data, error } = await supabase.rpc('match_phaser_docs', {
      query_embedding: embedding,
      match_count: k,
    });

    if (error) {
      console.warn('[rag] search error:', error.message);
      return [];
    }

    return (data ?? []).map((row: { topic: string; content: string; similarity: number }) => ({
      topic: row.topic,
      content: row.content,
      similarity: row.similarity,
    }));
  } catch (err) {
    console.warn('[rag] retrieval failed, skipping:', (err as Error).message);
    return [];
  }
}

/**
 * Format retrieved docs into a prompt injection block.
 */
export function formatDocsForPrompt(docs: DocChunk[]): string {
  if (docs.length === 0) return '';
  return [
    '════════════════════════════════════════',
    'RELEVANT PHASER 3 PATTERNS (use these)',
    '════════════════════════════════════════',
    ...docs.map(d => `### ${d.topic}\n${d.content}`),
  ].join('\n\n');
}
