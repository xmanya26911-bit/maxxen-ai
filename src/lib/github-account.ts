export function resolveGithubToken(req: Request, supplied: unknown): string | null {
  void req;
  if (typeof supplied === "string" && supplied.trim()) return supplied.trim();
  return null;
}
