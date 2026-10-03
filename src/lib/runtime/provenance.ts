export interface ProvenanceRecord {
  id: string;
  kind: "web" | "file" | "github" | "memory" | "tool" | "model";
  uri?: string;
  title?: string;
  sourceId?: string;
  retrievedAt: string;
  contentHash?: string;
  metadata?: Record<string, unknown>;
}

export function createProvenance(input: Omit<ProvenanceRecord, "id" | "retrievedAt">): ProvenanceRecord {
  return { ...input, id: crypto.randomUUID(), retrievedAt: new Date().toISOString() };
}

export function dedupeProvenance(records: ProvenanceRecord[]): ProvenanceRecord[] {
  const seen = new Set<string>();
  return records.filter((r) => {
    const key = r.uri || r.contentHash || r.sourceId || r.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
