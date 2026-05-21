"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Calendar, CircleDot, Clock3, MapPin, Search } from "lucide-react";
import BokaNav from "@/components/boka-nav";
import { normalizeSearchDate, todayISO } from "@/lib/date";
import type { AvailabilityResponse, MatchiAvailabilityOption } from "@/lib/matchi-types";

type CourtGroup = {
  courtName: string;
  surfaceName: string | null;
  options: MatchiAvailabilityOption[];
};

function formatDateLong(iso: string) {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Valt datum";
  return new Intl.DateTimeFormat("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

function groupByCourt(options: MatchiAvailabilityOption[]) {
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

export default function ClubPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const [date, setDate] = useState(() => {
    const value = searchParams.get("date");
    return normalizeSearchDate(value);
  });
  const [sportId, setSportId] = useState(searchParams.get("sport") === "5" ? "5" : "1");
  const [data, setData] = useState<AvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const slug = decodeURIComponent(params.slug);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({
      facility: slug,
      date,
      sport: sportId,
    });

    fetch(`/api/matchi/availability?${query.toString()}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(body?.message || `Kunde inte hämta klubbens tider (${response.status})`);
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
  }, [date, slug, sportId]);

  const courts = useMemo(() => groupByCourt(data?.options ?? []), [data]);
  const facilityName = data?.facility?.name || data?.facilities[0]?.name || slug;

  function updateDate(nextDate: string) {
    const normalized = normalizeSearchDate(nextDate);
    setDate(normalized);
    router.replace(`/clubs/${encodeURIComponent(slug)}?date=${normalized}&sport=${sportId}`);
  }

  function updateSport(nextSportId: string) {
    setSportId(nextSportId);
    router.replace(`/clubs/${encodeURIComponent(slug)}?date=${date}&sport=${nextSportId}`);
  }

  return (
    <main className="page-shell warm">
      <BokaNav current="search" />

      <section className="club-hero">
        <div className="container">
          <button className="text-button" onClick={() => router.back()} type="button">
            <ArrowLeft size={16} />
            Tillbaka
          </button>
          <p className="eyebrow">{data?.sportName || (sportId === "5" ? "Padel" : "Tennis")} · Matchi</p>
          <h1>{facilityName}</h1>
          <div className="club-hero-meta">
            <span>
              <Calendar size={16} />
              {formatDateLong(date)}
            </span>
            <span>
              <CircleDot size={16} />
              {courts.length || "-"} banor
            </span>
            <span>
              <Clock3 size={16} />
              {data?.options.length ?? "-"} tider
            </span>
            <span>
              <MapPin size={16} />
              Pris hämtas från Matchi
            </span>
          </div>
        </div>
      </section>

      <section className="compact-search club-toolbar">
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
            <div className="field compact">
              <Calendar size={17} />
              <input min={todayISO()} type="date" value={date} onChange={(event) => updateDate(event.target.value)} />
            </div>
          </div>
          <button className="btn small" onClick={() => router.push(`/search?date=${date}&sport=${sportId}`)} type="button">
            <Search size={15} />
            Sök fler klubbar
          </button>
        </div>
      </section>

      <section className="container club-courts">
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
        ) : courts.length ? (
          courts.map((court) => (
            <article className="club-court-panel" key={court.courtName}>
              <div className="club-court-head">
                <div>
                  <p className="eyebrow">{court.surfaceName || "Underlag saknas"}</p>
                  <h2>{court.courtName}</h2>
                </div>
                <span>{court.options.length} lediga tider</span>
              </div>

              <div className="club-slot-grid">
                {court.options.map((slot) => (
                  <button className="club-slot" key={slot.slotId} onClick={() => router.push(toBookingQuery(slot))} type="button">
                    <span>{slot.start}</span>
                    <small>
                      {slot.end} · Hämta pris
                    </small>
                  </button>
                ))}
              </div>
            </article>
          ))
        ) : (
          <div className="empty-state">
            <h2>Inga lediga tider</h2>
            <p>Testa ett annat datum eller byt sport.</p>
          </div>
        )}
      </section>
    </main>
  );
}
