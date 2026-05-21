"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BokaNav from "@/components/boka-nav";
import type { StoredBooking } from "@/lib/matchi-types";

function formatMoney(value: number) {
  return new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: "SEK",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<StoredBooking[]>([]);

  useEffect(() => {
    try {
      setBookings(JSON.parse(localStorage.getItem("bb:bookings") || "[]") as StoredBooking[]);
    } catch {
      setBookings([]);
    }
  }, []);

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
        {bookings.length === 0 ? (
          <div className="empty-state">
            <h2>Inga bokningar ännu</h2>
            <p>Dina mockbokningar visas här efter checkout.</p>
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
