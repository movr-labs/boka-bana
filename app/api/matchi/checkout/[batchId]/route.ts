import { NextResponse } from "next/server";
import { toPublicQuote } from "@/lib/matchi-checkout";
import { findMatchiCheckoutBatch } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await context.params;
  const batch = await findMatchiCheckoutBatch(String(batchId ?? "").trim());
  if (!batch) {
    return NextResponse.json({ message: "Matchi checkout hittades inte" }, { status: 404 });
  }
  return NextResponse.json(toPublicQuote(batch));
}
