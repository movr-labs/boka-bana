"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MapPin, Search, X } from "lucide-react";
import CourtMap, { type CourtMapPoint, type CourtMapViewport } from "@/components/court-map";
import { normalizeSearchDate, todayISO, tomorrowISO } from "@/lib/date";
import type {
  AvailabilityResponse,
  MatchiAvailabilityOption,
  MatchiFacilityMapResponse,
  MatchiFacilitySummary,
} from "@/lib/matchi-types";

type SportId = "1" | "5";

type MapSearchRequest = {
  id: number;
  date: string;
  label: string;
  query?: string;
  center?: CourtMapViewport["center"];
  bounds?: CourtMapViewport["bounds"];
};

const SPORT_LABELS: Record<SportId, string> = {
  "1": "Tennis",
  "5": "Padel",
};

export default function MapView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialDate = normalizeSearchDate(searchParams.get("date") || tomorrowISO());
  const initialLocation = searchParams.get("location") || "Stockholm";
  const sportId: SportId = searchParams.get("sport") === "5" ? "5" : "1";
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [selectedTime, setSelectedTime] = useState(searchParams.get("time") || "18:00");
  const [duration, setDuration] = useState(searchParams.get("duration") || "60");
  const [facilitiesData, setFacilitiesData] = useState<MatchiFacilityMapResponse | null>(null);
  const [availabilityData, setAvailabilityData] = useState<AvailabilityResponse | null>(null);
  const [loadingFacilities, setLoadingFacilities] = useState(true);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [facilityError, setFacilityError] = useState<string | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<CourtMapViewport | null>(null);
  const [searchRequest, setSearchRequest] = useState<MapSearchRequest>(() => ({
    id: 0,
    date: initialDate,
    label: initialLocation,
    query: initialLocation,
  }));

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      date: searchRequest.date,
      sport: sportId,
      offset: "0",
      limit: "20",
    });
    if (searchRequest.query) params.set("q", searchRequest.query);
    if (searchRequest.center) {
      params.set("lat", String(searchRequest.center.latitude));
      params.set("lng", String(searchRequest.center.longitude));
    }
    if (searchRequest.bounds) {
      params.set("north", String(searchRequest.bounds.north));
      params.set("south", String(searchRequest.bounds.south));
      params.set("east", String(searchRequest.bounds.east));
      params.set("west", String(searchRequest.bounds.west));
    }

    setLoadingFacilities(true);
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
        setFacilitiesData(payload);
        setSelectedId(null);
        setAvailabilityData(null);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setFacilityError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoadingFacilities(false));

    return () => controller.abort();
  }, [searchRequest, sportId]);

  const selectedFacility = useMemo(() => {
    return (facilitiesData?.facilities ?? []).find((facility) => facility.slug === selectedId) ?? null;
  }, [facilitiesData, selectedId]);

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
    return (facilitiesData?.facilities ?? [])
      .map((facility) => toMapPoint(facility, selectedFacility?.slug === facility.slug ? selectedOptions : []))
      .filter((point): point is CourtMapPoint => point != null);
  }, [facilitiesData, selectedFacility, selectedOptions]);

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
    router.push(`/search?${params.toString()}`);
  }

  function searchVisibleArea() {
    if (!viewport) return;
    setSearchRequest({
      id: Date.now(),
      date: selectedDate,
      label: "Synligt område",
      center: viewport.center,
      bounds: viewport.bounds,
    });
  }

  return (
    <main className="map-page">
      <CourtMap
        className="map-canvas"
        loading={loadingFacilities}
        onSelect={(point) => setSelectedId(point.id)}
        onViewportChange={updateViewport}
        points={points}
        preserveViewOnPointsChange
        selectedId={selectedId}
        variant="full"
      />

      <div className="map-actions">
        <button className="map-action primary" disabled={!viewport || loadingFacilities} onClick={searchVisibleArea} type="button">
          <Search size={16} />
          Sök i området
        </button>
        <button className="map-action" onClick={closeMap} type="button">
          <X size={16} />
          Stäng
        </button>
      </div>

      {!selectedFacility ? (
        <div className="map-area-summary">
          <p className="eyebrow">Kartvy</p>
          <strong>{loadingFacilities ? "Hämtar klubbar" : `${points.length} klubbar`}</strong>
          <span>{searchRequest.label}</span>
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
