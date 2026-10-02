import { getUsableGithubToken, sessionEmail } from "@/lib/account-vault";

export async function resolveGithubToken(req: Request, supplied: unknown): Promise<string | null> {
  if (typeof supplied === "string" && supplied.trim()) return supplied.trim();
  const email = sessionEmail(req);
  if (!email) return null;
  return getUsableGithubToken(email);
}
