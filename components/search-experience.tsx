"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar, Clock3, MapPin, Search, SlidersHorizontal } from "lucide-react";
import BokaNav from "@/components/boka-nav";
import type { AvailabilityResponse, MatchiAvailabilityOption, MatchiFacilitySummary } from "@/lib/matchi-types";

type Filters = {
  surface: string;
  priceMax: number;
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

const DEFAULT_FILTERS: Filters = {
  surface: "any",
  priceMax: 420,
  timeFrom: "06",
  timeTo: "22",
};

const PAGE_SIZE = 10;

const SPORT_LABELS: Record<SportId, string> = {
  "1": "Tennis",
  "5": "Padel",
};

function isIsoDate(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function tomorrowISO() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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

function formatMoney(value: number) {
  return new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: "SEK",
    maximumFractionDigits: 0,
  }).format(value);
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
  return hour >= filters.timeFrom && hour <= filters.timeTo && option.mockPrice <= filters.priceMax;
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

export default function SearchExperience({ home = false }: { home?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialDate = searchParams.get("date");
  const [date, setDate] = useState(isIsoDate(initialDate) ? initialDate : tomorrowISO());
  const [location, setLocation] = useState(searchParams.get("location") || "");
  const [submittedQuery, setSubmittedQuery] = useState(searchParams.get("location") || "");
  const [sportId, setSportId] = useState<SportId>(searchParams.get("sport") === "5" ? "5" : "1");
  const [offset, setOffset] = useState(Number(searchParams.get("offset") || 0));
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [data, setData] = useState<AvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, [date, offset, sportId, submittedQuery]);

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

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function submitSearch() {
    setSubmittedQuery(location.trim());
    setOffset(0);
    router.push(buildSearchUrl({ nextOffset: 0, nextQuery: location.trim() }));
  }

  function updateSport(nextSportId: SportId) {
    setSportId(nextSportId);
    setOffset(0);
    router.push(buildSearchUrl({ nextOffset: 0, nextSportId }));
  }

  function updateDate(nextDate: string) {
    const normalizedDate = isIsoDate(nextDate) ? nextDate : tomorrowISO();
    setDate(normalizedDate);
    setOffset(0);
    router.push(buildSearchUrl({ nextDate: normalizedDate, nextOffset: 0 }));
  }

  function goToOffset(nextOffset: number) {
    const normalized = Math.max(0, nextOffset);
    setOffset(normalized);
    router.push(buildSearchUrl({ nextOffset: normalized, nextQuery: submittedQuery }));
  }

  function buildSearchUrl(input: {
    nextDate?: string;
    nextOffset?: number;
    nextQuery?: string;
    nextSportId?: SportId;
  }) {
    const params = new URLSearchParams({
      date: input.nextDate ?? date,
      sport: input.nextSportId ?? sportId,
      offset: String(input.nextOffset ?? offset),
    });
    const query = input.nextQuery ?? submittedQuery;
    if (query) params.set("location", query);
    return `/search?${params.toString()}`;
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
                <input type="date" value={date} onChange={(event) => updateDate(event.target.value)} />
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
                <input type="date" value={date} onChange={(event) => updateDate(event.target.value)} />
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
          <FilterBlock title="Pris (mock)">
            <input
              type="range"
              min={180}
              max={520}
              step={20}
              value={filters.priceMax}
              onChange={(event) => updateFilter("priceMax", Number(event.target.value))}
            />
            <div className="range-row">
              <span>180 kr</span>
              <strong>≤ {filters.priceMax} kr</strong>
              <span>520 kr</span>
            </div>
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
                  const facilityPriceFrom = options.length ? Math.min(...options.map((slot) => slot.mockPrice)) : null;
                  const facilityCourtCount = new Set(options.map((slot) => slot.courtName)).size;
                  return (
                    <article className="result-card" key={`${facility.sportId}:${facility.slug}`}>
                      <button
                        className="club-image"
                        onClick={() => router.push("#courts")}
                        aria-label={facility.name}
                        style={{ backgroundImage: clubImageBackground(facility.imageUrl) }}
                      />
                      <div className="club-body">
                        <div className="club-top">
                          <div>
                            <p className="eyebrow">
                              {facility.city || "Matchi"} · Matchi · {facility.facilityId}
                            </p>
                            <h3>{facility.name}</h3>
                            <div className="chips">
                              <span className="chip"><span />{facility.sportName.toLowerCase()}</span>
                              <span className="chip">Matchi</span>
                              <span className="chip">
                                {facility.bookableCourts ?? facilityCourtCount} bokningsbara banor
                              </span>
                            </div>
                          </div>
                          <div className="price-block">
                            <span>Från</span>
                            <strong>{facilityPriceFrom ? formatMoney(facilityPriceFrom) : "-"}</strong>
                            <small>{options.length} tider</small>
                          </div>
                        </div>

                        <div className="slots-strip">
                          <div className="slots-head">
                            <span>Lediga tider</span>
                            {options.length ? <a href="#courts">Se schemat</a> : null}
                          </div>
                          {options.length ? (
                            <div className="slots">
                              {options.slice(0, 10).map((slot) => (
                                <button key={slot.slotId} className="slot-button" onClick={() => router.push(toBookingQuery(slot))}>
                                  <span>{slot.start}</span>
                                  <small>{formatMoney(slot.mockPrice)}</small>
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
                        <small>{formatMoney(slot.mockPrice)}</small>
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
