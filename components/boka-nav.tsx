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
  current?: "home" | "search" | "booking" | "bookings" | "login";
  variant?: "default" | "on-dark";
}) {
  const [user, setUser] = useState<PublicUser | null>(null);

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
        <Image src="/bb-logo.png" alt="" className="brand-logo" width={42} height={42} priority />
        <span>Bokabana</span>
      </Link>
      <nav className="nav-links" aria-label="Huvudmeny">
        <Link className={current === "search" || current === "home" ? "active" : ""} href="/search">
          Sök bana
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
