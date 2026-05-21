import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { batchId?: string };
    const batchId = String(body.batchId ?? "").trim();
    if (!batchId.startsWith("mock_")) {
      return NextResponse.json({ message: "Invalid mock batch" }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      status: "mock_confirmed",
      batchId,
      reference: `BB-${Date.now().toString(36).toUpperCase()}`,
      confirmedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ message: "Could not confirm mock checkout" }, { status: 400 });
  }
}
