import { NextResponse } from "next/server";
import { reconcileCheckoutBatch, toConfirmResponse } from "@/lib/matchi-checkout";
import { findMatchiCheckoutBatch, saveMatchiCheckoutBatch } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  try {
    const { batchId } = await context.params;
    const batch = await findMatchiCheckoutBatch(String(batchId ?? "").trim());
    if (!batch) {
      return NextResponse.json({ message: "Matchi checkout hittades inte" }, { status: 404 });
    }
    const reconciled = await saveMatchiCheckoutBatch(await reconcileCheckoutBatch(batch));
    return NextResponse.json(toConfirmResponse(reconciled));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kunde inte kontrollera Matchi checkout";
    return NextResponse.json({ message }, { status: 400 });
  }
}
