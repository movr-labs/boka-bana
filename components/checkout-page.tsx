"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, CreditCard, LockKeyhole, ShieldCheck } from "lucide-react";
import BokaNav from "@/components/boka-nav";
import type { MockQuote, StoredBooking } from "@/lib/matchi-types";

type CheckoutState = {
  quote: MockQuote;
  contact: StoredBooking["contact"];
  players: string[];
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: "SEK",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function CheckoutPage() {
  const router = useRouter();
  const params = useParams<{ batchId: string }>();
  const batchId = params.batchId;
  const [state, setState] = useState<CheckoutState | null>(null);
  const [confirmed, setConfirmed] = useState<StoredBooking | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const item = state?.quote.items[0] ?? null;

  useEffect(() => {
    const raw = localStorage.getItem(`bb:checkout:${batchId}`);
    if (!raw) return;
    try {
      setState(JSON.parse(raw) as CheckoutState);
    } catch {
      setState(null);
    }
  }, [batchId]);

  const cardPreview = useMemo(() => {
    if (!item) return "";
    return `${item.courtName} · ${item.date} · ${item.start}-${item.end}`;
  }, [item]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!state) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/matchi/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: state.quote.batchId }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message || "Checkout kunde inte slutföras");
      }
      const payload = (await response.json()) as { reference: string; confirmedAt: string };
      const booking: StoredBooking = {
        id: state.quote.batchId,
        reference: payload.reference,
        createdAt: payload.confirmedAt,
        quote: state.quote,
        contact: state.contact,
        players: state.players,
      };
      const existing = JSON.parse(localStorage.getItem("bb:bookings") || "[]") as StoredBooking[];
      localStorage.setItem("bb:bookings", JSON.stringify([booking, ...existing]));
      setConfirmed(booking);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  if (!state) {
    return (
      <main className="page-shell warm">
        <BokaNav current="booking" />
        <section className="container narrow">
          <div className="empty-state">
            <h1>Checkout saknas</h1>
            <p>Välj en tid igen för att skapa en ny mock checkout.</p>
            <button className="btn" onClick={() => router.push("/search")}>
              Till sök
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (confirmed && item) {
    return (
      <main className="page-shell warm">
        <BokaNav current="bookings" />
        <section className="container narrow">
          <div className="confirmation-card">
            <CheckCircle2 size={44} />
            <p className="eyebrow">Bekräftad lokalt</p>
            <h1>{item.courtName}</h1>
            <p>
              {item.date} · {item.start}-{item.end}
            </p>
            <strong>{confirmed.reference}</strong>
            <div className="confirmation-actions">
              <Link className="btn dark" href="/bookings">
                Mina bokningar
              </Link>
              <Link className="btn ghost" href="/search">
                Boka mer
              </Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell warm">
      <BokaNav current="booking" />
      <section className="checkout-hero">
        <div className="container">
          <p className="eyebrow">Mock checkout</p>
          <h1>Slutför bokningen</h1>
        </div>
      </section>

      <form className="container checkout-grid" onSubmit={submit}>
        <section className="booking-panel">
          <h2>Betalning</h2>
          <div className="form-grid">
            <label>
              Kortnummer
              <input inputMode="numeric" defaultValue="4242 4242 4242 4242" />
            </label>
            <label>
              Giltigt till
              <input defaultValue="12/30" />
            </label>
            <label>
              CVC
              <input inputMode="numeric" defaultValue="123" />
            </label>
          </div>
          <div className="mock-callout">
            <LockKeyhole size={18} />
            <span>Det här är en lokal testbetalning. Ingen kortdata eller bokning skickas till Matchi.</span>
          </div>
        </section>

        <aside className="summary-card">
          <p className="eyebrow">Offert</p>
          <h3>{cardPreview}</h3>
          <div className="summary-lines">
            <span>
              <CreditCard size={16} />
              {state.quote.methods.join(", ")}
            </span>
            <span>
              <ShieldCheck size={16} />
              Batch {state.quote.batchId.slice(0, 13)}
            </span>
          </div>
          <div className="total-row">
            <span>Att betala</span>
            <strong>{formatMoney(state.quote.totalPrice)}</strong>
          </div>
          {error ? <div className="notice error">{error}</div> : null}
          <button className="btn full dark" disabled={loading} type="submit">
            {loading ? "Slutför..." : "Slutför mock checkout"}
          </button>
        </aside>
      </form>
    </main>
  );
}
