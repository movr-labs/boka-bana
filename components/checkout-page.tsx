"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, CreditCard, ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import BokaNav from "@/components/boka-nav";
import type { MatchiConfirmResponse, MockQuote, StoredBooking } from "@/lib/matchi-types";

type CheckoutState = {
  quote: MockQuote;
  contact: StoredBooking["contact"];
  players: string[];
};

function formatMoney(value: number) {
  if (value <= 0) return "-";
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
  const [checkoutStatus, setCheckoutStatus] = useState<MatchiConfirmResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
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

  useEffect(() => {
    let cancelled = false;
    async function loadStatus() {
      const response = await fetch(`/api/matchi/checkout/${encodeURIComponent(batchId)}`);
      if (!response.ok || cancelled) return;
      const quote = (await response.json()) as MockQuote;
      setState((current) => (current ? { ...current, quote } : current));
    }
    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, [batchId]);

  const cardPreview = useMemo(() => {
    if (!item) return "";
    return `${item.courtName} · ${item.date} · ${item.start}-${item.end}`;
  }, [item]);

  async function saveConfirmedBooking(payload: MatchiConfirmResponse, currentState: CheckoutState) {
    if (payload.status !== "booked") return;
    const booking: StoredBooking = {
      id: currentState.quote.batchId,
      reference: payload.reference,
      createdAt: payload.confirmedAt,
      quote: {
        ...currentState.quote,
        status: payload.status,
        checkoutUrl: payload.checkoutUrl,
        manualCheckoutUrl: payload.manualCheckoutUrl,
        checkoutRef: payload.checkoutRef,
        lastError: payload.lastError,
      },
      contact: currentState.contact,
      players: currentState.players,
    };

    const saveResponse = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ booking }),
    });
    if (saveResponse.status === 401) {
      router.push(`/login?returnTo=${encodeURIComponent(`/checkout/${batchId}`)}`);
      return;
    }
    if (!saveResponse.ok) {
      const body = (await saveResponse.json().catch(() => null)) as { message?: string } | null;
      throw new Error(body?.message || "Bokningen kunde inte sparas.");
    }
    setConfirmed(booking);
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
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
      const payload = (await response.json()) as MatchiConfirmResponse;
      setCheckoutStatus(payload);
      setState((current) =>
        current
          ? {
              ...current,
              quote: {
                ...current.quote,
                status: payload.status,
                checkoutUrl: payload.checkoutUrl,
                manualCheckoutUrl: payload.manualCheckoutUrl,
                checkoutRef: payload.checkoutRef,
                lastError: payload.lastError,
              },
            }
          : current,
      );
      await saveConfirmedBooking(payload, state);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function reconcile() {
    if (!state) return;
    setChecking(true);
    setError(null);
    try {
      const response = await fetch(`/api/matchi/checkout/${encodeURIComponent(state.quote.batchId)}/reconcile`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message || "Kunde inte kontrollera Matchi checkout");
      }
      const payload = (await response.json()) as MatchiConfirmResponse;
      setCheckoutStatus(payload);
      await saveConfirmedBooking(payload, {
        ...state,
        quote: {
          ...state.quote,
          status: payload.status,
          checkoutUrl: payload.checkoutUrl,
          manualCheckoutUrl: payload.manualCheckoutUrl,
          checkoutRef: payload.checkoutRef,
          lastError: payload.lastError,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setChecking(false);
    }
  }

  if (!state) {
    return (
      <main className="page-shell warm">
        <BokaNav current="booking" />
        <section className="container narrow">
          <div className="empty-state">
            <h1>Checkout saknas</h1>
            <p>Välj en tid igen för att skapa en ny checkout.</p>
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
            <p className="eyebrow">Bekräftad</p>
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

  const actionUrl = checkoutStatus?.checkoutUrl ?? checkoutStatus?.manualCheckoutUrl ?? state.quote.checkoutUrl ?? state.quote.manualCheckoutUrl;
  const isAwaitingMatchi =
    checkoutStatus?.status === "checkout_pending" ||
    checkoutStatus?.status === "payment_processing" ||
    checkoutStatus?.status === "action_required" ||
    state.quote.status === "checkout_pending" ||
    state.quote.status === "payment_processing" ||
    state.quote.status === "action_required";

  return (
    <main className="page-shell warm">
      <BokaNav current="booking" />
      <section className="checkout-hero">
        <div className="container">
          <p className="eyebrow">Matchi checkout</p>
          <h1>Slutför bokningen</h1>
        </div>
      </section>

      <form className="container checkout-grid" onSubmit={submit}>
        <section className="booking-panel">
          <h2>Matchi hanterar betalningen</h2>
          <div className="mock-callout">
            <ShieldCheck size={18} />
            <span>Du skickas vidare till Matchi för betalning. Bokningen sparas här först när Matchi-status är bekräftad.</span>
          </div>
          {isAwaitingMatchi ? (
            <div className="checkout-action-panel">
              <p className="eyebrow">Status {checkoutStatus?.status ?? state.quote.status}</p>
              <h2>Fortsätt i Matchi</h2>
              <p>
                Slutför betalningen i Matchi och kontrollera sedan status här för att spara bokningen.
              </p>
              <div className="confirmation-actions">
                {actionUrl ? (
                  <a className="btn dark" href={actionUrl} rel="noreferrer" target="_blank">
                    <ExternalLink size={17} />
                    Öppna Matchi
                  </a>
                ) : null}
                <button className="btn ghost" disabled={checking} onClick={reconcile} type="button">
                  <RefreshCw size={17} />
                  {checking ? "Kontrollerar..." : "Kontrollera status"}
                </button>
              </div>
            </div>
          ) : null}
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
            {loading ? "Startar..." : "Starta Matchi checkout"}
          </button>
        </aside>
      </form>
    </main>
  );
}
