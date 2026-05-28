import { NextResponse } from "next/server";
import { saveTrainerLead, type TrainerLead } from "@/lib/storage";

export const dynamic = "force-dynamic";

const SPORTS = ["Tennis", "Padel"] as const;
const LEVELS = ["Nybörjare", "Motionär", "Medel", "Avancerad", "Junior"] as const;

type Sport = (typeof SPORTS)[number];
type Level = (typeof LEVELS)[number];

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isSport(value: string): value is Sport {
  return SPORTS.includes(value as Sport);
}

function isLevel(value: string): value is Level {
  return LEVELS.includes(value as Level);
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone: string) {
  return phone.replace(/\D/g, "").length >= 7;
}

function trainerTypeFor(level: Level) {
  if (level === "Junior") return "juniortränare";
  if (level === "Nybörjare") return "introduktionstränare";
  if (level === "Avancerad") return "tävlingsinriktad tränare";
  return "tekniktränare";
}

function buildMatchSummary(input: { sport: Sport; city: string; level: Level }) {
  return `Vi matchar dig med en ${trainerTypeFor(input.level)} för ${input.sport.toLowerCase()} på ${input.level.toLowerCase()}nivå i ${input.city}.`;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  const sport = cleanString(body?.sport);
  const city = cleanString(body?.city);
  const level = cleanString(body?.level);
  const goal = cleanString(body?.goal);
  const availability = cleanString(body?.availability);
  const name = cleanString(body?.name);
  const email = cleanString(body?.email).toLowerCase();
  const phone = cleanString(body?.phone);

  if (!isSport(sport)) {
    return NextResponse.json({ message: "Välj sport." }, { status: 400 });
  }
  if (!city) {
    return NextResponse.json({ message: "Välj ort." }, { status: 400 });
  }
  if (!isLevel(level)) {
    return NextResponse.json({ message: "Välj nivå." }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ message: "Fyll i namn." }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ message: "Ange en giltig e-postadress." }, { status: 400 });
  }
  if (!isValidPhone(phone)) {
    return NextResponse.json({ message: "Ange ett giltigt telefonnummer." }, { status: 400 });
  }

  const matchSummary = buildMatchSummary({ sport, city, level });
  const lead = await saveTrainerLead({
    sport,
    city,
    level,
    goal,
    availability,
    contact: { name, email, phone },
    matchSummary,
  });

  return NextResponse.json({ lead: publicTrainerLead(lead) });
}

function publicTrainerLead(lead: TrainerLead) {
  return {
    id: lead.id,
    createdAt: lead.createdAt,
    sport: lead.sport,
    city: lead.city,
    level: lead.level,
    goal: lead.goal,
    availability: lead.availability,
    contact: lead.contact,
    matchSummary: lead.matchSummary,
  };
}
