import crypto from "node:crypto";
import { Redis } from "@upstash/redis";

// Elk token is een eigen Redis-key met een TTL: Redis ruimt verlopen tokens
// zelf op, er is geen aparte opruimstap nodig. Zodra een token gebruikt of
// ingetrokken wordt, verwijderen we de key direct (eenmalig gebruik). Omdat
// Redis een verlopen key gewoon laat verdwijnen, kunnen we achteraf niet meer
// zien of een onbekend token nooit bestond, al gebruikt was, of verlopen is
// — die gevallen worden daarom hetzelfde behandeld ("not_found").
export type Invite = {
  token: string;
  createdAt: number;
  expiresAt: number;
};

export type InviteStatus = "active" | "not_found";

const KEY_PREFIX = "invite:";

let redisClient: Redis | null = null;

function getRedis(): Redis {
  if (!redisClient) {
    redisClient = Redis.fromEnv();
  }
  return redisClient;
}

export async function createInvite(ttlHours: number): Promise<Invite> {
  const redis = getRedis();
  const token = crypto.randomBytes(32).toString("hex");
  const createdAt = Date.now();
  const ttlSeconds = Math.round(ttlHours * 60 * 60);

  await redis.set(`${KEY_PREFIX}${token}`, createdAt, { ex: ttlSeconds });

  return { token, createdAt, expiresAt: createdAt + ttlSeconds * 1000 };
}

export async function listInvites(): Promise<Invite[]> {
  const redis = getRedis();
  const keys = await redis.keys(`${KEY_PREFIX}*`);
  if (keys.length === 0) return [];

  const pipeline = redis.pipeline();
  for (const key of keys) {
    pipeline.get(key);
    pipeline.ttl(key);
  }
  const results = await pipeline.exec<Array<number | null>>();

  const invites: Invite[] = [];
  for (let i = 0; i < keys.length; i++) {
    const createdAt = results[i * 2];
    const ttl = results[i * 2 + 1];
    // ttl <= 0 betekent dat de key net verlopen is tussen `keys()` en nu.
    if (createdAt == null || ttl == null || ttl <= 0) continue;
    invites.push({
      token: keys[i].slice(KEY_PREFIX.length),
      createdAt,
      expiresAt: Date.now() + ttl * 1000,
    });
  }

  return invites.sort((a, b) => b.createdAt - a.createdAt);
}

export async function revokeInvite(token: string): Promise<boolean> {
  const redis = getRedis();
  const deleted = await redis.del(`${KEY_PREFIX}${token}`);
  return deleted > 0;
}

export async function checkInvite(token: string): Promise<InviteStatus> {
  const redis = getRedis();
  const exists = await redis.exists(`${KEY_PREFIX}${token}`);
  return exists > 0 ? "active" : "not_found";
}

// GETDEL is atomair: lezen én verwijderen gebeurt in één Redis-commando, dus
// twee gelijktijdige joins met hetzelfde token kunnen niet allebei slagen.
export async function consumeInvite(
  token: string,
): Promise<{ ok: true } | { ok: false; status: InviteStatus }> {
  const redis = getRedis();
  const value = await redis.getdel(`${KEY_PREFIX}${token}`);
  if (value == null) {
    return { ok: false, status: "not_found" };
  }
  return { ok: true };
}
