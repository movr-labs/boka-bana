import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import type { MockQuote, MockQuoteItem } from "@/lib/matchi-types";
import { calculateMockPrice, isIsoDate } from "@/lib/matchi";

export const dynamic = "force-dynamic";

function isTime(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

function normalizeItem(input: unknown): MockQuoteItem {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const date = String(raw.date ?? "");
  const start = String(raw.start ?? "");
  const end = String(raw.end ?? "");
  const durationMinutes = Number(raw.durationMinutes ?? 60);
  if (!isIsoDate(date) || !isTime(start) || !isTime(end) || start >= end) {
    throw new Error("Invalid slot");
  }
  const mockPrice = Number(raw.mockPrice);
  return {
    facilitySlug: String(raw.facilitySlug ?? "kungsbackatk"),
    facilityId: String(raw.facilityId ?? "64"),
    facilityName: String(raw.facilityName ?? "Kungsbacka Tennisklubb"),
    sportId: String(raw.sportId ?? "1"),
    sportName: String(raw.sportName ?? "Tennis"),
    slotId: String(raw.slotId ?? ""),
    courtName: String(raw.courtName ?? "Bana"),
    surfaceName: raw.surfaceName ? String(raw.surfaceName) : null,
    date,
    start,
    end,
    durationMinutes: Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 60,
    bookingPath: String(raw.bookingPath ?? "/book/index"),
    bookingQuery:
      raw.bookingQuery && typeof raw.bookingQuery === "object" && !Array.isArray(raw.bookingQuery)
        ? Object.fromEntries(
            Object.entries(raw.bookingQuery as Record<string, unknown>).map(([key, value]) => [
              key,
              String(value ?? ""),
            ]),
          )
        : {},
    mockPrice:
      Number.isFinite(mockPrice) && mockPrice > 0
        ? Math.round(mockPrice)
        : calculateMockPrice(start, Number(durationMinutes) || 60),
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { item?: unknown };
    const item = normalizeItem(body.item);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const quote: MockQuote = {
      batchId: `mock_${randomUUID()}`,
      status: "quoted",
      currency: "SEK",
      totalPrice: item.mockPrice,
      methods: ["Mock card", "Klubbkredit"],
      expiresAt,
      items: [item],
      checkoutMode: "mock",
    };
    return NextResponse.json(quote);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create mock quote";
    return NextResponse.json({ message }, { status: 400 });
  }
}
