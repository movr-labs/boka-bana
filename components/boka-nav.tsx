"use client";

import Link from "next/link";
import Image from "next/image";
import { CalendarDays, UserRound } from "lucide-react";

export default function BokaNav({ current }: { current?: "search" | "booking" | "bookings" }) {
  return (
    <header className="top-nav">
      <Link className="brand" href="/">
        <Image src="/bb-logo.png" alt="" className="brand-logo" width={42} height={42} priority />
        <span>Bokabana</span>
      </Link>
      <nav className="nav-links" aria-label="Huvudmeny">
        <Link className={current === "search" ? "active" : ""} href="/search">
          Sök bana
        </Link>
        <Link className={current === "bookings" ? "active" : ""} href="/bookings">
          <CalendarDays size={16} />
          Mina bokningar
        </Link>
        <span className="nav-user">
          <UserRound size={16} />
          Gäst
        </span>
      </nav>
    </header>
  );
}
