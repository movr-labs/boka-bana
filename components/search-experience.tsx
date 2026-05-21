"use client";

import { useEffect, useMemo, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar, CircleDot, Clock3, MapPin, Search, SlidersHorizontal } from "lucide-react";
import BokaNav from "@/components/boka-nav";
import { isIsoDate, normalizeSearchDate, todayISO, tomorrowISO } from "@/lib/date";
import type { AvailabilityResponse, MatchiAvailabilityOption, MatchiFacilitySummary } from "@/lib/matchi-types";

type Filters = {
  surface: string;
  timeFrom: string;
  timeTo: string;
};

type CourtGroup = {
  facilitySlug: string;
  facilityName: string;
  courtName: string;
  surfaceName: string | null;
  options: MatchiAvailabilityOption[];
};

type SportId = "1" | "5";

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

const FEATURED_CLUBS = [
  {
    name: "Kungsbacka Tennisklubb",
    city: "Kungsbacka",
    meta: "Tennis · Matchi",
    searchQuery: "Kungsbacka Tennisklubb",
    imageUrl: "https://static.wixstatic.com/media/d8dc73_bb2237b795f847dfb148db8644daeb23~mv2.jpg",
    description: "En klassisk tennisklubb med både inomhusbanor och grusbanor nära Kungsmässan.",
  },
  {
    name: "Gustavsbergs Tennisklubb",
    city: "Gustavsberg",
    meta: "Tennis · Värmdö",
    searchQuery: "Gustavsbergs Tennisklubb",
    imageUrl: "https://assets.matchi.se/archive/2019/05/thumb_3e1b8e56d8eaea2205392ff1aea28cf4.jpg",
    description: "En av Värmdös stora tennisklubbar med inomhusbanor på Ekvallens idrottsområde.",
  },
  {
    name: "Ekerö Tennisklubb",
    city: "Ekerö",
    meta: "Tennis · Ekebyhovshallen",
    searchQuery: "Ekerö Tennisklubb",
    imageUrl: "https://assets.matchi.se/archive/2015/03/thumb_3d0f47550a3093e937313cce16adbb36.jpg",
    description: "En aktiv klubb i Ekebyhovshallen med tennis, pickleball, squash och juniorverksamhet.",
  },
];

