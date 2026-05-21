import { NextResponse } from "next/server";
import { fetchMatchiDirectorySummary, isIsoDate } from "@/lib/matchi";

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
    return NextResponse.json({ message }, { status: 502 });
  }
}
