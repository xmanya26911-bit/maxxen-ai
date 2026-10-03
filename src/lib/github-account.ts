import { getGithubTokenCookie } from "@/lib/github-token-cookie";
import { sessionEmail } from "@/lib/session";

/**
 * OAuth cookie is the authoritative GitHub credential.
 * A supplied token is only a legacy fallback when OAuth has not been connected.
 */
export async function resolveGithubToken(
  req: Request,
  supplied: unknown,
): Promise<string | null> {
  if (!sessionEmail(req)) return null;

  const cookieToken = getGithubTokenCookie(req);
  if (cookieToken) return cookieToken;

  if (typeof supplied === "string" && supplied.trim()) return supplied.trim();
  return null;
}