const MOCK_TOURNAMENTS = [
  { id: "stockholm", name: "Stockholmsmästerskapen", date: "12-18 juni 2026", host: "Matchi-klubbar i Stockholm" },
  { id: "padel", name: "Sommarpadelserien", date: "Juni-augusti 2026", host: "Utvalda padelhallar" },
  { id: "skane", name: "Skånes Mästerskap", date: "20-24 juli 2026", host: "Malmö Tennisstadion" },
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

function clubImageBackground(imageUrl: string | null) {
  const url =
    imageUrl ||
    "https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=900&q=80&auto=format&fit=crop";
  return `linear-gradient(180deg, rgba(26, 77, 58, 0.05), rgba(26, 77, 58, 0.2)), url("${url}")`;
}

function groupByCourt(options: MatchiAvailabilityOption[]): CourtGroup[] {
  const groups = new Map<string, CourtGroup>();
  for (const option of options) {
    const key = `${option.facilitySlug}:${option.courtName}`;
    const current = groups.get(key) ?? {
      facilitySlug: option.facilitySlug,
      facilityName: option.facilityName,
      courtName: option.courtName,
      surfaceName: option.surfaceName,
      options: [],
    };
    current.options.push(option);
    groups.set(key, current);
  }
  return Array.from(groups.values()).sort((left, right) => {
    return left.facilityName.localeCompare(right.facilityName) || left.courtName.localeCompare(right.courtName);
  });
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
  const [date, setDate] = useState(initialDate ? normalizeSearchDate(initialDate) : tomorrowISO());
  const [location, setLocation] = useState(searchParams.get("location") || "");
  const [submittedQuery, setSubmittedQuery] = useState(searchParams.get("location") || "");
  const [sportId, setSportId] = useState<SportId>(searchParams.get("sport") === "5" ? "5" : "1");
  const [time, setTime] = useState(searchParams.get("time") || "18:00");
  const [duration, setDuration] = useState(searchParams.get("duration") || "60");
  const [offset, setOffset] = useState(Number(searchParams.get("offset") || 0));
  const [filters, setFilters] = useState<Filters>(() => filtersFromSearchParams(searchParams));
  const [data, setData] = useState<AvailabilityResponse | null>(null);
  const [directorySummary, setDirectorySummary] = useState<DirectorySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      q: submittedQuery,
      sport: sportId,
      offset: String(offset),
      limit: String(PAGE_SIZE),
    });
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
  }, [date, home, offset, sportId, submittedQuery]);

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

  const courtGroups = useMemo(() => groupByCourt(filteredOptions), [filteredOptions]);
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
    const query = input.nextQuery ?? submittedQuery;
    if (query) params.set("location", query);
    return `/search?${params.toString()}`;
  }

  function searchForQuery(query: string) {
    const nextQuery = query.trim();
    setLocation(nextQuery);
    setSubmittedQuery(nextQuery);
    setOffset(0);
    router.push(buildSearchUrl({ nextOffset: 0, nextQuery }));
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
                <div className="eyebrow">Lediga tider i realtid</div>
              </div>

              <div className="landing-search-grid" role="search">
                <LandingField label="Plats" icon={<MapPin size={18} />}>
                  <input
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    placeholder="Stad eller klubbnamn"
                  />
                </LandingField>
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
            </form>
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
                <button
                  className="featured-card"
                  key={club.name}
                  onClick={() => searchForQuery(club.searchQuery)}
                  type="button"
                >
                  <div className="featured-card-image" style={{ backgroundImage: `url("${club.imageUrl}")` }}>
                    <span>{club.meta}</span>
                  </div>
                  <div className="featured-card-body">
                    <p className="eyebrow">{club.city}</p>
                    <h3>{club.name}</h3>
                    <p>{club.description}</p>
                    <div className="featured-card-foot">
                      <span>Sök klubbnamn</span>
                      <strong>Visa tider</strong>
                    </div>
                  </div>
                </button>
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
              <button className="btn ghost-light small" type="button">
                Hela kalendern
              </button>
            </div>

            <div className="tournament-list">
              {MOCK_TOURNAMENTS.map((event, index) => (
                <div className="tournament-row" key={event.id}>
                  <span className="eyebrow light">{String(index + 1).padStart(2, "0")}</span>
                  <strong>{event.name}</strong>
                  <span>{event.date}</span>
                  <span>
                    <small>Värdklubb</small>
                    {event.host}
                  </span>
                  <button className="btn ghost-light small" type="button">
                    Anmäl
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer className="landing-footer">
          <div className="container">
            <strong>Bokabana</strong>
            <span>Sveriges samlade plats för tennis- och padelbokningar.</span>
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
              <div className="field">
                <MapPin size={18} />
                <input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="Sök klubb eller stad"
                />
              </div>
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
              <div className="field">
                <MapPin size={17} />
                <input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="Sök klubb eller stad"
                />
              </div>
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

          {courtGroups.length > 0 ? (
            <section id="courts" className="court-list">
              {courtGroups.map((group) => (
                <div key={`${group.facilitySlug}:${group.courtName}`} className="court-row">
                  <div>
                    <h4>{group.courtName}</h4>
                    <p>{group.facilityName} · {group.surfaceName || "Underlag saknas"} · {group.options.length} tider</p>
                  </div>
                  <div className="slots">
                    {group.options.slice(0, 12).map((slot) => (
                      <button key={slot.slotId} className="slot-button compact" onClick={() => router.push(toBookingQuery(slot))}>
                        <span>{slot.start}</span>
                        <small>Pris</small>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ) : null}
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
