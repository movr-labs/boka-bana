import { NextResponse } from "next/server";
import { readCookie, SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById, publicUser } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  const session = verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const user = await findUserById(session.userId);
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({ user: publicUser(user) });
}
