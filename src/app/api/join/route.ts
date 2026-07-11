import { AccessToken } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";
import { consumeInvite } from "@/lib/invites";

const ROOM_NAME = process.env.ROOM_NAME || "studio";

const STATUS_MESSAGES: Record<string, string> = {
  not_found: "Deze uitnodigingslink is ongeldig, verlopen of al gebruikt.",
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (!token || !name) {
    return NextResponse.json(
      { error: "token en name zijn verplicht." },
      { status: 400 },
    );
  }

  const result = await consumeInvite(token);
  if (!result.ok) {
    return NextResponse.json(
      { error: STATUS_MESSAGES[result.status] ?? "Deze uitnodigingslink is ongeldig." },
      { status: 410 },
    );
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

  if (!apiKey || !apiSecret || !wsUrl) {
    return NextResponse.json(
      {
        error:
          "Server is niet geconfigureerd. Vul LIVEKIT_API_KEY, LIVEKIT_API_SECRET en NEXT_PUBLIC_LIVEKIT_URL in .env.local in.",
      },
      { status: 500 },
    );
  }

  // Identity moet uniek zijn per deelnemer (ook bij gelijke naam in meerdere tabbladen),
  // "name" is de weergavenaam die andere deelnemers te zien krijgen.
  const identity = `${name}-${Math.random().toString(36).slice(2, 10)}`;

  const at = new AccessToken(apiKey, apiSecret, {
    identity,
    name,
    ttl: "6h",
  });

  at.addGrant({
    room: ROOM_NAME,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const livekitToken = await at.toJwt();

  return NextResponse.json({ token: livekitToken, url: wsUrl, name });
}
