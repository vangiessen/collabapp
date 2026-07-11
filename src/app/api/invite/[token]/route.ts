import { NextRequest, NextResponse } from "next/server";
import { checkInvite } from "@/lib/invites";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const status = await checkInvite(token);
  return NextResponse.json({ valid: status === "active", status });
}
