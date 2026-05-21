import { Suspense } from "react";
import BookingPage from "@/components/booking-page";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<main className="page-shell" />}>
      <BookingPage />
    </Suspense>
  );
}
