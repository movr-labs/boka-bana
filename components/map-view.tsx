"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MapPin, X } from "lucide-react";
import CourtMap, { type CourtMapPoint, type CourtMapViewport } from "@/components/court-map";
import { normalizeSearchDate, todayISO, tomorrowISO } from "@/lib/date";
import type {
  AvailabilityResponse,
  MatchiAvailabilityOption,
  MatchiFacilityMapResponse,
  MatchiFacilitySummary,
} from "@/lib/matchi-types";

type SportId = "1" | "5";

type Coordinates = {
  latitude: number;
  longitude: number;
};

type FacilityBounds = CourtMapViewport["bounds"];

type BoundsRequest = {
  bounds: FacilityBounds;
  controller: AbortController;
};

const SPORT_LABELS: Record<SportId, string> = {
  "1": "Tennis",
  "5": "Padel",
};

const STOCKHOLM_INITIAL_VIEW = {
  center: { latitude: 59.3293, longitude: 18.0686 },
  zoom: 13,
};

const AUTO_SEARCH_DEBOUNCE_MS = 450;

export default function MapView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialDate = normalizeSearchDate(searchParams.get("date") || tomorrowISO());
  const initialLatitude = parseFiniteNumber(searchParams.get("lat"));
  const initialLongitude = parseFiniteNumber(searchParams.get("lng"));
  const initialCoordinates =
    initialLatitude != null && initialLongitude != null ? { latitude: initialLatitude, longitude: initialLongitude } : null;
  const initialLocation = searchParams.get("location") || (initialCoordinates ? "Min plats" : "");
  const sportId: SportId = searchParams.get("sport") === "5" ? "5" : "1";
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [selectedTime, setSelectedTime] = useState(searchParams.get("time") || "18:00");
  const [duration, setDuration] = useState(searchParams.get("duration") || "60");
  const [facilitiesByKey, setFacilitiesByKey] = useState<Map<string, MatchiFacilitySummary>>(() => new Map());
  const [availabilityData, setAvailabilityData] = useState<AvailabilityResponse | null>(null);
  const [activeFacilityRequests, setActiveFacilityRequests] = useState(0);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [facilityError, setFacilityError] = useState<string | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<CourtMapViewport | null>(null);
  const loadedBoundsRef = useRef<FacilityBounds[]>([]);
  const pendingBoundsRef = useRef<BoundsRequest[]>([]);
  const initialMapView = useMemo(
    () => initialViewForLocation(initialLocation, initialLatitude, initialLongitude),
    [initialLatitude, initialLongitude, initialLocation],
  );
  const needsInitialTextSearch = Boolean(initialLocation.trim() && !initialCoordinates && !initialMapView);
  const initialTextSearchSettledRef = useRef(!needsInitialTextSearch);
  const loadingFacilities = activeFacilityRequests > 0;
  const mapAreaLabel = initialCoordinates ? "Nära min plats" : initialLocation || "Centrala Stockholm";
  const facilities = useMemo(() => Array.from(facilitiesByKey.values()), [facilitiesByKey]);

  const mergeFacilities = useCallback((nextFacilities: MatchiFacilitySummary[]) => {
    setFacilitiesByKey((current) => {
      const next = new Map(current);
      for (const facility of nextFacilities) {
        next.set(facilityKey(facility), facility);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    for (const request of pendingBoundsRef.current) {
      request.controller.abort();
    }
    pendingBoundsRef.current = [];
    loadedBoundsRef.current = [];
    initialTextSearchSettledRef.current = !needsInitialTextSearch;
    setFacilitiesByKey(new Map());
    setSelectedId(null);
    setAvailabilityData(null);
    setFacilityError(null);
    setActiveFacilityRequests(0);
  }, [needsInitialTextSearch, selectedDate, sportId]);

  useEffect(() => {
    return () => {
      for (const request of pendingBoundsRef.current) {
        request.controller.abort();
      }
      pendingBoundsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!needsInitialTextSearch) return;

    initialTextSearchSettledRef.current = false;
    const controller = new AbortController();
    const params = new URLSearchParams({
      date: selectedDate,
      q: initialLocation,
      sport: sportId,
      offset: "0",
      limit: "20",
    });

    setActiveFacilityRequests((count) => count + 1);
    setFacilityError(null);
    fetch(`/api/matchi/facilities?${params.toString()}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(body?.message || `Kunde inte hämta klubbar (${response.status})`);
        }
        return response.json() as Promise<MatchiFacilityMapResponse>;
      })
      .then((payload) => {
        mergeFacilities(payload.facilities);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setFacilityError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        initialTextSearchSettledRef.current = true;
        setActiveFacilityRequests((count) => Math.max(0, count - 1));
      });

    return () => controller.abort();
  }, [initialLocation, mergeFacilities, needsInitialTextSearch, selectedDate, sportId]);

  useEffect(() => {
    if (!viewport) return;
    if (needsInitialTextSearch && !initialTextSearchSettledRef.current) return;

    const timer = window.setTimeout(() => {
      const targetBounds = viewport.bounds;
      const coveredBounds = [
        ...loadedBoundsRef.current,
        ...pendingBoundsRef.current.map((request) => request.bounds),
      ];
      const missingBounds = subtractCoveredBounds(targetBounds, coveredBounds);
      if (!missingBounds.length) return;

      for (const bounds of missingBounds) {
        const controller = new AbortController();
        pendingBoundsRef.current.push({ bounds, controller });
        const center = boundsCenter(bounds);
        const params = new URLSearchParams({
          date: selectedDate,
          sport: sportId,
          offset: "0",
          limit: "20",
          lat: String(center.latitude),
          lng: String(center.longitude),
          north: String(bounds.north),
          south: String(bounds.south),
          east: String(bounds.east),
          west: String(bounds.west),
        });

        setActiveFacilityRequests((count) => count + 1);
        setFacilityError(null);
        fetch(`/api/matchi/facilities?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        })
          .then(async (response) => {
            if (!response.ok) {
              const body = (await response.json().catch(() => null)) as { message?: string } | null;
              throw new Error(body?.message || `Kunde inte hämta klubbar (${response.status})`);
            }
            return response.json() as Promise<MatchiFacilityMapResponse>;
          })
          .then((payload) => {
            loadedBoundsRef.current.push(bounds);
            mergeFacilities(payload.facilities);
          })
          .catch((err) => {
            if (err instanceof DOMException && err.name === "AbortError") return;
            setFacilityError(err instanceof Error ? err.message : String(err));
          })
          .finally(() => {
            pendingBoundsRef.current = pendingBoundsRef.current.filter((request) => request.controller !== controller);
            setActiveFacilityRequests((count) => Math.max(0, count - 1));
          });
      }
    }, AUTO_SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [mergeFacilities, needsInitialTextSearch, selectedDate, sportId, viewport]);

  const selectedFacility = useMemo(() => {
    return facilities.find((facility) => facility.slug === selectedId) ?? null;
  }, [facilities, selectedId]);

  useEffect(() => {
    if (!selectedFacility) {
      setAvailabilityData(null);
      setAvailabilityError(null);
      setLoadingAvailability(false);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      facility: selectedFacility.slug,
      date: selectedDate,
      sport: sportId,
    });

    setLoadingAvailability(true);
    setAvailabilityError(null);
    fetch(`/api/matchi/availability?${params.toString()}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(body?.message || `Kunde inte hämta tider (${response.status})`);
        }
        return response.json() as Promise<AvailabilityResponse>;
      })
      .then(setAvailabilityData)
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setAvailabilityError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoadingAvailability(false));

    return () => controller.abort();
  }, [selectedDate, selectedFacility, sportId]);

  const selectedOptions = useMemo(() => {
    return (availabilityData?.options ?? []).filter((option) => matchesSelectedTime(option, selectedTime, duration));
  }, [availabilityData, duration, selectedTime]);

  const points = useMemo<CourtMapPoint[]>(() => {
    return facilities
      .map((facility) => toMapPoint(facility, selectedFacility?.slug === facility.slug ? selectedOptions : []))
      .filter((point): point is CourtMapPoint => point != null);
  }, [facilities, selectedFacility, selectedOptions]);

  const updateViewport = useCallback((nextViewport: CourtMapViewport) => {
    setViewport(nextViewport);
  }, []);

  function closeMap() {
    const params = new URLSearchParams({
      date: selectedDate,
      sport: sportId,
      offset: "0",
      time: selectedTime,
      duration,
    });
    if (initialLocation) params.set("location", initialLocation);
    if (initialCoordinates) {
      params.set("lat", String(initialCoordinates.latitude));
      params.set("lng", String(initialCoordinates.longitude));
    }
    router.push(`/search?${params.toString()}`);
  }

  return (
    <main className="map-page">
      <CourtMap
        className="map-canvas"
        loading={loadingFacilities}
        initialView={initialMapView ?? undefined}
        onSelect={(point) => setSelectedId(point.id)}
        onViewportChange={updateViewport}
        points={points}
        preserveViewOnPointsChange
        selectedId={selectedId}
        variant="full"
      />

      <div className="map-actions">
        <button className="map-action" onClick={closeMap} type="button">
          <X size={16} />
          Stäng
        </button>
      </div>

      {!selectedFacility ? (
        <div className="map-area-summary">
          <p className="eyebrow">Kartvy</p>
          <strong>{loadingFacilities ? "Hämtar klubbar" : `${points.length} klubbar`}</strong>
          <span>{mapAreaLabel}</span>
          {facilityError ? <small>{facilityError}</small> : null}
        </div>
      ) : null}

      {selectedFacility ? (
        <section className="map-results-panel" aria-label="Lediga banor">
          <button className="map-panel-close" onClick={() => setSelectedId(null)} type="button" aria-label="Stäng klubbkort">
            <X size={15} />
          </button>
          <div className="map-panel-head">
            <p className="eyebrow">Kartvy</p>
            <h1>{selectedFacility.name}</h1>
            <div className="map-panel-meta">
              <span>
                <MapPin size={14} />
                {selectedFacility.city || "Matchi"}
              </span>
              <span>{SPORT_LABELS[sportId]}</span>
            </div>
          </div>

          <div className="map-time-form">
            <label>
              <span>Datum</span>
              <input min={todayISO()} type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
            </label>
            <label>
              <span>Tid</span>
              <input type="time" value={selectedTime} onChange={(event) => setSelectedTime(event.target.value)} />
            </label>
            <label>
              <span>Längd</span>
              <select value={duration} onChange={(event) => setDuration(event.target.value)}>
                <option value="60">60 min</option>
                <option value="90">90 min</option>
                <option value="120">120 min</option>
              </select>
            </label>
          </div>

          {availabilityError ? <div className="notice error">{availabilityError}</div> : null}

          <p className="map-count">
            {loadingAvailability
              ? "Hämtar bantider"
              : selectedOptions.length
                ? `${selectedOptions.length} lediga tider`
                : "Inga lediga tider för vald tid"}
          </p>

          <div className="map-slot-list">
            {selectedOptions.slice(0, 8).map((slot) => (
              <button className="map-slot-button" key={slot.slotId} onClick={() => router.push(toBookingQuery(slot))} type="button">
                <span>{slot.start}</span>
                <strong>{slot.courtName}</strong>
                <small>{slot.mockPrice} kr</small>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function initialViewForLocation(location: string, latitude: number | null, longitude: number | null) {
  if (latitude != null && longitude != null) {
    return {
      center: { latitude, longitude },
      zoom: 13,
    };
  }
  if (!location.trim()) return STOCKHOLM_INITIAL_VIEW;
  return normalizeLocation(location).includes("stockholm") ? STOCKHOLM_INITIAL_VIEW : null;
}

function normalizeLocation(location: string) {
  return location
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseFiniteNumber(value: string | null) {
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function facilityKey(facility: MatchiFacilitySummary) {
  return `${facility.sportId}:${facility.slug}`;
}

function subtractCoveredBounds(target: FacilityBounds, coveredBounds: FacilityBounds[]) {
  if (target.west > target.east) return [target];

  let remaining = [target];
  for (const covered of coveredBounds) {
    if (covered.west > covered.east) continue;
    remaining = remaining.flatMap((bounds) => subtractBounds(bounds, covered));
    if (!remaining.length) break;
  }

  const targetArea = boundsArea(target);
  return remaining.filter((bounds) => boundsArea(bounds) > Math.max(0.00002, targetArea * 0.015));
}

function subtractBounds(target: FacilityBounds, covered: FacilityBounds): FacilityBounds[] {
  const intersection = intersectBounds(target, covered);
  if (!intersection) return [target];

  const pieces: FacilityBounds[] = [];
  if (target.north > intersection.north) {
    pieces.push({
      north: target.north,
      south: intersection.north,
      west: target.west,
      east: target.east,
    });
  }
  if (intersection.south > target.south) {
    pieces.push({
      north: intersection.south,
      south: target.south,
      west: target.west,
      east: target.east,
    });
  }
  if (target.west < intersection.west) {
    pieces.push({
      north: intersection.north,
      south: intersection.south,
      west: target.west,
      east: intersection.west,
    });
  }
  if (intersection.east < target.east) {
    pieces.push({
      north: intersection.north,
      south: intersection.south,
      west: intersection.east,
      east: target.east,
    });
  }

  return pieces.filter((bounds) => bounds.north > bounds.south && bounds.east > bounds.west);
}

function intersectBounds(left: FacilityBounds, right: FacilityBounds): FacilityBounds | null {
  const north = Math.min(left.north, right.north);
  const south = Math.max(left.south, right.south);
  const west = Math.max(left.west, right.west);
  const east = Math.min(left.east, right.east);

  if (north <= south || east <= west) return null;
  return { north, south, west, east };
}

function boundsCenter(bounds: FacilityBounds): Coordinates {
  return {
    latitude: (bounds.north + bounds.south) / 2,
    longitude: normalizeLongitude((bounds.east + bounds.west) / 2),
  };
}

function boundsArea(bounds: FacilityBounds) {
  return Math.max(0, bounds.north - bounds.south) * Math.max(0, longitudeSpan(bounds));
}

function longitudeSpan(bounds: FacilityBounds) {
  return bounds.west <= bounds.east ? bounds.east - bounds.west : 180 - bounds.west + bounds.east + 180;
}

function normalizeLongitude(longitude: number) {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

function toMapPoint(facility: MatchiFacilitySummary, options: MatchiAvailabilityOption[]): CourtMapPoint | null {
  if (facility.latitude == null || facility.longitude == null) return null;
  return {
    id: facility.slug,
    name: facility.name,
    city: facility.city,
    latitude: facility.latitude,
    longitude: facility.longitude,
    optionsCount: options.length || undefined,
    firstTime: options[0]?.start,
  };
}

function matchesSelectedTime(option: MatchiAvailabilityOption, time: string, duration: string) {
  const start = parseTimeMinutes(option.start);
  const from = parseTimeMinutes(time);
  const durationMinutes = Math.max(30, Number(duration) || 60);
  return start >= from && start < from + durationMinutes;
}

function parseTimeMinutes(value: string) {
  const match = value.match(/^(\d{1,2}):?(\d{2})?/);
  if (!match) return 0;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  return hours * 60 + minutes;
}

function toBookingQuery(option: MatchiAvailabilityOption) {
  const search = new URLSearchParams({
    facilitySlug: option.facilitySlug,
    facilityId: option.facilityId,
    facilityName: option.facilityName,
    sportId: option.sportId,
    sportName: option.sportName,
    slotId: option.slotId,
    courtName: option.courtName,
    date: option.date,
    start: option.start,
    end: option.end,
    durationMinutes: String(option.durationMinutes),
    bookingPath: option.bookingPath,
    mockPrice: String(option.mockPrice),
  });
  if (option.surfaceName) search.set("surfaceName", option.surfaceName);
  for (const [key, value] of Object.entries(option.bookingQuery ?? {})) {
    search.set(`q_${key}`, value);
  }
  return `/booking?${search.toString()}`;
}
