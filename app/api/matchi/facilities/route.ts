import { NextResponse } from "next/server";
import { normalizeSearchDate, isIsoDate, isPastDate } from "@/lib/date";
import { fetchMatchiFacilitiesForMap } from "@/lib/matchi";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date") || normalizeSearchDate(null);
  const query = url.searchParams.get("q") || "";
  const sportId = url.searchParams.get("sport") || "1";
  const offset = Number(url.searchParams.get("offset") || 0);
  const limit = Number(url.searchParams.get("limit") || 20);
  const latitude = parseFiniteNumber(url.searchParams.get("lat"));
  const longitude = parseFiniteNumber(url.searchParams.get("lng"));
  const bounds = parseBounds(url.searchParams);

  if (!isIsoDate(date)) {
    return NextResponse.json({ message: "Invalid date" }, { status: 400 });
  }
  if (isPastDate(date)) {
    return NextResponse.json({ message: "Du kan inte söka på gamla datum." }, { status: 400 });
  }

  try {
    const payload = await fetchMatchiFacilitiesForMap({
      query,
      date,
      sportId,
      latitude,
      longitude,
      bounds,
      offset,
      limit,
    });
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not fetch Matchi facilities";
    const matchiStatus = Number(message.match(/Matchi request failed \((\d+)\)/)?.[1]);
    return NextResponse.json({ message }, { status: matchiStatus === 429 ? 429 : 502 });
  }
}

function parseBounds(params: URLSearchParams) {
  const north = parseFiniteNumber(params.get("north"));
  const south = parseFiniteNumber(params.get("south"));
  const east = parseFiniteNumber(params.get("east"));
  const west = parseFiniteNumber(params.get("west"));
  if (north == null || south == null || east == null || west == null) return null;

  return {
    north,
    south,
    east,
    west,
  };
}

function parseFiniteNumber(value: string | null) {
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
