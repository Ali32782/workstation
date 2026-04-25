import "server-only";
import { auth } from "@/lib/auth";
import { ensureUser } from "./rocketchat";

export type ChatSessionCtx = {
  email: string;
  username: string;
  name: string;
  rcUserId: string;
};

/**
 * Resolves the current portal session into a Rocket.Chat user context,
 * lazily creating the Rocket.Chat account if it doesn't exist yet.
 */
export async function requireChatSession(): Promise<
  | { ctx: ChatSessionCtx; error?: undefined }
  | { ctx?: undefined; error: { status: number; message: string } }
> {
  const session = await auth();
  const email = session?.user?.email;
  const username = session?.user?.username ?? session?.user?.name;
  if (!email || !username) {
    return { error: { status: 401, message: "unauthenticated" } };
  }
  try {
    const rcUserId = await ensureUser({
      username,
      email,
      name: session.user?.name ?? username,
    });
    return {
      ctx: {
        email,
        username,
        name: session.user?.name ?? username,
        rcUserId,
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { error: { status: 502, message: `chat-provisioning failed: ${message}` } };
  }
}
