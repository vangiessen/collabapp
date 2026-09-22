import { NextRequest, NextResponse } from "next/server";
import { revokeInvite } from "@/lib/invites";

function isAuthorized(req: NextRequest): boolean {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) return false;
  const provided = req.headers.get("x-admin-key");
  return provided === adminKey;
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

  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  if (!token) {
    return NextResponse.json({ error: "token is verplicht." }, { status: 400 });
  }

  let found: boolean;
  try {
    found = await revokeInvite(token);
  } catch (e) {
    // Zonder deze vangnet stuurt Next.js een leeg 500-antwoord en crasht de
    // client op res.json() met "Unexpected end of JSON input".
    console.error("[admin/invites/revoke] intrekken mislukt", e);
    return NextResponse.json(
      {
        error:
          "Kan de opslag (Upstash Redis) niet bereiken. Controleer UPSTASH_REDIS_REST_URL en UPSTASH_REDIS_REST_TOKEN, en of de Upstash-database nog bestaat.",
      },
      { status: 503 },
    );
  }
  if (!found) {
    return NextResponse.json({ error: "Token niet gevonden." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
