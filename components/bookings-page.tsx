"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BokaNav from "@/components/boka-nav";
import type { StoredBooking } from "@/lib/matchi-types";

type BookingsState =
  | { status: "loading"; bookings: StoredBooking[]; message: null }
  | { status: "ready"; bookings: StoredBooking[]; message: null }
  | { status: "unauthorized"; bookings: StoredBooking[]; message: string }
  | { status: "error"; bookings: StoredBooking[]; message: string };

function formatMoney(value: number) {
  return new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: "SEK",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function BookingsPage() {
  const [state, setState] = useState<BookingsState>({ status: "loading", bookings: [], message: null });

  useEffect(() => {
    let active = true;
    fetch("/api/bookings", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          const body = (await response.json().catch(() => null)) as { message?: string } | null;
          return {
            status: "unauthorized" as const,
            bookings: [],
            message: body?.message || "Logga in för att se dina bokningar.",
          };
        }
        if (!response.ok) {
          throw new Error(`Kunde inte hämta bokningar (${response.status})`);
        }
        const body = (await response.json()) as { bookings: StoredBooking[] };
        return { status: "ready" as const, bookings: body.bookings, message: null };
      })
      .then((nextState) => {
        if (active) setState(nextState);
      })
      .catch((err) => {
        if (active) {
          setState({
            status: "error",
            bookings: [],
            message: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const bookings = state.bookings;

  return (
    <main className="page-shell warm">
      <BokaNav current="bookings" />
      <section className="account-hero">
        <div className="container">
          <p className="eyebrow">Mitt konto</p>
          <h1>Mina bokningar</h1>
        </div>
      </section>
      <section className="container bookings-list">
        {state.status === "loading" ? (
          <div className="empty-state">
            <h2>Hämtar bokningar</h2>
            <p>Vi läser in dina bokningar från Bokabana-kontot.</p>
          </div>
        ) : state.status === "unauthorized" ? (
          <div className="empty-state">
            <h2>Logga in</h2>
            <p>{state.message}</p>
            <Link className="btn dark" href="/login?returnTo=/bookings">
              Logga in
            </Link>
          </div>
        ) : state.status === "error" ? (
          <div className="empty-state">
            <h2>Något gick fel</h2>
            <p>{state.message}</p>
          </div>
        ) : bookings.length === 0 ? (
          <div className="empty-state">
            <h2>Inga bokningar ännu</h2>
            <p>Dina bokningar visas här efter checkout.</p>
            <Link className="btn dark" href="/search">
              Sök lediga tider
            </Link>
          </div>
        ) : (
          bookings.map((booking) => {
            const item = booking.quote.items[0];
            return (
              <article className="booking-row" key={booking.id}>
                <div>
                  <p className="eyebrow">{booking.reference}</p>
                  <h3>{item.courtName}</h3>
                  <p>
                    {item.facilityName} · {item.date} · {item.start}-{item.end}
                  </p>
                </div>
                <strong>{formatMoney(booking.quote.totalPrice)}</strong>
              </article>
            );
          })
        )}
      </section>
    </main>
  );
}
