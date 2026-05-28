"use client";

import { useEffect, useMemo, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock3,
  MapPin,
  MapPinned,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import BokaNav from "@/components/boka-nav";
import CourtMap, { type CourtMapPoint } from "@/components/court-map";
import { isIsoDate, normalizeSearchDate, todayISO, tomorrowISO } from "@/lib/date";
import type { AvailabilityResponse, MatchiAvailabilityOption, MatchiFacilitySummary } from "@/lib/matchi-types";
import { FEATURED_TENNIS_EVENTS } from "@/lib/tennis-events";

type Filters = {
  surface: string;
  timeFrom: string;
  timeTo: string;
};

type SportId = "1" | "5";

type Coordinates = {
  latitude: number;
  longitude: number;
};

type FacilityCard = {
  facility: MatchiFacilitySummary;
  options: MatchiAvailabilityOption[];
};

type DirectoryCitySummary = {
  name: string;
  clubs: number;
  query: string;
};

type DirectoryBucket = {
  totalClubs: number;
  totalCourts: number | null;
  cities: DirectoryCitySummary[];
};

type DirectorySummary = DirectoryBucket & {
  bySport?: Record<string, DirectoryBucket>;
  fetchedAt: string;
};

const DEFAULT_FILTERS: Filters = {
  surface: "any",
  timeFrom: "06",
  timeTo: "22",
};

const PAGE_SIZE = 10;

const SPORT_LABELS: Record<SportId, string> = {
  "1": "Tennis",
  "5": "Padel",
};

const FALLBACK_CITIES: DirectoryCitySummary[] = [
  { name: "Stockholm", query: "Stockholm", clubs: 38 },
  { name: "Göteborg", query: "Göteborg", clubs: 24 },
  { name: "Malmö", query: "Malmö", clubs: 19 },
  { name: "Uppsala", query: "Uppsala", clubs: 11 },
  { name: "Linköping", query: "Linköping", clubs: 9 },
  { name: "Västerås", query: "Västerås", clubs: 8 },
  { name: "Lund", query: "Lund", clubs: 7 },
  { name: "Helsingborg", query: "Helsingborg", clubs: 7 },
  { name: "Örebro", query: "Örebro", clubs: 6 },
  { name: "Umeå", query: "Umeå", clubs: 6 },
];

const FALLBACK_DIRECTORY: DirectoryBucket = {
  totalClubs: 240,
  totalCourts: 1600,
  cities: FALLBACK_CITIES,
};

const CITY_COORDINATES: Record<string, { latitude: number; longitude: number }> = {
  Stockholm: { latitude: 59.3293, longitude: 18.0686 },
  Göteborg: { latitude: 57.7089, longitude: 11.9746 },
  Malmö: { latitude: 55.605, longitude: 13.0038 },
  Uppsala: { latitude: 59.8586, longitude: 17.6389 },
  Linköping: { latitude: 58.4108, longitude: 15.6214 },
  Västerås: { latitude: 59.6099, longitude: 16.5448 },
  Lund: { latitude: 55.7047, longitude: 13.191 },
  Helsingborg: { latitude: 56.0465, longitude: 12.6945 },
  Örebro: { latitude: 59.2753, longitude: 15.2134 },
  Umeå: { latitude: 63.8258, longitude: 20.263 },
};

const FEATURED_CLUBS = [
  {
    name: "Kungsbacka Tennisklubb",
    city: "Kungsbacka",
    meta: "Tennis · Matchi",
    searchQuery: "Kungsbacka Tennisklubb",
    images: [
      "/featured-clubs/kungsbacka-1.jpeg",
      "/featured-clubs/kungsbacka-2.jpeg",
      "/featured-clubs/kungsbacka-3.jpeg",
    ],
    description: "En klassisk tennisklubb med både inomhusbanor och grusbanor nära Kungsmässan.",
  },
  {
    name: "Gustavsbergs Tennisklubb",
    city: "Gustavsberg",
    meta: "Tennis · Värmdö",
    searchQuery: "Gustavsbergs Tennisklubb",
    images: [
      "/featured-clubs/gustavsbergs-1.png",
      "/featured-clubs/gustavsbergs-2.png",
      "/featured-clubs/gustavsbergs-3.png",
    ],
    description: "En av Värmdös stora tennisklubbar med inomhusbanor på Ekvallens idrottsområde.",
  },
  {
    name: "Ekerö Tennisklubb",
    city: "Ekerö",
    meta: "Tennis · Ekebyhovshallen",
    searchQuery: "Ekerö Tennisklubb",
    images: [
      "/featured-clubs/ekero-1.jpeg",
      "/featured-clubs/ekero-2.jpeg",
      "/featured-clubs/ekero-3.jpg",
    ],
    description: "En aktiv klubb i Ekebyhovshallen med tennis, pickleball, squash och juniorverksamhet.",
  },
];

function formatDateLong(iso: string) {
  if (!isIsoDate(iso)) return "valt datum";
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "valt datum";
  return new Intl.DateTimeFormat("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

function formatCount(value: number | null | undefined) {
  if (value == null) return "-";
  return new Intl.NumberFormat("sv-SE").format(value);
}

function directoryForSport(summary: DirectorySummary | null, sportId: SportId) {
  return summary?.bySport?.[sportId] ?? summary ?? FALLBACK_DIRECTORY;
}

function mapPointsForDirectory(directory: DirectoryBucket): CourtMapPoint[] {
  return directory.cities
    .flatMap((city) => {
      const coordinates = CITY_COORDINATES[city.name];
      if (!coordinates) return [];
      return [
        {
          id: city.name,
          name: city.name,
          city: `${formatCount(city.clubs)} klubbar`,
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          optionsCount: city.clubs,
        },
      ];
    })
    .slice(0, 7);
}

function mapPointsForSearchPreview(query: string, fallbackPoints: CourtMapPoint[]) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return fallbackPoints;

  const cityName = Object.keys(CITY_COORDINATES).find((name) => {
    const normalizedName = name.toLowerCase();
    return normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName);
  });
  if (!cityName) return fallbackPoints;

  const coordinates = CITY_COORDINATES[cityName];
  return [
    {
      id: cityName,
      name: cityName,
      city: "Sökområde",
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    },
  ];
}

function clubImageBackground(imageUrl: string | null) {
  const url =
    imageUrl ||
    "https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=900&q=80&auto=format&fit=crop";
  return `linear-gradient(180deg, rgba(26, 77, 58, 0.05), rgba(26, 77, 58, 0.2)), url("${url}")`;
}

function matchesWindow(option: MatchiAvailabilityOption, filters: Filters) {
  const hour = option.start.slice(0, 2);
  return hour >= filters.timeFrom && hour <= filters.timeTo;
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

function toClubQuery(facility: MatchiFacilitySummary, date: string) {
  const search = new URLSearchParams({
    date,
    sport: facility.sportId,
  });
  return `/clubs/${encodeURIComponent(facility.slug)}?${search.toString()}`;
}

function filtersFromSearchParams(params: Pick<URLSearchParams, "get">): Filters {
  const filters = { ...DEFAULT_FILTERS };
  const time = params.get("time") || params.get("timeFrom");
  const durationMinutes = Number(params.get("duration") || 0);
  const hourMatch = time?.match(/^(\d{2})/);
  const hour = hourMatch ? Number(hourMatch[1]) : null;

  if (hour != null && Number.isFinite(hour) && hour >= 5 && hour <= 23) {
    filters.timeFrom = String(hour).padStart(2, "0");
    if (durationMinutes > 0) {
      filters.timeTo = String(Math.min(23, hour + Math.max(1, Math.ceil(durationMinutes / 60)))).padStart(2, "0");
    }
  }

  return filters;
}

export default function SearchExperience({ home = false }: { home?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialDate = searchParams.get("date");
  const initialLatitude = parseFiniteNumber(searchParams.get("lat"));
  const initialLongitude = parseFiniteNumber(searchParams.get("lng"));
  const initialCoordinates =
    initialLatitude != null && initialLongitude != null ? { latitude: initialLatitude, longitude: initialLongitude } : null;
  const initialLocationLabel = searchParams.get("location") || (initialCoordinates ? "Min plats" : "");
  const [date, setDate] = useState(initialDate ? normalizeSearchDate(initialDate) : tomorrowISO());
  const [location, setLocation] = useState(initialLocationLabel);
  const [submittedQuery, setSubmittedQuery] = useState(initialLocationLabel);
  const [userCoordinates, setUserCoordinates] = useState<Coordinates | null>(initialCoordinates);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [sportId, setSportId] = useState<SportId>(searchParams.get("sport") === "5" ? "5" : "1");
  const [time, setTime] = useState(searchParams.get("time") || "18:00");
  const [duration, setDuration] = useState(searchParams.get("duration") || "60");
  const [offset, setOffset] = useState(Number(searchParams.get("offset") || 0));
  const [filters, setFilters] = useState<Filters>(() => filtersFromSearchParams(searchParams));
  const [data, setData] = useState<AvailabilityResponse | null>(null);
  const [directorySummary, setDirectorySummary] = useState<DirectorySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const coordinateKey = userCoordinates ? `${userCoordinates.latitude.toFixed(6)}:${userCoordinates.longitude.toFixed(6)}` : "";

  useEffect(() => {
    if (home) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      date,
      q: userCoordinates ? "" : submittedQuery,
      sport: sportId,
      offset: String(offset),
      limit: String(PAGE_SIZE),
    });
    if (userCoordinates) {
      params.set("lat", String(userCoordinates.latitude));
      params.set("lng", String(userCoordinates.longitude));
    }
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
      .then(setData)
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [coordinateKey, date, home, offset, sportId, submittedQuery, userCoordinates]);

  useEffect(() => {
    if (!home) return;

    const controller = new AbortController();
    const params = new URLSearchParams({ date });
    fetch(`/api/matchi/directory?${params.toString()}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Kunde inte hämta katalog (${response.status})`);
        return response.json() as Promise<DirectorySummary>;
      })
      .then(setDirectorySummary)
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
      });

    return () => controller.abort();
  }, [date, home]);

  const filteredOptions = useMemo(() => {
    if (!data) return [];
    return data.options.filter((option) => {
      if (filters.surface !== "any") {
        const surface = (option.surfaceName ?? "").toLowerCase();
        if (!surface.includes(filters.surface)) return false;
      }
      return matchesWindow(option, filters);
    });
  }, [data, filters]);

  const facilityCards = useMemo<FacilityCard[]>(() => {
    if (!data) return [];
    return data.facilities.map((facility) => ({
      facility,
      options: filteredOptions.filter((option) => option.facilitySlug === facility.slug),
    }));
  }, [data, filteredOptions]);
  const totalResults = data?.totalResults ?? 0;
  const pageStart = totalResults && data ? data.offset + 1 : 0;
  const pageEnd = data ? Math.min(data.offset + data.facilities.length, totalResults) : 0;
  const canPageBack = Boolean(data && data.offset > 0);
  const canPageForward = Boolean(data && data.offset + data.limit < totalResults);
  const directory = useMemo(() => directoryForSport(directorySummary, sportId), [directorySummary, sportId]);
  const landingMapPoints = useMemo(() => mapPointsForDirectory(directory), [directory]);
  const searchMapPreviewPoints = useMemo(
    () => mapPointsForSearchPreview(location || submittedQuery, landingMapPoints),
    [landingMapPoints, location, submittedQuery],
  );

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function submitSearch(event?: FormEvent<HTMLFormElement> | MouseEvent<HTMLButtonElement>) {
    event?.preventDefault();
    setSubmittedQuery(location.trim());
    setOffset(0);
    router.push(buildSearchUrl({ nextOffset: 0, nextQuery: location.trim() }));
  }

  function updateSport(nextSportId: SportId) {
    setSportId(nextSportId);
    setOffset(0);
    if (!home) {
      router.push(buildSearchUrl({ nextOffset: 0, nextSportId }));
    }
  }

  function updateDate(nextDate: string) {
    const normalizedDate = normalizeSearchDate(nextDate);
    setDate(normalizedDate);
    setOffset(0);
    if (!home) {
      router.push(buildSearchUrl({ nextDate: normalizedDate, nextOffset: 0 }));
    }
  }

  function goToOffset(nextOffset: number) {
    const normalized = Math.max(0, nextOffset);
    setOffset(normalized);
    router.push(buildSearchUrl({ nextOffset: normalized, nextQuery: submittedQuery }));
  }

  function buildSearchUrl(input: {
    nextDate?: string;
    nextDuration?: string;
    nextOffset?: number;
    nextQuery?: string;
    nextCoordinates?: Coordinates | null;
    nextSportId?: SportId;
    nextTime?: string;
  }) {
    const params = new URLSearchParams({
      date: input.nextDate ?? date,
      sport: input.nextSportId ?? sportId,
      offset: String(input.nextOffset ?? offset),
    });
    params.set("time", input.nextTime ?? time);
    params.set("duration", input.nextDuration ?? duration);
    const nextCoordinates = input.nextCoordinates === undefined ? userCoordinates : input.nextCoordinates;
    const query = input.nextQuery ?? submittedQuery;
    if (query) params.set("location", query);
    if (nextCoordinates) {
      params.set("lat", String(nextCoordinates.latitude));
      params.set("lng", String(nextCoordinates.longitude));
    }
    return `/search?${params.toString()}`;
  }

  function searchForQuery(query: string) {
    const nextQuery = query.trim();
    setUserCoordinates(null);
    setLocationError(null);
    setLocation(nextQuery);
    setSubmittedQuery(nextQuery);
    setOffset(0);
    router.push(buildSearchUrl({ nextCoordinates: null, nextOffset: 0, nextQuery }));
  }

  function updateLocationInput(nextLocation: string) {
    setLocation(nextLocation);
    if (userCoordinates) {
      setUserCoordinates(null);
    }
    if (locationError) {
      setLocationError(null);
    }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationError("Din webbläsare stödjer inte platsdelning.");
      return;
    }

    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextCoordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setUserCoordinates(nextCoordinates);
        setLocation("Min plats");
        setSubmittedQuery("Min plats");
        setOffset(0);
        setLocating(false);
        router.push(buildSearchUrl({ nextCoordinates, nextOffset: 0, nextQuery: "Min plats" }));
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? "Platsåtkomst nekades."
            : error.code === error.TIMEOUT
              ? "Det tog för lång tid att hämta din plats."
              : "Kunde inte hämta din plats.";
        setLocationError(message);
        setLocating(false);
      },
      {
        enableHighAccuracy: false,
        maximumAge: 60_000,
        timeout: 10_000,
      },
    );
  }

  function openMapView() {
    const params = new URLSearchParams({
      date,
      sport: sportId,
      time,
      duration,
      autoSearch: "1",
    });
    const query = location.trim() || submittedQuery;
    if (query) params.set("location", query);
    if (userCoordinates) {
      params.set("lat", String(userCoordinates.latitude));
      params.set("lng", String(userCoordinates.longitude));
    }
    router.push(`/map?${params.toString()}`);
  }

  if (home) {
    return (
      <main className="page-shell landing-page">
        <section className="landing-hero">
          <div className="landing-hero-photo" />
          <div className="landing-hero-shade" />

          <div className="container landing-nav-wrap">
            <BokaNav current="home" variant="on-dark" />
          </div>

          <div className="container landing-search-wrap">
            <form className="landing-search-panel" onSubmit={submitSearch}>
              <div className="landing-search-top">
                <div className="sport-toggle" aria-label="Sport">
                  <button
                    className={sportId === "1" ? "selected" : ""}
                    onClick={() => updateSport("1")}
                    type="button"
                  >
                    Tennis
                  </button>
                  <button
                    className={sportId === "5" ? "selected" : ""}
                    onClick={() => updateSport("5")}
                    type="button"
                  >
                    Padel
                  </button>
                </div>
              </div>

              <div className="landing-search-grid" role="search">
                <LocationField
                  locating={locating}
                  locationError={locationError}
                  onChange={updateLocationInput}
                  onUseCurrentLocation={useCurrentLocation}
                  placeholder="Stad eller klubbnamn"
                  value={location}
                  variant="landing"
                />
                <LandingField label="Datum" icon={<Calendar size={18} />}>
                  <input min={todayISO()} type="date" value={date} onChange={(event) => updateDate(event.target.value)} />
                </LandingField>
                <LandingField label="Tid" icon={<Clock3 size={18} />}>
                  <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
                </LandingField>
                <LandingField label="Längd" icon={<CircleDot size={18} />}>
                  <select value={duration} onChange={(event) => setDuration(event.target.value)}>
                    <option value="60">60 min</option>
                    <option value="90">90 min</option>
                    <option value="120">120 min</option>
                  </select>
                </LandingField>
                <button className="btn dark landing-search-button" type="submit">
                  <Search size={16} />
                  Sök
                </button>
              </div>

              <div className="landing-map-teaser">
                <CourtMap points={landingMapPoints} variant="preview" />
                <div className="landing-map-overlay">
                  <div>
                    <p className="eyebrow">Kartvy</p>
                    <strong>Lediga banor nära vald tid</strong>
                  </div>
                  <button className="btn small" onClick={openMapView} type="button">
                    <MapPinned size={16} />
                    Visa kartan
                  </button>
                </div>
              </div>
            </form>
          </div>

          <div className="container landing-hero-copy">
            <p className="eyebrow light">
              {SPORT_LABELS[sportId]} · {formatCount(directory.totalClubs)} klubbar ·{" "}
              {formatCount(directory.totalCourts)} banor
            </p>
            <h1>
              Banan väntar.
              <br />
              <em>Boka på två minuter.</em>
            </h1>
            <p>
              En samlad plats för bokning av tennis- och padelbanor i hela landet med klubbarnas
              riktiga priser och kalendrar.
            </p>
          </div>
        </section>

        <section className="landing-section">
          <div className="container">
            <div className="landing-section-head">
              <div>
                <p className="eyebrow">Utvalda klubbar</p>
                <h2>Anrika anläggningar &amp; nya favoriter</h2>
              </div>
              <button className="btn ghost small" type="button" onClick={() => searchForQuery("")}>
                Se alla klubbar
              </button>
            </div>

            <div className="featured-grid">
              {FEATURED_CLUBS.map((club) => (
                <FeaturedClubCard
                  club={club}
                  key={club.name}
                  onSearch={() => searchForQuery(club.searchQuery)}
                />
              ))}
            </div>
          </div>
        </section>

        <section className="landing-section city-section">
          <div className="container">
            <div className="landing-section-head compact">
              <div>
                <p className="eyebrow">Spela i</p>
                <h2>Hela Sverige, en katalog</h2>
              </div>
            </div>

            <div className="city-grid">
              {directory.cities.map((city) => (
                <button className="city-button" key={city.name} onClick={() => searchForQuery(city.query)} type="button">
                  <span>{city.name}</span>
                  <small>{formatCount(city.clubs)} klubbar</small>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-section about-section">
          <div className="container about-grid">
            <div className="about-image">
              <div className="about-stamp">
                <p className="eyebrow light">Sedan 2024</p>
                <strong>Klubbarna äger sina tider - vi är logistiken.</strong>
              </div>
            </div>

            <div className="about-copy">
              <p className="eyebrow">Om Bokabana</p>
              <h2>
                En samlad bokning,
                <br />
                <em>byggd kring klubbarna.</em>
              </h2>
              <p>
                Bokabana är inte en marknadsplats. Det är klubbarnas eget bokningssystem,
                tillgängligt under ett tak. Du ser klubbens egna priser och regler utan påslag,
                utan mellanhand.
              </p>
              <div className="about-stats">
                <div>
                  <strong>{formatCount(directory.totalClubs)}</strong>
                  <span>Klubbar</span>
                </div>
                <div>
                  <strong>{formatCount(directory.totalCourts)}</strong>
                  <span>Banor</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-section tournament-section">
          <div className="container">
            <div className="landing-section-head">
              <div>
                <p className="eyebrow light">Sommarsäsongen 2026</p>
                <h2>Tävlingar &amp; serier</h2>
              </div>
              <Link className="btn ghost-light small" href="/tavlingar">
                Hela kalendern
              </Link>
            </div>

            <div className="tournament-list">
              {FEATURED_TENNIS_EVENTS.map((event, index) => (
                <div className="tournament-row" key={event.id}>
                  <span className="eyebrow light">{String(index + 1).padStart(2, "0")}</span>
                  <strong>{event.title}</strong>
                  <span>{event.dateLabel}</span>
                  <span>
                    <small>{event.category}</small>
                    {event.location}
                  </span>
                  <a className="btn ghost-light small" href={event.href} rel="noreferrer" target="_blank">
                    <ArrowUpRight size={15} />
                    Tennis.se
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer className="landing-footer">
          <div className="container">
            <div>
              <Image src="/bb-logo.png?v=20260528" alt="Bokabana" className="footer-logo" width={153} height={102} />
              <span>Sveriges samlade plats för tennis- och padelbokningar.</span>
            </div>
            <a href="https://movrlabs.io" rel="noreferrer" target="_blank">
              Created by Movr Labs
            </a>
          </div>
        </footer>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <BokaNav current="search" />

      {home ? (
        <section className="hero-search">
          <div className="hero-photo" />
          <div className="hero-content container">
            <p className="eyebrow light">Tennis & padel</p>
            <h1>Lediga banor, samma dag.</h1>
            <div className="hero-panel" role="search">
              <LocationField
                locating={locating}
                locationError={locationError}
                onChange={updateLocationInput}
                onUseCurrentLocation={useCurrentLocation}
                placeholder="Sök klubb eller stad"
                value={location}
                variant="inline"
              />
              <div className="field compact">
                <Calendar size={18} />
                <input min={todayISO()} type="date" value={date} onChange={(event) => updateDate(event.target.value)} />
              </div>
              <button className="btn dark" onClick={submitSearch}>
                <Search size={16} />
                Sök
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="compact-search">
          <div className="container search-row">
            <div className="sport-toggle" aria-label="Sport">
              <button className={sportId === "1" ? "selected" : ""} onClick={() => updateSport("1")} type="button">
                Tennis
              </button>
              <button className={sportId === "5" ? "selected" : ""} onClick={() => updateSport("5")} type="button">
                Padel
              </button>
            </div>
            <div className="search-box">
              <LocationField
                locating={locating}
                locationError={locationError}
                onChange={updateLocationInput}
                onUseCurrentLocation={useCurrentLocation}
                placeholder="Sök klubb eller stad"
                value={location}
                variant="inline"
              />
              <div className="field compact">
                <Calendar size={17} />
                <input min={todayISO()} type="date" value={date} onChange={(event) => updateDate(event.target.value)} />
              </div>
            </div>
            <button className="btn small" onClick={submitSearch}>
              Sök igen
            </button>
          </div>
        </section>
      )}

      <section className="container results-wrap">
        <aside className="filters">
          <section className="map-filter-card" aria-label="Kartvy">
            <div className="map-filter-map">
              <CourtMap points={searchMapPreviewPoints} variant="preview" />
            </div>
            <span className="map-filter-body">
              <span className="eyebrow">Kartvy</span>
              <strong>Se klubbarna på kartan</strong>
              <small>{location.trim() || submittedQuery || "Valt område"}</small>
            </span>
            <button className="map-filter-action" onClick={openMapView} type="button">
              <MapPinned size={15} />
              Öppna
            </button>
          </section>
          <div className="eyebrow">Förfina</div>
          <FilterBlock title="Underlag">
            <RadioOption label="Alla" active={filters.surface === "any"} onClick={() => updateFilter("surface", "any")} />
            <RadioOption label="Hard court" active={filters.surface === "hard"} onClick={() => updateFilter("surface", "hard")} />
            <RadioOption label="Grus" active={filters.surface === "clay"} onClick={() => updateFilter("surface", "clay")} />
          </FilterBlock>
          <FilterBlock title="Tidsfönster">
            <div className="time-selects">
              <Clock3 size={15} />
              <select value={filters.timeFrom} onChange={(event) => updateFilter("timeFrom", event.target.value)}>
                {Array.from({ length: 18 }, (_, index) => index + 5).map((hour) => (
                  <option key={hour} value={String(hour).padStart(2, "0")}>
                    {String(hour).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
              <span>-</span>
              <select value={filters.timeTo} onChange={(event) => updateFilter("timeTo", event.target.value)}>
                {Array.from({ length: 18 }, (_, index) => index + 6).map((hour) => (
                  <option key={hour} value={String(hour).padStart(2, "0")}>
                    {String(hour).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </div>
          </FilterBlock>
        </aside>

        <div className="results">
          <div className="results-head">
            <div>
              <h2>
                {loading
                  ? "Hämtar lediga tider"
                  : `${pageStart ? `${pageStart}-${pageEnd} av ${totalResults}` : "0"} klubbar · ${formatDateLong(date)}`}
              </h2>
              <p>
                {data
                  ? `${SPORT_LABELS[sportId]} från Matchi${submittedQuery ? ` · ${submittedQuery}` : ""}`
                  : "Matchi-anslutna tider"}
              </p>
            </div>
            <div className="sort-pill">
              <SlidersHorizontal size={14} />
              Sida {data ? Math.floor(data.offset / data.limit) + 1 : 1}
            </div>
          </div>

          {error ? <div className="notice error">{error}</div> : null}

          {loading ? (
            <div className="result-card loading-card">
              <div className="skeleton image" />
              <div className="loading-lines">
                <span />
                <span />
                <span />
              </div>
            </div>
          ) : facilityCards.length > 0 ? (
            <>
              <div className="result-stack">
                {facilityCards.map(({ facility, options }) => {
                  const facilityCourtCount = new Set(options.map((slot) => slot.courtName)).size;
                  const clubUrl = toClubQuery(facility, date);
                  return (
                    <article className="result-card" key={`${facility.sportId}:${facility.slug}`}>
                      <button
                        className="club-image"
                        onClick={() => router.push(clubUrl)}
                        aria-label={facility.name}
                        style={{ backgroundImage: clubImageBackground(facility.imageUrl) }}
                      />
                      <div className="club-body">
                        <div className="club-top">
                          <div>
                            <p className="eyebrow">
                              {facility.city || "Matchi"} · Matchi · {facility.facilityId}
                            </p>
                            <button className="club-title-button" onClick={() => router.push(clubUrl)} type="button">
                              <h3>{facility.name}</h3>
                            </button>
                            <div className="chips">
                              <span className="chip"><span />{facility.sportName.toLowerCase()}</span>
                              <span className="chip">Matchi</span>
                              <span className="chip">
                                {facility.bookableCourts ?? facilityCourtCount} bokningsbara banor
                              </span>
                            </div>
                          </div>
                          <div className="price-block">
                            <span>Pris</span>
                            <strong>Matchi</strong>
                            <small>{options.length} tider</small>
                          </div>
                        </div>

                        <div className="slots-strip">
                          <div className="slots-head">
                            <span>Lediga tider</span>
                            {options.length ? <button onClick={() => router.push(clubUrl)} type="button">Se banorna</button> : null}
                          </div>
                          {options.length ? (
                            <div className="slots">
                              {options.slice(0, 10).map((slot) => (
                                <button key={slot.slotId} className="slot-button" onClick={() => router.push(toBookingQuery(slot))}>
                                  <span>{slot.start}</span>
                                  <small>Hämta pris</small>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="no-slots">Inga lediga tider i valt filter.</div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              {data ? (
                <div className="pagination-row">
                  <button className="btn ghost small" disabled={!canPageBack} onClick={() => goToOffset(data.offset - data.limit)}>
                    Föregående
                  </button>
                  <span>
                    Visar {pageStart}-{pageEnd} av {totalResults}
                  </span>
                  <button className="btn small" disabled={!canPageForward} onClick={() => goToOffset(data.offset + data.limit)}>
                    Nästa
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <div className="empty-state">
              <h3>Inga tider matchar</h3>
              <p>Justera datum, sport, plats eller filter.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function FilterBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="filter-block">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function RadioOption({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={`radio-option ${active ? "active" : ""}`} onClick={onClick} type="button">
      <span />
      {label}
    </button>
  );
}

function LocationField({
  locating,
  locationError,
  onChange,
  onUseCurrentLocation,
  placeholder,
  value,
  variant,
}: {
  locating: boolean;
  locationError: string | null;
  onChange: (value: string) => void;
  onUseCurrentLocation: () => void;
  placeholder: string;
  value: string;
  variant: "landing" | "inline";
}) {
  const [open, setOpen] = useState(false);
  const isLanding = variant === "landing";

  return (
    <div
      className={`${isLanding ? "landing-field" : "field"} location-field`}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
      onFocusCapture={() => setOpen(true)}
    >
      <MapPin size={isLanding ? 18 : 17} />
      <span className={isLanding ? "landing-field-body" : "location-field-body"}>
        {isLanding ? <span className="eyebrow">Plats</span> : null}
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onClick={() => setOpen(true)}
          placeholder={placeholder}
        />
      </span>
      {open ? (
        <div className="location-menu">
          <button disabled={locating} onClick={onUseCurrentLocation} type="button">
            <MapPin size={15} />
            {locating ? "Hämtar position..." : "Använd min plats"}
          </button>
          {locationError ? <small>{locationError}</small> : null}
        </div>
      ) : null}
    </div>
  );
}

function FeaturedClubCard({
  club,
  onSearch,
}: {
  club: (typeof FEATURED_CLUBS)[number];
  onSearch: () => void;
}) {
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveImage((current) => (current + 1) % club.images.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [club.images.length]);

  function showPrevious() {
    setActiveImage((current) => (current - 1 + club.images.length) % club.images.length);
  }

  function showNext() {
    setActiveImage((current) => (current + 1) % club.images.length);
  }

  return (
    <article className="featured-card">
      <div className="featured-card-image" aria-label={`${club.name} bildkarusell`}>
        {club.images.map((image, index) => (
          <div
            aria-hidden={index !== activeImage}
            className={`featured-card-slide ${index === activeImage ? "active" : ""}`}
            key={image}
            style={{ backgroundImage: `url("${image}")` }}
          />
        ))}
        <span>{club.meta}</span>
        <button className="featured-carousel-control previous" onClick={showPrevious} type="button" aria-label="Föregående bild">
          <ChevronLeft size={18} />
        </button>
        <button className="featured-carousel-control next" onClick={showNext} type="button" aria-label="Nästa bild">
          <ChevronRight size={18} />
        </button>
        <div className="featured-carousel-dots" aria-label="Karusellbilder">
          {club.images.map((image, index) => (
            <button
              aria-label={`Visa bild ${index + 1}`}
              aria-pressed={index === activeImage}
              className={index === activeImage ? "active" : ""}
              key={image}
              onClick={() => setActiveImage(index)}
              type="button"
            />
          ))}
        </div>
      </div>
      <div className="featured-card-body">
        <p className="eyebrow">{club.city}</p>
        <h3>{club.name}</h3>
        <p>{club.description}</p>
        <div className="featured-card-foot">
          <span>Sök klubbnamn</span>
          <button className="featured-card-action" onClick={onSearch} type="button">
            Visa tider
          </button>
        </div>
      </div>
    </article>
  );
}

function LandingField({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  return (
    <label className="landing-field">
      <span>{icon}</span>
      <span className="landing-field-body">
        <span className="eyebrow">{label}</span>
        {children}
      </span>
    </label>
  );
}

function parseFiniteNumber(value: string | null) {
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
