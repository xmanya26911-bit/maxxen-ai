export interface RetrievalDocument {
  id: string;
  text: string;
  title?: string;
  source?: string;
  projectId?: string;
  updatedAt?: string;
  importance?: number;
}

export interface RetrievalHit extends RetrievalDocument {
  score: number;
  matchedTerms: string[];
}

function tokens(value: string): string[] {
  return Array.from(new Set(value.toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, " ").split(/\s+/).filter((x) => x.length > 1)));
}

export function lexicalScore(query: string, doc: RetrievalDocument): RetrievalHit {
  const q = tokens(query);
  const d = new Set(tokens(doc.text + " " + (doc.title || "")));
  const matchedTerms = q.filter((t) => d.has(t));
  const coverage = q.length ? matchedTerms.length / q.length : 0;
  const importance = Math.min(1, Math.max(0, doc.importance ?? 0));
  const recency = doc.updatedAt ? Math.max(0, 1 - (Date.now() - Date.parse(doc.updatedAt)) / (1000 * 60 * 60 * 24 * 365)) : 0;
  return { ...doc, score: coverage * 0.75 + importance * 0.15 + recency * 0.10, matchedTerms };
}

export function hybridRetrieve(query: string, docs: RetrievalDocument[], limit = 8): RetrievalHit[] {
  return docs.map((d) => lexicalScore(query, d))
    .filter((h) => h.matchedTerms.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit));
}

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
