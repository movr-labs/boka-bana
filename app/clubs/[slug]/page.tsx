import { Suspense } from "react";
import ClubPage from "@/components/club-page";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<main className="page-shell warm" />}>
      <ClubPage />
    </Suspense>
  );
}
