import { Suspense } from "react";
import MapView from "@/components/map-view";

export const dynamic = "force-dynamic";

export default function MapPage() {
  return (
    <Suspense fallback={<main className="map-page" />}>
      <MapView />
    </Suspense>
  );
}
