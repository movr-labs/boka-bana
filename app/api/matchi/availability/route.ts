import { NextResponse } from "next/server";
import { normalizeSearchDate, isIsoDate, isPastDate } from "@/lib/date";
import { fetchMatchiAvailability } from "@/lib/matchi";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date") || normalizeSearchDate(null);
  const facilitySlug = url.searchParams.get("facility") || undefined;
  const rawQuery = url.searchParams.get("q") || "";
  const sportId = url.searchParams.get("sport") || "1";
  const offset = Number(url.searchParams.get("offset") || 0);
  const limit = Number(url.searchParams.get("limit") || 10);
  const includeCoordinates = url.searchParams.get("includeCoordinates") === "1";
  const query = includeCoordinates && !rawQuery.trim() ? "Stockholm" : rawQuery;
  const time = url.searchParams.get("time") || undefined;
  const duration = Number(url.searchParams.get("duration") || 0);

  if (!isIsoDate(date)) {
    return NextResponse.json({ message: "Invalid date" }, { status: 400 });
  }
  if (isPastDate(date)) {
    return NextResponse.json({ message: "Du kan inte söka på gamla datum." }, { status: 400 });
  }

  try {
    const payload = await fetchMatchiAvailability({
      facilitySlug,
      query,
      date,
      sportId,
      offset,
      limit,
      includeCoordinates,
      coordinateWindow:
        includeCoordinates && time
          ? {
              time,
              durationMinutes: Number.isFinite(duration) && duration > 0 ? duration : 60,
            }
          : undefined,
    });
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not fetch Matchi availability";
    const matchiStatus = Number(message.match(/Matchi request failed \((\d+)\)/)?.[1]);
    return NextResponse.json({ message }, { status: matchiStatus === 429 ? 429 : 502 });
  }
}
