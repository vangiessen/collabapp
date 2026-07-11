import { NextRequest, NextResponse } from "next/server";
import { createInvite, listInvites } from "@/lib/invites";

const DEFAULT_TTL_HOURS = Number(process.env.INVITE_TTL_HOURS) || 24;

function isAuthorized(req: NextRequest): boolean {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) return false;
  const provided = req.headers.get("x-admin-key");
  return provided === adminKey;
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

  return NextResponse.json({ invites: await listInvites() });
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

  const invite = await createInvite(DEFAULT_TTL_HOURS);
  return NextResponse.json({ invite });
}
