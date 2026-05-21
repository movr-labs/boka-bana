import { NextResponse } from "next/server";
import { createSessionToken, hashPassword, sessionCookieOptions, SESSION_COOKIE, verifyPassword } from "@/lib/auth";
import { createUser, findUserByEmail, publicUser } from "@/lib/storage";

export const dynamic = "force-dynamic";

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const email = cleanString(body.email).toLowerCase();
    const password = cleanString(body.password);
    const name = cleanString(body.name);
    const mode = cleanString(body.mode) || "login";

    if (!email || !password) {
      return NextResponse.json({ message: "Fyll i e-post och lösenord." }, { status: 400 });
    }

    if (mode === "signup") {
      if (!name) {
        return NextResponse.json({ message: "Fyll i namn för att skapa konto." }, { status: 400 });
      }
      if (password.length < 8) {
        return NextResponse.json({ message: "Lösenordet behöver vara minst 8 tecken." }, { status: 400 });
      }
      const existing = await findUserByEmail(email);
      if (existing) {
        return NextResponse.json({ message: "E-postadressen används redan." }, { status: 409 });
      }
      const user = await createUser({ name, email, passwordHash: hashPassword(password) });
      const response = NextResponse.json({ user: publicUser(user) });
      response.cookies.set(SESSION_COOKIE, createSessionToken(user.id), sessionCookieOptions());
      return response;
    }

    const user = await findUserByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ message: "Fel e-post eller lösenord." }, { status: 401 });
    }

    const response = NextResponse.json({ user: publicUser(user) });
    response.cookies.set(SESSION_COOKIE, createSessionToken(user.id), sessionCookieOptions());
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kunde inte logga in.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
