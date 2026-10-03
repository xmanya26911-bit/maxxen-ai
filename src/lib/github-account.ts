import { getGithubTokenCookie } from "@/lib/github-token-cookie";
import { sessionEmail } from "@/lib/session";

export async function resolveGithubToken(
  req: Request,
  supplied: unknown,
): Promise<string | null> {
  if (typeof supplied === "string" && supplied.trim()) {
    return supplied.trim();
  }

  if (!sessionEmail(req)) return null;
  return getGithubTokenCookie(req);
}
