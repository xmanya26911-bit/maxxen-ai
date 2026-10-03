export interface WorkspaceFile {
  path: string;
  content: string;
  sha?: string;
  size?: number;
  modifiedAt?: string;
}

const BAD_PATH = /(^|\/)\.\.?($|\/)|(^|\/)\.git($|\/)/;

export function normalizeWorkspacePath(path: string): string {
  const value = path.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!value || BAD_PATH.test(value) || value.includes("\0")) throw new Error("Unsafe workspace path.");
  const parts = value.split("/").filter(Boolean);
  if (parts.some((p) => p === "." || p === "..")) throw new Error("Unsafe workspace path.");
  return parts.join("/");
}

export function buildWorkspaceDiff(before: WorkspaceFile[], after: WorkspaceFile[]) {
  const b = new Map(before.map((f) => [f.path, f]));
  const a = new Map(after.map((f) => [f.path, f]));
  const added = after.filter((f) => !b.has(f.path)).map((f) => f.path);
  const deleted = before.filter((f) => !a.has(f.path)).map((f) => f.path);
  const modified = after.filter((f) => b.has(f.path) && b.get(f.path)!.content !== f.content).map((f) => f.path);
  return { added, modified, deleted };
}
