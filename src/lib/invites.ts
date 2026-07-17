import crypto from "node:crypto";
import { Redis } from "@upstash/redis";

// Elk token is een Redis-hash met een TTL: Redis ruimt verlopen tokens zelf
// op. Anders dan eerst wordt een gebruikt token NIET meteen verwijderd —
// het blijft (tot de oorspronkelijke vervaltijd) zichtbaar in de admin-lijst
// met wie 'm heeft gebruikt, zodat daar een live online/offline-indicator
// aan gekoppeld kan worden. Intrekken/verwijderen kan altijd handmatig.
export type Invite = {
  token: string;
  createdAt: number;
  expiresAt: number;
  usedByIdentity: string | null;
  usedByName: string | null;
  usedAt: number | null;
};

type StoredFields = {
  createdAt?: number;
  usedByIdentity?: string;
  usedByName?: string;
  usedAt?: number;
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
  const key = `${KEY_PREFIX}${token}`;

  await redis.hset(key, { createdAt });
  await redis.expire(key, ttlSeconds);

  return {
    token,
    createdAt,
    expiresAt: createdAt + ttlSeconds * 1000,
    usedByIdentity: null,
    usedByName: null,
    usedAt: null,
  };
}

export async function listInvites(): Promise<Invite[]> {
  const redis = getRedis();
  const keys = await redis.keys(`${KEY_PREFIX}*`);
  if (keys.length === 0) return [];

  // Filtert (en ruimt op) keys uit een ouder opslagformaat (platte string in
  // plaats van hash) — anders crasht hgetall erop met een WRONGTYPE-fout.
  const typePipeline = redis.pipeline();
  for (const key of keys) {
    typePipeline.type(key);
  }
  const types = await typePipeline.exec<string[]>();

  const hashKeys: string[] = [];
  const legacyKeys: string[] = [];
  keys.forEach((key, i) => {
    if (types[i] === "hash") {
      hashKeys.push(key);
    } else {
      legacyKeys.push(key);
    }
  });

  if (legacyKeys.length > 0) {
    await Promise.all(legacyKeys.map((key) => redis.del(key)));
  }

  if (hashKeys.length === 0) return [];

  const pipeline = redis.pipeline();
  for (const key of hashKeys) {
    pipeline.hgetall(key);
    pipeline.ttl(key);
  }
  const results = await pipeline.exec<Array<StoredFields | null | number>>();

  const invites: Invite[] = [];
  for (let i = 0; i < hashKeys.length; i++) {
    const fields = results[i * 2] as StoredFields | null;
    const ttl = results[i * 2 + 1] as number | null;
    // ttl <= 0 betekent dat de key net verlopen is tussen `keys()` en nu.
    if (fields == null || fields.createdAt == null || ttl == null || ttl <= 0) continue;
    invites.push({
      token: hashKeys[i].slice(KEY_PREFIX.length),
      createdAt: Number(fields.createdAt),
      expiresAt: Date.now() + ttl * 1000,
      usedByIdentity: fields.usedByIdentity ?? null,
      usedByName: fields.usedByName ?? null,
      usedAt: fields.usedAt != null ? Number(fields.usedAt) : null,
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
  const key = `${KEY_PREFIX}${token}`;
  try {
    const fields = await redis.hgetall<StoredFields>(key);
    if (!fields || fields.createdAt == null || fields.usedByIdentity) {
      return "not_found";
    }
    return "active";
  } catch {
    // Key uit een ouder opslagformaat (geen hash) — nooit geldig, opruimen.
    await redis.del(key);
    return "not_found";
  }
}

// hsetnx claimt het gebruik atomair op één specifiek veld: van twee
// gelijktijdige pogingen met hetzelfde token wint er maar één (krijgt 1
// terug), de ander krijgt 0 en wordt afgewezen.
export async function consumeInvite(
  token: string,
  identity: string,
  name: string,
): Promise<{ ok: true } | { ok: false; status: InviteStatus }> {
  const redis = getRedis();
  const key = `${KEY_PREFIX}${token}`;

  let claimed: 0 | 1;
  try {
    claimed = await redis.hsetnx(key, "usedByIdentity", identity);
  } catch {
    // Key uit een ouder opslagformaat (geen hash) — nooit geldig, opruimen.
    await redis.del(key);
    return { ok: false, status: "not_found" };
  }
  if (claimed !== 1) {
    return { ok: false, status: "not_found" };
  }

  const ttl = await redis.ttl(key);
  if (ttl == null || ttl <= 0) {
    // Randgeval: de key bestond niet (meer) en hsetnx heeft 'm net als
    // "phantom" hash zonder TTL aangemaakt — meteen weer opruimen.
    await redis.del(key);
    return { ok: false, status: "not_found" };
  }

  await redis.hset(key, { usedByName: name, usedAt: Date.now() });
  return { ok: true };
}
