"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { CalendarDays, LogOut, UserRound } from "lucide-react";

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
        <Link className={current === "search" || current === "home" ? "active" : ""} href="/search">
          Sök bana
        </Link>
        <Link className={current === "trainers" ? "active" : ""} href="/tranare">
          Sök tränare
        </Link>
        <Link className={current === "tournaments" ? "active" : ""} href="/tavlingar">
          Tävlingar
        </Link>
        <Link className={current === "bookings" ? "active" : ""} href="/bookings">
          <CalendarDays size={16} />
          Mina bokningar
        </Link>
        {user ? (
          <button className="nav-user nav-button" onClick={logout} type="button">
            <LogOut size={16} />
            {user.name}
          </button>
        ) : (
          <Link className={current === "login" ? "active" : "nav-user"} href="/login">
            <UserRound size={16} />
            Logga in
          </Link>
        )}
      </nav>
    </header>
  );
}
