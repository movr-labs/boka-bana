import { NextResponse } from "next/server";
import { readCookie, SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import type { StoredBooking } from "@/lib/matchi-types";
import { findUserById, listBookings, publicUser, saveBooking } from "@/lib/storage";

export const dynamic = "force-dynamic";

async function requireUser(request: Request) {
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  const session = verifySessionToken(token);
  if (!session) return null;
  const user = await findUserById(session.userId);
  return user ? publicUser(user) : null;
}

function isStoredBooking(value: unknown): value is StoredBooking {
  const booking = value && typeof value === "object" ? (value as Partial<StoredBooking>) : null;
  return Boolean(
    booking?.id &&
      booking.reference &&
      booking.createdAt &&
      booking.quote?.batchId &&
      booking.quote?.items?.length &&
      booking.contact?.name,
  );
}

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json({ message: "Logga in för att se dina bokningar." }, { status: 401 });
  }

  const bookings = await listBookings(user.id);
  return NextResponse.json({ user, bookings });
}

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json({ message: "Logga in för att spara bokningen." }, { status: 401 });
  }

  const body = (await request.json()) as { booking?: unknown };
  if (!isStoredBooking(body.booking)) {
    return NextResponse.json({ message: "Bokningen saknar obligatoriska fält." }, { status: 400 });
  }

  const booking = await saveBooking(user.id, body.booking);
  return NextResponse.json({ booking });
}
