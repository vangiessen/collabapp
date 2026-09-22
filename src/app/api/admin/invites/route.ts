import { NextRequest, NextResponse } from "next/server";
import { createInvite, listInvites } from "@/lib/invites";

const DEFAULT_TTL_HOURS = Number(process.env.INVITE_TTL_HOURS) || 24;

function isAuthorized(req: NextRequest): boolean {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) return false;
  const provided = req.headers.get("x-admin-key");
  return provided === adminKey;
}

// Elke fout uit de opslaglaag (Redis niet geconfigureerd, database bestaat niet
// meer, netwerk onbereikbaar) MOET als JSON teruggegeven worden. Anders stuurt
// Next.js een leeg 500-antwoord en crasht de client op `res.json()` met de
// cryptische melding "Unexpected end of JSON input".
function storageError(context: string, e: unknown) {
  console.error(`[admin/invites] ${context}`, e);
  return NextResponse.json(
    {
      error:
        "Kan de opslag (Upstash Redis) niet bereiken. Controleer UPSTASH_REDIS_REST_URL en UPSTASH_REDIS_REST_TOKEN, en of de Upstash-database nog bestaat.",
    },
    { status: 503 },
  );
}

export async function GET(req: NextRequest) {
  if (!process.env.ADMIN_KEY) {
    return NextResponse.json(
      { error: "Server is niet geconfigureerd: ADMIN_KEY ontbreekt in .env.local." },
      { status: 500 },
    );
  }
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Onjuiste admin-sleutel." }, { status: 401 });
  }

  try {
    return NextResponse.json({ invites: await listInvites() });
  } catch (e) {
    return storageError("uitnodigingen ophalen mislukt", e);
  }
}

export async function POST(req: NextRequest) {
  if (!process.env.ADMIN_KEY) {
    return NextResponse.json(
      { error: "Server is niet geconfigureerd: ADMIN_KEY ontbreekt in .env.local." },
      { status: 500 },
    );
  }
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Onjuiste admin-sleutel." }, { status: 401 });
  }

  try {
    const invite = await createInvite(DEFAULT_TTL_HOURS);
    return NextResponse.json({ invite });
  } catch (e) {
    return storageError("link genereren mislukt", e);
  }
}
