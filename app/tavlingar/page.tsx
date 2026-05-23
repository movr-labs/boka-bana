import type { Metadata } from "next";
import { ArrowUpRight, CalendarDays, MapPin, Trophy } from "lucide-react";
import BokaNav from "@/components/boka-nav";
import { TENNIS_EVENTS, TENNIS_EVENTS_SOURCE_URL, monthLabelForEvent } from "@/lib/tennis-events";

export const metadata: Metadata = {
  title: "Tävlingar & serier - Bokabana",
  description: "Aktuella tennistävlingar och serier från Svenska Tennisförbundets kalender.",
};

const groupedEvents = TENNIS_EVENTS.reduce<Record<string, typeof TENNIS_EVENTS>>((groups, event) => {
  const month = monthLabelForEvent(event);
  groups[month] = [...(groups[month] ?? []), event];
  return groups;
}, {});

const featuredEvent = TENNIS_EVENTS[0];

export default function TournamentsPage() {
  return (
    <main className="page-shell warm tournaments-page">
      <BokaNav current="tournaments" />

      <section className="tournaments-hero">
        <div className="container tournaments-hero-grid">
          <div className="tournaments-hero-copy">
            <p className="eyebrow">Svensk tävlingskalender</p>
            <h1>Tävlingar &amp; serier</h1>
            <p>
              Kommande tävlingar hämtade från Svenska Tennisförbundets kalender. Varje anmälan och detaljsida
              öppnas direkt hos Tennis.se.
            </p>
            <div className="tournaments-hero-actions">
              <a className="btn dark" href={TENNIS_EVENTS_SOURCE_URL} rel="noreferrer" target="_blank">
                <ArrowUpRight size={16} />
                Öppna källkalendern
              </a>
              <a className="btn ghost" href="#kalender">
                Visa listan
              </a>
            </div>
          </div>

          <a className="tournaments-feature" href={featuredEvent.href} rel="noreferrer" target="_blank">
            <span className="tournaments-feature-icon">
              <Trophy size={22} />
            </span>
            <span className="eyebrow">{featuredEvent.category}</span>
            <strong>{featuredEvent.title}</strong>
            <span className="tournaments-feature-meta">
              <CalendarDays size={16} />
              {featuredEvent.dateLabel}
            </span>
            <span className="tournaments-feature-meta">
              <MapPin size={16} />
              {featuredEvent.location}
            </span>
            <span className="tournaments-feature-link">
              Visa på Tennis.se
              <ArrowUpRight size={15} />
            </span>
          </a>
        </div>
      </section>

      <section className="container tournaments-summary" aria-label="Kalenderöversikt">
        <div>
          <strong>{TENNIS_EVENTS.length}</strong>
          <span>aktuella event</span>
        </div>
        <div>
          <strong>{new Set(TENNIS_EVENTS.map((event) => event.category)).size}</strong>
          <span>tävlingsformat</span>
        </div>
        <div>
          <strong>{new Set(TENNIS_EVENTS.map((event) => event.region)).size}</strong>
          <span>orter och nivåer</span>
        </div>
      </section>

      <section className="container tournaments-list-section" id="kalender">
        <div className="landing-section-head compact">
          <div>
            <p className="eyebrow">Kalender</p>
            <h2>Kommande starter</h2>
          </div>
        </div>

        <div className="tournaments-months">
          {Object.entries(groupedEvents).map(([month, events]) => (
            <section className="tournaments-month" key={month}>
              <h3>{month}</h3>
              <div className="tournaments-event-list">
                {events.map((event) => (
                  <a className="tournaments-event-card" href={event.href} key={event.id} rel="noreferrer" target="_blank">
                    <span className="tournaments-event-date">{event.dateLabel}</span>
                    <span className="tournaments-event-main">
                      <span className="eyebrow">{event.category}</span>
                      <strong>{event.title}</strong>
                      <span>
                        {event.location} · {event.region}
                      </span>
                    </span>
                    <span className="tournaments-event-action">
                      Tennis.se
                      <ArrowUpRight size={15} />
                    </span>
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}
