import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

// Publieke health-check zonder authenticatie. Twee doelen:
//
//   1. KEEP-ALIVE. De gratis Upstash-database wordt na lange inactiviteit
//      gearchiveerd; daarna faalde de admin-login met "Unexpected end of JSON
//      input". Een dagelijkse PING (via de Vercel Cron Job in vercel.json) houdt
//      de database actief.
//   2. STATUS. Snel kunnen zien of de opslag (Redis) bereikbaar is en of de
//      LiveKit-variabelen aanwezig zijn — zonder ook maar één geheime waarde te
//      tonen (alleen booleans).
//
// Dezelfde client en variabelen als de rest van de app:
//   - Redis: new Redis({ url, token }) met UPSTASH_REDIS_REST_URL/TOKEN
//     (identiek aan getRedis() in src/lib/invites.ts).
//   - LiveKit: LIVEKIT_API_KEY, LIVEKIT_API_SECRET, NEXT_PUBLIC_LIVEKIT_URL
//     (zoals src/app/api/join en .../admin/participants).

// Nooit cachen: de cron moet élke keer echt pingen, anders houdt een gecachet
// antwoord de database niet wakker.
export const dynamic = "force-dynamic";

async function pingRedis(): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;
  try {
    const redis = new Redis({ url, token });
    return (await redis.ping()) === "PONG";
  } catch {
    // Database onbereikbaar/gearchiveerd, netwerkfout, enz. — nooit laten
    // crashen: dan zou de route een leeg antwoord geven i.p.v. geldige JSON.
    return false;
  }
}

export async function GET() {
  const redis = await pingRedis();
  // Alleen controleren DÁT ze bestaan, niet wat ze zijn.
  const livekit = Boolean(
    process.env.LIVEKIT_API_KEY &&
      process.env.LIVEKIT_API_SECRET &&
      process.env.NEXT_PUBLIC_LIVEKIT_URL,
  );

  const ok = redis && livekit;
  return NextResponse.json({ ok, checks: { redis, livekit } }, { status: ok ? 200 : 503 });
}
