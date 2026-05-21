"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar, Clock3, MapPin, Search, SlidersHorizontal } from "lucide-react";
import BokaNav from "@/components/boka-nav";
import type { AvailabilityResponse, MatchiAvailabilityOption } from "@/lib/matchi-types";

type Filters = {
  surface: string;
  priceMax: number;
  timeFrom: string;
  timeTo: string;
};

type CourtGroup = {
  courtName: string;
  surfaceName: string | null;
  options: MatchiAvailabilityOption[];
};

const DEFAULT_FILTERS: Filters = {
  surface: "any",
  priceMax: 420,
  timeFrom: "06",
  timeTo: "22",
};

function tomorrowISO() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLong(iso: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${iso}T00:00:00`));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: "SEK",
    maximumFractionDigits: 0,
  }).format(value);
}

function groupByCourt(options: MatchiAvailabilityOption[]): CourtGroup[] {
  const groups = new Map<string, CourtGroup>();
  for (const option of options) {
    const current = groups.get(option.courtName) ?? {
      courtName: option.courtName,
      surfaceName: option.surfaceName,
      options: [],
    };
    current.options.push(option);
    groups.set(option.courtName, current);
  }
  return Array.from(groups.values()).sort((left, right) => left.courtName.localeCompare(right.courtName));
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
  const [date, setDate] = useState(searchParams.get("date") || tomorrowISO());
  const [location, setLocation] = useState(searchParams.get("location") || "Kungsbacka");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [data, setData] = useState<AvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/matchi/availability?date=${encodeURIComponent(date)}&facility=kungsbackatk&sport=1`, {
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
  }, [date]);

  const locationMatches = useMemo(() => {
    const needle = location.trim().toLowerCase();
    if (!needle) return true;
    const haystack = `${data?.facility.name ?? "Kungsbacka Tennisklubb"} Kungsbacka tennis`.toLowerCase();
    return haystack.includes(needle);
  }, [data?.facility.name, location]);

  const filteredOptions = useMemo(() => {
    if (!data || !locationMatches) return [];
    return data.options.filter((option) => {
      if (filters.surface !== "any") {
        const surface = (option.surfaceName ?? "").toLowerCase();
        if (!surface.includes(filters.surface)) return false;
      }
      return matchesWindow(option, filters);
    });
  }, [data, filters, locationMatches]);

  const courtGroups = useMemo(() => groupByCourt(filteredOptions), [filteredOptions]);
  const priceFrom = filteredOptions.length ? Math.min(...filteredOptions.map((slot) => slot.mockPrice)) : null;
  const firstSlots = courtGroups.flatMap((group) => group.options.slice(0, 8)).slice(0, 10);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function submitSearch() {
    router.push(`/search?location=${encodeURIComponent(location)}&date=${encodeURIComponent(date)}`);
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
                <input value={location} onChange={(event) => setLocation(event.target.value)} />
              </div>
              <div className="field compact">
                <Calendar size={18} />
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
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
              <button className="selected">Tennis</button>
              <button disabled>Padel</button>
            </div>
            <div className="search-box">
              <div className="field">
                <MapPin size={17} />
                <input value={location} onChange={(event) => setLocation(event.target.value)} />
              </div>
              <div className="field compact">
                <Calendar size={17} />
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
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
                {loading ? "Hämtar lediga tider" : `${locationMatches && data ? 1 : 0} klubb · ${formatDateLong(date)}`}
              </h2>
              <p>{data ? `Realtider från ${data.facility.name}` : "Matchi-anslutna tider"}</p>
            </div>
            <div className="sort-pill">
              <SlidersHorizontal size={14} />
              Tidigast först
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
          ) : data && locationMatches && filteredOptions.length > 0 ? (
            <article className="result-card">
              <button className="club-image" onClick={() => router.push("#courts")} aria-label={data.facility.name} />
              <div className="club-body">
                <div className="club-top">
                  <div>
                    <p className="eyebrow">Kungsbacka · Matchi · {data.facility.facilityId}</p>
                    <h3>{data.facility.name}</h3>
                    <div className="chips">
                      <span className="chip"><span />tennis</span>
                      <span className="chip">Matchi</span>
                      <span className="chip">{courtGroups.length} banor med tider</span>
                    </div>
                  </div>
                  <div className="price-block">
                    <span>Från</span>
                    <strong>{priceFrom ? formatMoney(priceFrom) : "-"}</strong>
                    <small>{filteredOptions.length} tider</small>
                  </div>
                </div>

                <div className="slots-strip">
                  <div className="slots-head">
                    <span>Lediga tider</span>
                    <a href="#courts">Se hela schemat</a>
                  </div>
                  <div className="slots">
                    {firstSlots.map((slot) => (
                      <button key={slot.slotId} className="slot-button" onClick={() => router.push(toBookingQuery(slot))}>
                        <span>{slot.start}</span>
                        <small>{formatMoney(slot.mockPrice)}</small>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          ) : (
            <div className="empty-state">
              <h3>Inga tider matchar</h3>
              <p>Justera datum, plats eller filter.</p>
            </div>
          )}

          {courtGroups.length > 0 ? (
            <section id="courts" className="court-list">
              {courtGroups.map((group) => (
                <div key={group.courtName} className="court-row">
                  <div>
                    <h4>{group.courtName}</h4>
                    <p>{group.surfaceName || "Underlag saknas"} · {group.options.length} tider</p>
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
