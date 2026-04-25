import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { MongoClient, type Collection } from "mongodb";

const MONGO_URL =
  process.env.ROCKETCHAT_MONGO_URL ?? "mongodb://rocketchat-mongo:27017/rocketchat?replicaSet=rs0";

let clientPromise: Promise<MongoClient> | null = null;

function getClient(): Promise<MongoClient> {
  if (!clientPromise) {
    clientPromise = new MongoClient(MONGO_URL, {
      serverSelectionTimeoutMS: 5_000,
      directConnection: false,
    }).connect();
  }
  return clientPromise;
}

async function usersCol(): Promise<Collection> {
  const c = await getClient();
  return c.db("rocketchat").collection("users");
}

/**
 * Cache of (rocketchat user-id) -> raw auth token. Per-process; lost on restart,
 * which just means we generate a fresh token next time (the old hashed one stays
 * in mongo until pruned).
 *
 * We cache the *promise*, not the resolved value, so concurrent callers all wait
 * on the same in-flight write instead of each racing to insert their own token
 * (which would cause `$pull`s to clobber each other and leave most cached tokens
 * orphaned in the eyes of Rocket.Chat → 401).
 */
const tokenPromiseCache = new Map<string, Promise<string>>();

const PAT_NAME_PREFIX = "portal-";

function generateRawToken(): string {
  return randomBytes(32).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 43);
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("base64");
}

/**
 * Returns a raw auth-token usable as `X-Auth-Token` for this user.
 * Lazily provisions one as a Personal Access Token in Rocket.Chat by writing
 * directly to the users collection in MongoDB (using the same shape that
 * Rocket.Chat's own UI would use).
 *
 * This function is safe to call concurrently for the same user: only one
 * physical token is written per user per process lifetime.
 */
export async function getOrCreateUserAuthToken(rcUserId: string): Promise<string> {
  const cached = tokenPromiseCache.get(rcUserId);
  if (cached) return cached;

  const p = (async () => {
    const raw = generateRawToken();
    const hashed = hashToken(raw);
    const col = await usersCol();

    // Single atomic pipeline update: drop our stale "portal-" tokens AND
    // append the new one in one round-trip, so concurrent updates don't
    // clobber each other.
    await col.updateOne({ _id: rcUserId as unknown as never }, [
      {
        $set: {
          "services.resume.loginTokens": {
            $concatArrays: [
              {
                $filter: {
                  input: { $ifNull: ["$services.resume.loginTokens", []] },
                  as: "t",
                  cond: {
                    $not: [
                      {
                        $regexMatch: {
                          input: { $ifNull: ["$$t.name", ""] },
                          regex: `^${PAT_NAME_PREFIX}`,
                        },
                      },
                    ],
                  },
                },
              },
              [
                {
                  hashedToken: hashed,
                  when: "$$NOW",
                  type: "personalAccessToken",
                  name: `${PAT_NAME_PREFIX}${Date.now()}`,
                  bypassTwoFactor: true,
                },
              ],
            ],
          },
        },
      },
    ] as never);

    return raw;
  })();

  tokenPromiseCache.set(rcUserId, p);
  // Reset cache on failure so the next caller retries cleanly.
  p.catch(() => {
    if (tokenPromiseCache.get(rcUserId) === p) tokenPromiseCache.delete(rcUserId);
  });
  return p;
}

/**
 * Forget a cached token (e.g. after a 401) so the next call re-provisions one.
 * Used by the rcWith fetch wrapper as a self-healing retry hook.
 */
export function invalidateUserToken(rcUserId: string): void {
  tokenPromiseCache.delete(rcUserId);
}
