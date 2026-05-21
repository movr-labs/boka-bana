import { NextResponse } from "next/server";
import { fetchMatchiAvailability, isIsoDate } from "@/lib/matchi";

export const dynamic = "force-dynamic";

function tomorrowISO() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date") || tomorrowISO();
  const facilitySlug = url.searchParams.get("facility") || undefined;
  const query = url.searchParams.get("q") || "";
  const sportId = url.searchParams.get("sport") || "1";
  const offset = Number(url.searchParams.get("offset") || 0);
  const limit = Number(url.searchParams.get("limit") || 10);

  if (!isIsoDate(date)) {
    return NextResponse.json({ message: "Invalid date" }, { status: 400 });
  }

  try {
    const payload = await fetchMatchiAvailability({ facilitySlug, query, date, sportId, offset, limit });
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not fetch Matchi availability";
    return NextResponse.json({ message }, { status: 502 });
  }
}
