import { getLinkedGithubToken } from "@/lib/account-vault";
import { sessionEmail } from "@/lib/session";

export async function resolveGithubToken(
  req: Request,
  supplied: unknown,
): Promise<string | null> {
  if (typeof supplied === "string" && supplied.trim()) {
    return supplied.trim();
  }

  const email = sessionEmail(req);
  if (!email) return null;

  return getLinkedGithubToken(email);
}
