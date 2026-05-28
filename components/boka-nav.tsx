"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { CalendarDays, Dumbbell, LogOut, Search, Trophy, UserRound } from "lucide-react";

type PublicUser = {
  id: string;
  name: string;
  email: string;
};

export default function BokaNav({
  current,
  variant = "default",
}: {
  current?: "home" | "search" | "booking" | "bookings" | "login" | "tournaments" | "trainers";
  variant?: "default" | "on-dark";
}) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const logoSrc = variant === "on-dark" ? "/bb-logo-white.png?v=20260528" : "/bb-logo.png?v=20260528";
  const searchActive = current === "search" || current === "home";

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { user?: PublicUser } | null) => {
        if (active) setUser(body?.user ?? null);
      })
      .catch(() => {
        if (active) setUser(null);
      });
    return () => {
      active = false;
    };
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    setUser(null);
    window.location.href = "/";
  }

  return (
    <header className={`top-nav ${variant === "on-dark" ? "on-dark" : ""}`}>
      <Link className="brand" href="/">
        <Image src={logoSrc} alt="Bokabana" className="brand-logo" width={153} height={102} priority />
      </Link>
      <nav className="nav-links" aria-label="Huvudmeny">
        <Link
          className={searchActive ? "active" : ""}
          href="/search"
          aria-current={current === "search" ? "page" : undefined}
        >
          <Search size={16} />
          <span>Sök bana</span>
        </Link>
        <Link
          className={current === "trainers" ? "active" : ""}
          href="/tranare"
          aria-current={current === "trainers" ? "page" : undefined}
        >
          <Dumbbell size={16} />
          <span>Sök tränare</span>
        </Link>
        <Link
          className={current === "tournaments" ? "active" : ""}
          href="/tavlingar"
          aria-current={current === "tournaments" ? "page" : undefined}
        >
          <Trophy size={16} />
          <span>Tävlingar</span>
        </Link>
        <Link
          className={current === "bookings" ? "active" : ""}
          href="/bookings"
          aria-current={current === "bookings" ? "page" : undefined}
        >
          <CalendarDays size={16} />
          <span>Mina bokningar</span>
        </Link>
        {user ? (
          <button className="nav-user nav-button" onClick={logout} type="button">
            <LogOut size={16} />
            <span>{user.name}</span>
          </button>
        ) : (
          <Link
            className={current === "login" ? "nav-user active" : "nav-user"}
            href="/login"
            aria-current={current === "login" ? "page" : undefined}
          >
            <UserRound size={16} />
            <span>Logga in</span>
          </Link>
        )}
      </nav>
    </header>
  );
}
