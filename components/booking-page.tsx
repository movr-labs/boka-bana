"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Calendar, CreditCard, MapPin, ShieldCheck, UsersRound } from "lucide-react";
import BokaNav from "@/components/boka-nav";
import type { MockQuote, MockQuoteItem } from "@/lib/matchi-types";

type AuthUser = {
  name: string;
  email: string;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: "SEK",
    maximumFractionDigits: 0,
  }).format(value);
}

function isIsoDate(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function formatDate(iso: string) {
  if (!isIsoDate(iso)) return "Valt datum";
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Valt datum";
  return new Intl.DateTimeFormat("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

function itemFromParams(params: URLSearchParams): MockQuoteItem | null {
  const date = params.get("date") ?? "";
  const start = params.get("start") ?? "";
  const end = params.get("end") ?? "";
  const slotId = params.get("slotId") ?? "";
  if (!isIsoDate(date) || !start || !end || !slotId) return null;

  const bookingQuery: Record<string, string> = {};
  params.forEach((value, key) => {
    if (key.startsWith("q_")) bookingQuery[key.slice(2)] = value;
  });

  return {
    facilitySlug: params.get("facilitySlug") || "kungsbackatk",
    facilityId: params.get("facilityId") || "64",
    facilityName: params.get("facilityName") || "Kungsbacka Tennisklubb",
    sportId: params.get("sportId") || "1",
    sportName: params.get("sportName") || "Tennis",
    slotId,
    courtName: params.get("courtName") || "Bana",
    surfaceName: params.get("surfaceName"),
    date,
    start,
    end,
    durationMinutes: Number(params.get("durationMinutes") || 60),
    bookingPath: params.get("bookingPath") || "/book/index",
    bookingQuery,
    mockPrice: Number(params.get("mockPrice") || 0),
  };
}

export default function BookingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [contact, setContact] = useState({
    name: "",
    email: "",
    phone: "",
  });
  const [players, setPlayers] = useState(["", ""]);
  const [quote, setQuote] = useState<MockQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const item = useMemo(() => itemFromParams(new URLSearchParams(searchParams.toString())), [searchParams]);
  const quotedItem = quote?.items[0] ?? item;
  const displayPrice = quote && quote.totalPrice > 0 ? quote.totalPrice : null;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        const body = (await response.json()) as { user?: AuthUser | null };
        return body.user ?? null;
      })
      .then((user) => {
        if (!user || cancelled) return;
        setContact((current) => ({
          ...current,
          name: current.name || user.name,
          email: current.email || user.email,
        }));
        setPlayers((current) => current.map((player, index) => (index === 0 && !player ? user.name : player)));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!item) return;
    const controller = new AbortController();
    setQuote(null);
    setQuoteError(null);
    setQuoteLoading(true);

    fetch("/api/matchi/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(body?.message || `Kunde inte hämta Matchi-pris (${response.status})`);
        }
        return response.json() as Promise<MockQuote>;
      })
      .then(setQuote)
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setQuoteError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setQuoteLoading(false);
      });

    return () => controller.abort();
  }, [item]);

  async function continueToCheckout(event: FormEvent) {
    event.preventDefault();
    if (!item || !quote) return;
    setLoading(true);
    setError(null);
    try {
      localStorage.setItem(
        `bb:checkout:${quote.batchId}`,
        JSON.stringify({
          quote,
          contact,
          players: players.filter(Boolean),
        }),
      );
      router.push(`/checkout/${encodeURIComponent(quote.batchId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  if (!item) {
    return (
      <main className="page-shell">
        <BokaNav current="booking" />
        <section className="container narrow">
          <div className="empty-state">
            <h1>Bokningen saknar tid</h1>
            <p>Gå tillbaka till sökningen och välj en ledig tid.</p>
            <button className="btn" onClick={() => router.push("/search")}>
              Till sök
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell warm">
      <BokaNav current="booking" />
      <section className="booking-hero">
        <div className="container">
          <button className="text-button" onClick={() => router.back()}>
            <ArrowLeft size={16} />
            Tillbaka
          </button>
          <p className="eyebrow">Bokning</p>
          <h1>{item.facilityName}</h1>
        </div>
      </section>

      <form className="container booking-grid" onSubmit={continueToCheckout}>
        <section className="booking-panel">
          <h2>Spelare</h2>
          <div className="form-grid">
            <label>
              Namn
              <input
                required
                value={contact.name}
                onChange={(event) => setContact((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label>
              E-post
              <input
                type="email"
                value={contact.email}
                onChange={(event) => setContact((current) => ({ ...current, email: event.target.value }))}
              />
            </label>
            <label>
              Telefon
              <input
                value={contact.phone}
                onChange={(event) => setContact((current) => ({ ...current, phone: event.target.value }))}
              />
            </label>
          </div>

          <div className="player-list">
            {players.map((player, index) => (
              <label key={index}>
                Spelare {index + 1}
                <input
                  value={player}
                  placeholder={index === 0 ? "Ditt namn" : "Valfritt"}
                  onChange={(event) =>
                    setPlayers((current) => current.map((value, itemIndex) => (itemIndex === index ? event.target.value : value)))
                  }
                />
              </label>
            ))}
          </div>

          <div className="mock-callout">
            <ShieldCheck size={18} />
            <span>Offerten låses kort inför Matchi checkout och valideras igen innan betalning.</span>
          </div>
        </section>

        <aside className="summary-card">
          <p className="eyebrow">Din tid</p>
          <h3>{quotedItem?.courtName}</h3>
          <div className="summary-lines">
            <span>
              <Calendar size={16} />
              {quotedItem ? formatDate(quotedItem.date) : "Valt datum"}
            </span>
            <span>
              <MapPin size={16} />
              {quotedItem?.facilityName}
            </span>
            <span>
              <UsersRound size={16} />
              {quotedItem?.sportName}
            </span>
            <span>
              <CreditCard size={16} />
              {quotedItem?.start}-{quotedItem?.end}
            </span>
          </div>
          <div className="total-row">
            <span>{quoteLoading ? "Hämtar Matchi-pris" : "Matchi-pris"}</span>
            <strong>{displayPrice == null ? "-" : formatMoney(displayPrice)}</strong>
          </div>
          {quote?.lastError ? <div className="notice">{quote.lastError}</div> : null}
          {quoteError ? <div className="notice error">{quoteError}</div> : null}
          {error ? <div className="notice error">{error}</div> : null}
          <button className="btn full dark" disabled={loading || quoteLoading || !quote} type="submit">
            {loading ? "Skapar checkout..." : quoteLoading ? "Hämtar pris..." : "Fortsätt till checkout"}
          </button>
        </aside>
      </form>
    </main>
  );
}
