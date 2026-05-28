"use client";

import { FormEvent, useMemo, useState } from "react";
import { CheckCircle2, MapPin, Send, Sparkles, Target, UserRound } from "lucide-react";
import BokaNav from "@/components/boka-nav";

const SPORTS = ["Tennis", "Padel"] as const;
const LEVELS = ["Nybörjare", "Motionär", "Medel", "Avancerad", "Junior"] as const;
const CITY_SUGGESTIONS = ["Stockholm", "Göteborg", "Malmö", "Uppsala", "Kungsbacka", "Gustavsberg", "Ekerö"];
const AVAILABILITY_OPTIONS = ["Vardagar dagtid", "Vardagar kväll", "Helger", "Flexibelt"];

type Sport = (typeof SPORTS)[number];
type Level = (typeof LEVELS)[number];

type LeadResponse = {
  lead: {
    id: string;
    createdAt: string;
    matchSummary: string;
  };
};

function trainerTypeFor(level: Level) {
  if (level === "Junior") return "juniortränare";
  if (level === "Nybörjare") return "introduktionstränare";
  if (level === "Avancerad") return "tävlingsinriktad tränare";
  return "tekniktränare";
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone: string) {
  return phone.replace(/\D/g, "").length >= 7;
}

export default function TrainerMatchPage() {
  const [sport, setSport] = useState<Sport | "">("");
  const [city, setCity] = useState("");
  const [level, setLevel] = useState<Level | "">("");
  const [goal, setGoal] = useState("");
  const [availability, setAvailability] = useState("");
  const [contact, setContact] = useState({ name: "", email: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<LeadResponse["lead"] | null>(null);

  const canMatch = Boolean(sport && city.trim() && level);
  const matchSummary = useMemo(() => {
    if (!sport || !city.trim() || !level) return null;
    return `Vi matchar dig med en ${trainerTypeFor(level)} för ${sport.toLowerCase()} på ${level.toLowerCase()}nivå i ${city.trim()}.`;
  }, [city, level, sport]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setConfirmation(null);

    if (!sport) return setError("Välj sport.");
    if (!city.trim()) return setError("Välj ort.");
    if (!level) return setError("Välj nivå.");
    if (!contact.name.trim()) return setError("Fyll i namn.");
    if (!isValidEmail(contact.email.trim())) return setError("Ange en giltig e-postadress.");
    if (!isValidPhone(contact.phone.trim())) return setError("Ange ett giltigt telefonnummer.");

    setSubmitting(true);
    try {
      const response = await fetch("/api/trainer-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sport,
          city,
          level,
          goal,
          availability,
          ...contact,
        }),
      });
      const body = (await response.json().catch(() => null)) as LeadResponse | { message?: string } | null;
      if (!response.ok) {
        throw new Error(body && "message" in body ? body.message : "Kunde inte skicka förfrågan.");
      }
      setConfirmation((body as LeadResponse).lead);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page-shell warm trainer-page">
      <BokaNav current="trainers" />

      <section className="trainer-hero">
        <div className="container trainer-hero-grid">
          <div>
            <p className="eyebrow">Sök tränare</p>
            <h1>Hitta rätt tränare för din nästa nivå.</h1>
            <p>
              Svara på några korta frågor så visar vi en preliminär matchning direkt. Därefter kan du lämna
              kontaktuppgifter så återkommer vi med rätt tränare.
            </p>
          </div>
          <div className="trainer-hero-card">
            <Sparkles size={24} />
            <strong>Vi matchar dig</strong>
            <span>Sport, ort och nivå vägs ihop med ditt mål och när du kan träna.</span>
          </div>
        </div>
      </section>

      <form className="container trainer-match-grid" onSubmit={submit}>
        <section className="booking-panel trainer-panel">
          <div className="trainer-step">
            <span>1</span>
            <div>
              <p className="eyebrow">Välj sport</p>
              <h2>Vad vill du träna?</h2>
            </div>
          </div>
          <div className="trainer-chip-row" role="group" aria-label="Välj sport">
            {SPORTS.map((item) => (
              <button className={sport === item ? "selected" : ""} key={item} onClick={() => setSport(item)} type="button">
                {item}
              </button>
            ))}
          </div>

          <div className="trainer-step">
            <span>2</span>
            <div>
              <p className="eyebrow">Välj ort</p>
              <h2>Var vill du träna?</h2>
            </div>
          </div>
          <label className="trainer-field">
            Ort
            <input
              autoComplete="address-level2"
              placeholder="Skriv ort eller välj snabbval"
              value={city}
              onChange={(event) => setCity(event.target.value)}
            />
          </label>
          <div className="trainer-city-row">
            {CITY_SUGGESTIONS.map((item) => (
              <button className={city === item ? "selected" : ""} key={item} onClick={() => setCity(item)} type="button">
                {item}
              </button>
            ))}
          </div>

          <div className="trainer-step">
            <span>3</span>
            <div>
              <p className="eyebrow">Välj nivå</p>
              <h2>Vilken nivå passar bäst?</h2>
            </div>
          </div>
          <div className="trainer-chip-row levels" role="group" aria-label="Välj nivå">
            {LEVELS.map((item) => (
              <button className={level === item ? "selected" : ""} key={item} onClick={() => setLevel(item)} type="button">
                {item}
              </button>
            ))}
          </div>

          <div className="trainer-extra-grid">
            <label className="trainer-field">
              Mål med träningen
              <textarea
                placeholder="Ex. bättre serve, matchspel, komma igång igen"
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
              />
            </label>
            <label className="trainer-field">
              Önskad tillgänglighet
              <select value={availability} onChange={(event) => setAvailability(event.target.value)}>
                <option value="">Välj tid</option>
                {AVAILABILITY_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <aside className="trainer-side">
          <section className={`trainer-match-card ${canMatch ? "ready" : ""}`}>
            <Target size={22} />
            <p className="eyebrow">Din matchning</p>
            <h2>{canMatch ? "Preliminär match klar" : "Välj sport, ort och nivå"}</h2>
            <p>
              {matchSummary ??
                "När de tre första stegen är ifyllda visar vi vilken typ av tränare som passar bäst för dig."}
            </p>
            {canMatch ? (
              <div className="trainer-match-tags">
                <span>{sport}</span>
                <span>{city.trim()}</span>
                <span>{level}</span>
              </div>
            ) : null}
          </section>

          <section className="booking-panel trainer-contact-panel">
            <div className="trainer-step compact">
              <UserRound size={18} />
              <div>
                <p className="eyebrow">Kontakt</p>
                <h2>Vi återkommer</h2>
              </div>
            </div>
            <div className="form-grid single">
              <label>
                Namn
                <input
                  autoComplete="name"
                  value={contact.name}
                  onChange={(event) => setContact((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
              <label>
                E-post
                <input
                  autoComplete="email"
                  type="email"
                  value={contact.email}
                  onChange={(event) => setContact((current) => ({ ...current, email: event.target.value }))}
                />
              </label>
              <label>
                Telefon
                <input
                  autoComplete="tel"
                  type="tel"
                  value={contact.phone}
                  onChange={(event) => setContact((current) => ({ ...current, phone: event.target.value }))}
                />
              </label>
            </div>
            {error ? <div className="notice error">{error}</div> : null}
            {confirmation ? (
              <div className="trainer-confirmation">
                <CheckCircle2 size={20} />
                <div>
                  <strong>Vi har tagit emot din förfrågan.</strong>
                  <span>Vi återkommer med rätt tränare. Referens: {confirmation.id.slice(0, 8)}</span>
                </div>
              </div>
            ) : null}
            <button className="btn dark full" disabled={submitting} type="submit">
              <Send size={16} />
              {submitting ? "Skickar..." : "Skicka förfrågan"}
            </button>
            <p className="trainer-privacy">
              <MapPin size={14} />
              Vi använder orten för att hitta tränare nära dig.
            </p>
          </section>
        </aside>
      </form>
    </main>
  );
}
