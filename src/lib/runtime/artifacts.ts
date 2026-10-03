import type { Artifact } from "./types";

export function createArtifact(input: Omit<Artifact, "id" | "version" | "createdAt" | "updatedAt">): Artifact {
  const now = new Date().toISOString();
  return { ...input, id: crypto.randomUUID(), version: 1, createdAt: now, updatedAt: now };
}

export function updateArtifact(previous: Artifact, patch: Partial<Artifact>): Artifact {
  return {
    ...previous,
    ...patch,
    id: previous.id,
    version: previous.version + 1,
    createdAt: previous.createdAt,
    updatedAt: new Date().toISOString(),
  };
}

export function artifactFromCode(name: string, content: string, mimeType = "text/plain", runId?: string): Artifact {
  return createArtifact({ kind: "code", name, content, mimeType, runId });
}
