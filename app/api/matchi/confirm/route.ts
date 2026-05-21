import { NextResponse } from "next/server";
import { confirmCheckoutBatch, toConfirmResponse } from "@/lib/matchi-checkout";
import { findMatchiCheckoutBatch, saveMatchiCheckoutBatch } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { batchId?: string };
    const batchId = String(body.batchId ?? "").trim();
    if (!batchId) {
      return NextResponse.json({ message: "Batch saknas" }, { status: 400 });
    }

    const batch = await findMatchiCheckoutBatch(batchId);
    if (!batch) {
      return NextResponse.json({ message: "Matchi checkout hittades inte" }, { status: 404 });
    }

    const confirmed = await saveMatchiCheckoutBatch(await confirmCheckoutBatch(batch));
    return NextResponse.json(toConfirmResponse(confirmed));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kunde inte slutföra Matchi checkout";
    return NextResponse.json({ message }, { status: 400 });
  }
}
