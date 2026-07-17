import { RoomServiceClient } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";

const ROOM_NAME = process.env.ROOM_NAME || "studio";

function isAuthorized(req: NextRequest): boolean {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) return false;
  return req.headers.get("x-admin-key") === adminKey;
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

  // RoomServiceClient praat via HTTP(S), niet via de wss:// die de browser-client gebruikt.
  const httpUrl = wsUrl.replace(/^ws/, "http");
  const client = new RoomServiceClient(httpUrl, apiKey, apiSecret);

  try {
    const participants = await client.listParticipants(ROOM_NAME);
    return NextResponse.json({
      participants: participants.map((p) => ({
        identity: p.identity,
        name: p.name || p.identity,
        joinedAt: Number(p.joinedAtMs),
      })),
    });
  } catch {
    // Bijv. de kamer bestaat nog niet omdat er nog nooit iemand is
    // binnengekomen — dat betekent gewoon: niemand aanwezig.
    return NextResponse.json({ participants: [] });
  }
}
