import { Suspense } from "react";
import SearchExperience from "@/components/search-experience";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <Suspense fallback={<main className="page-shell" />}>
      <SearchExperience home />
    </Suspense>
  );
}
