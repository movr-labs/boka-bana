import { NextResponse } from "next/server";
import { fetchMatchiDirectorySummary, isIsoDate } from "@/lib/matchi";

export const dynamic = "force-dynamic";

const FALLBACK_CITIES = [
  { name: "Stockholm", query: "Stockholm", clubs: 38 },
  { name: "Göteborg", query: "Göteborg", clubs: 24 },
  { name: "Malmö", query: "Malmö", clubs: 19 },
  { name: "Uppsala", query: "Uppsala", clubs: 11 },
  { name: "Linköping", query: "Linköping", clubs: 9 },
  { name: "Västerås", query: "Västerås", clubs: 8 },
  { name: "Lund", query: "Lund", clubs: 7 },
  { name: "Helsingborg", query: "Helsingborg", clubs: 7 },
  { name: "Örebro", query: "Örebro", clubs: 6 },
  { name: "Umeå", query: "Umeå", clubs: 6 },
];

function fallbackDirectorySummary() {
  const bucket = {
    totalClubs: 240,
    totalCourts: 1600,
    cities: FALLBACK_CITIES,
  };
  return {
    ...bucket,
    bySport: {
      "1": bucket,
      "5": bucket,
    },
    fetchedAt: new Date().toISOString(),
  };
}

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

  if (!isIsoDate(date)) {
    return NextResponse.json({ message: "Invalid date" }, { status: 400 });
  }

  try {
    const payload = await fetchMatchiDirectorySummary({ date });
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not fetch Matchi directory";
    return NextResponse.json(
      { ...fallbackDirectorySummary(), source: "fallback", message },
      {
        headers: {
          "Cache-Control": "s-maxage=300, stale-while-revalidate=3600",
        },
      },
    );
  }
}
