"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Send, Sparkles, Target, UserRound } from "lucide-react";
import BokaNav from "@/components/boka-nav";

const SPORTS = ["Tennis", "Padel"] as const;
const LEVELS = ["Nybörjare", "Medel", "Avancerad", "Motionär", "Junior"] as const;
const CITY_SUGGESTIONS = ["Stockholm", "Göteborg", "Malmö", "Uppsala"];
const AVAILABILITY_OPTIONS = ["Vardagar dagtid", "Vardagar kväll", "Helger", "Flexibelt"];
const WIZARD_STEPS = ["Sport", "Ort", "Nivå", "Mål", "Kontakt"];

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
  const [currentStep, setCurrentStep] = useState(0);
  const [sport, setSport] = useState<Sport | "">("");
  const [city, setCity] = useState("");
  const [level, setLevel] = useState<Level | "">("");
  const [goal, setGoal] = useState("");
  const [availability, setAvailability] = useState("");
  const [contact, setContact] = useState({ name: "", email: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasTriedContactSubmit, setHasTriedContactSubmit] = useState(false);
  const [confirmation, setConfirmation] = useState<LeadResponse["lead"] | null>(null);

  const canMatch = Boolean(sport && city.trim() && level);
  const isLastStep = currentStep === WIZARD_STEPS.length - 1;
  const matchSummary = useMemo(() => {
    if (!sport || !city.trim() || !level) return null;
    return `Vi matchar dig med en ${trainerTypeFor(level)} för ${sport.toLowerCase()} på ${level.toLowerCase()}nivå i ${city.trim()}.`;
  }, [city, level, sport]);

  useEffect(() => {
    if (currentStep === WIZARD_STEPS.length - 1) {
      setError(null);
      setHasTriedContactSubmit(false);
    }
  }, [currentStep]);

  function validateStep(step = currentStep) {
    if (step === 0 && !sport) return "Välj sport.";
    if (step === 1 && !city.trim()) return "Välj ort.";
    if (step === 2 && !level) return "Välj nivå.";
    if (step === 3 && !goal.trim()) return "Fyll i mål med träningen.";
    if (step === 3 && !availability) return "Välj önskad tillgänglighet.";
    if (step === 4) {
      if (!contact.name.trim()) return "Fyll i namn.";
      if (!isValidEmail(contact.email.trim())) return "Ange en giltig e-postadress.";
      if (!isValidPhone(contact.phone.trim())) return "Ange ett giltigt telefonnummer.";
    }
    return null;
  }

  function goNext() {
    const stepError = validateStep();
    if (stepError) {
      setError(stepError);
      return;
    }
    setError(null);
    setHasTriedContactSubmit(false);
    setCurrentStep((step) => Math.min(step + 1, WIZARD_STEPS.length - 1));
  }

  function goBack() {
    setError(null);
    setCurrentStep((step) => Math.max(step - 1, 0));
  }

  function goToStep(step: number) {
    if (step <= currentStep) {
      setError(null);
      setHasTriedContactSubmit(false);
      setCurrentStep(step);
    }
  }

  async function submitTrainerLead() {
    setError(null);
    setConfirmation(null);
    setHasTriedContactSubmit(true);

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

      <form className="container trainer-match-grid" onSubmit={(event) => event.preventDefault()}>
        <section className="booking-panel trainer-wizard">
          <div className="trainer-wizard-head">
            <div>
              <p className="eyebrow">Steg {currentStep + 1} av {WIZARD_STEPS.length}</p>
              <h2>Matcha med tränare</h2>
            </div>
            <div className="trainer-wizard-progress" aria-label="Steg i tränarmatchning">
              {WIZARD_STEPS.map((item, index) => (
                <button
                  aria-current={currentStep === index ? "step" : undefined}
                  className={index <= currentStep ? "active" : ""}
                  disabled={index > currentStep}
                  key={item}
                  onClick={() => goToStep(index)}
                  type="button"
                >
                  <span>{index + 1}</span>
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="trainer-wizard-body">
            {currentStep === 0 ? (
              <section className="trainer-wizard-step" aria-labelledby="trainer-step-sport">
                <div className="trainer-step">
                  <span>1</span>
                  <div>
                    <p className="eyebrow">Välj sport</p>
                    <h2 id="trainer-step-sport">Vad vill du träna?</h2>
                  </div>
                </div>
                <div className="trainer-chip-row large" role="group" aria-label="Välj sport">
                  {SPORTS.map((item) => (
                    <button
                      className={sport === item ? "selected" : ""}
                      key={item}
                      onClick={() => setSport(item)}
                      type="button"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {currentStep === 1 ? (
              <section className="trainer-wizard-step" aria-labelledby="trainer-step-city">
                <div className="trainer-step">
                  <span>2</span>
                  <div>
                    <p className="eyebrow">Välj ort</p>
                    <h2 id="trainer-step-city">Var vill du träna?</h2>
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
                    <button
                      className={city === item ? "selected" : ""}
                      key={item}
                      onClick={() => setCity(item)}
                      type="button"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {currentStep === 2 ? (
              <section className="trainer-wizard-step" aria-labelledby="trainer-step-level">
                <div className="trainer-step">
                  <span>3</span>
                  <div>
                    <p className="eyebrow">Välj nivå</p>
                    <h2 id="trainer-step-level">Vilken nivå passar bäst?</h2>
                  </div>
                </div>
                <div className="trainer-chip-row levels large" role="group" aria-label="Välj nivå">
                  {LEVELS.map((item) => (
                    <button
                      className={level === item ? "selected" : ""}
                      key={item}
                      onClick={() => setLevel(item)}
                      type="button"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {currentStep === 3 ? (
              <section className="trainer-wizard-step" aria-labelledby="trainer-step-goal">
                <div className="trainer-step">
                  <span>4</span>
                  <div>
                    <p className="eyebrow">Mål och tider</p>
                    <h2 id="trainer-step-goal">Vad ska tränaren hjälpa dig med?</h2>
                  </div>
                </div>
                <div className="trainer-extra-grid">
                  <label className="trainer-field">
                    Mål med träningen
                    <textarea
                      required
                      placeholder="Ex. bättre serve, matchspel, komma igång igen"
                      value={goal}
                      onChange={(event) => setGoal(event.target.value)}
                    />
                  </label>
                  <label className="trainer-field">
                    Önskad tillgänglighet
                    <select required value={availability} onChange={(event) => setAvailability(event.target.value)}>
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
            ) : null}

            {currentStep === 4 ? (
              <section className="trainer-wizard-step trainer-contact-step" aria-labelledby="trainer-step-contact">
                <div className="trainer-step compact">
                  <UserRound size={18} />
                  <div>
                    <p className="eyebrow">Kontakt och matchning</p>
                    <h2 id="trainer-step-contact">Fyll i kontaktuppgifter</h2>
                  </div>
                </div>
                <div className={`trainer-match-card ${canMatch ? "ready" : ""}`}>
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
                      {availability ? <span>{availability}</span> : null}
                    </div>
                  ) : null}
                </div>
                <div className="form-grid trainer-contact-grid">
                  <label>
                    Namn
                    <input
                      autoComplete="name"
                      value={contact.name}
                      onChange={(event) => {
                        setError(null);
                        setContact((current) => ({ ...current, name: event.target.value }));
                      }}
                    />
                  </label>
                  <label>
                    E-post
                    <input
                      autoComplete="email"
                      type="email"
                      value={contact.email}
                      onChange={(event) => {
                        setError(null);
                        setContact((current) => ({ ...current, email: event.target.value }));
                      }}
                    />
                  </label>
                  <label>
                    Telefon
                    <input
                      autoComplete="tel"
                      type="tel"
                      value={contact.phone}
                      onChange={(event) => {
                        setError(null);
                        setContact((current) => ({ ...current, phone: event.target.value }));
                      }}
                    />
                  </label>
                </div>
                {confirmation ? (
                  <div className="trainer-confirmation">
                    <CheckCircle2 size={20} />
                    <div>
                      <strong>Vi har tagit emot din förfrågan.</strong>
                      <span>Vi återkommer med rätt tränare. Referens: {confirmation.id.slice(0, 8)}</span>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>

          {error && (currentStep !== WIZARD_STEPS.length - 1 || hasTriedContactSubmit) ? (
            <div className="notice error">{error}</div>
          ) : null}

          <div className="trainer-wizard-actions">
            <button className="btn ghost" disabled={currentStep === 0 || submitting} onClick={goBack} type="button">
              <ArrowLeft size={16} />
              Tillbaka
            </button>
            {isLastStep ? (
              <button className="btn dark" disabled={submitting} onClick={submitTrainerLead} type="button">
                <Send size={16} />
                {submitting ? "Matchar..." : "Matcha mig"}
              </button>
            ) : (
              <button className="btn dark" disabled={submitting} onClick={goNext} type="button">
                Nästa
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        </section>
      </form>
    </main>
  );
}
