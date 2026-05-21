import type {
  AvailabilityResponse,
  MatchiAvailabilityOption,
  MatchiBookingQuery,
  MatchiFacilityConfig,
  MatchiFacilitySummary,
} from "@/lib/matchi-types";

const MATCHI_BASE_URL = "https://www.matchi.se";
const MATCHI_TIME_ZONE = "Europe/Stockholm";
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

const SPORTS = {
  "1": "Tennis",
  "5": "Padel",
} as const;

const FALLBACK_FACILITIES: MatchiFacilityConfig[] = [
  {
    slug: "kungsbackatk",
    name: "Kungsbacka Tennisklubb",
    defaultSportId: "1",
    defaultSportName: "Tennis",
  },
];

type FacilityMetadata = {
  facilityId: string;
  facilityName: string;
};

type FacilitySearchResult = {
  facilities: MatchiFacilitySummary[];
  totalResults: number;
};

export function listMatchiFacilities() {
  return FALLBACK_FACILITIES.map((facility) => ({ ...facility }));
}

export function resolveSport(sportId?: string) {
  const normalized = sportId === "5" ? "5" : "1";
  return {
    sportId: normalized,
    sportName: SPORTS[normalized],
  };
}

export async function fetchMatchiAvailability(input: {
  facilitySlug?: string;
  query?: string;
  date: string;
  sportId?: string;
  offset?: number;
  limit?: number;
}): Promise<AvailabilityResponse> {
  if (!isIsoDate(input.date)) {
    throw new Error("Invalid date");
  }

  const { sportId, sportName } = resolveSport(input.sportId);
  const offset = normalizeOffset(input.offset);
  const limit = normalizeLimit(input.limit);
  const fetchedAt = new Date().toISOString();

  if (input.facilitySlug) {
    return fetchSingleFacilityAvailability({
      facilitySlug: input.facilitySlug,
      date: input.date,
      sportId,
      sportName,
      fetchedAt,
    });
  }

  const search = await findMatchiFacilities({
    query: input.query ?? "",
    date: input.date,
    sportId,
    sportName,
    offset,
    limit,
  });

  const optionGroups = await Promise.all(
    search.facilities.map((facility) =>
      fetchFacilitySlots({
        facility,
        date: input.date,
        sportId,
        sportName,
        fetchedAt,
      }).catch(() => [] as MatchiAvailabilityOption[]),
    ),
  );

  return {
    facility: search.facilities[0]
      ? {
          slug: search.facilities[0].slug,
          name: search.facilities[0].name,
          facilityId: search.facilities[0].facilityId,
          defaultSportId: sportId,
          defaultSportName: sportName,
        }
      : undefined,
    facilities: search.facilities,
    options: optionGroups.flat().sort(compareOptions),
    totalResults: search.totalResults,
    offset,
    limit,
    query: input.query ?? "",
    sportId,
    sportName,
    fetchedAt,
  };
}

async function fetchSingleFacilityAvailability(input: {
  facilitySlug: string;
  date: string;
  sportId: string;
  sportName: string;
  fetchedAt: string;
}): Promise<AvailabilityResponse> {
  const facilityHtml = await fetchText(
    `${MATCHI_BASE_URL}/facilities/${input.facilitySlug}?date=${encodeURIComponent(input.date)}&lang=en_US`,
  );
  const fallback = FALLBACK_FACILITIES.find((facility) => facility.slug === input.facilitySlug) ?? {
    slug: input.facilitySlug,
    name: input.facilitySlug,
    defaultSportId: input.sportId,
    defaultSportName: input.sportName,
  };
  const metadata = parseFacilityPageHtml(facilityHtml, fallback);
  const summary: MatchiFacilitySummary = {
    slug: input.facilitySlug,
    facilityId: metadata.facilityId,
    name: metadata.facilityName,
    city: "",
    imageUrl: null,
    sportId: input.sportId,
    sportName: input.sportName,
    bookableCourts: null,
  };
  const options = await fetchFacilitySlots({
    facility: summary,
    date: input.date,
    sportId: input.sportId,
    sportName: input.sportName,
    fetchedAt: input.fetchedAt,
  });

  return {
    facility: {
      ...fallback,
      facilityId: metadata.facilityId,
      name: metadata.facilityName,
    },
    facilities: [summary],
    options,
    totalResults: 1,
    offset: 0,
    limit: 1,
    query: metadata.facilityName,
    sportId: input.sportId,
    sportName: input.sportName,
    fetchedAt: input.fetchedAt,
  };
}

async function findMatchiFacilities(input: {
  query: string;
  date: string;
  sportId: string;
  sportName: string;
  offset: number;
  limit: number;
}): Promise<FacilitySearchResult> {
  const body = new URLSearchParams({
    lat: "",
    lng: "",
    outdoors: "",
    offset: String(input.offset),
    max: String(input.limit),
    sport: input.sportId,
    date: formatMatchiSearchDate(input.date),
    q: input.query,
  });
  const html = await fetchText(`${MATCHI_BASE_URL}/book/findFacilities`, {
    method: "POST",
    body,
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "x-requested-with": "XMLHttpRequest",
    },
  });

  const facilities = parseFindFacilitiesHtml(html, input.sportId, input.sportName);
  return {
    facilities,
    totalResults: parseTotalResults(html) || facilities.length,
  };
}

async function fetchFacilitySlots(input: {
  facility: MatchiFacilitySummary;
  date: string;
  sportId: string;
  sportName: string;
  fetchedAt: string;
}): Promise<MatchiAvailabilityOption[]> {
  const availabilityHtml = await fetchText(
    `${MATCHI_BASE_URL}/book/listSlots?wl=&facility=${encodeURIComponent(
      input.facility.facilityId,
    )}&date=${encodeURIComponent(input.date)}&sport=${encodeURIComponent(input.sportId)}&week=&year=`,
  );

  return parseAvailabilityHtml(availabilityHtml, {
    facilitySlug: input.facility.slug,
    facilityId: input.facility.facilityId,
    facilityName: input.facility.name,
    sportId: input.sportId,
    sportName: input.sportName,
    sourceFetchedAt: input.fetchedAt,
  });
}

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      "accept-language": "en-US,en;q=0.9,sv-SE;q=0.8,sv;q=0.7",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Matchi request failed (${response.status})`);
  }

  return response.text();
}

function parseFindFacilitiesHtml(
  html: string,
  sportId: string,
  sportName: string,
): MatchiFacilitySummary[] {
  const panels = html.match(/<div class="panel panel-default[\s\S]*?(?=<div class="panel panel-default|<!-- PAGINATION -->|$)/g) ?? [];
  const facilities: MatchiFacilitySummary[] = [];
  const seen = new Set<string>();

  for (const panel of panels) {
    const slug = captureFirst(panel, /<a href="\/facilities\/([^"?]+)[^"]*">/i);
    const facilityId = captureFirst(panel, /<div id="slots_(\d+)"/i);
    if (!slug || !facilityId || seen.has(`${sportId}:${slug}`)) continue;

    seen.add(`${sportId}:${slug}`);
    facilities.push({
      slug,
      facilityId,
      name:
        cleanText(captureFirst(panel, /<h3[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)) ||
        slug,
      city: cleanText(captureFirst(panel, /<p class="text-muted text-sm">[\s\S]*?<\/i>\s*([\s\S]*?)<\/p>/i)),
      imageUrl: normalizeImageUrl(captureFirst(panel, /<img[^>]+src="([^"]+)"/i)),
      sportId,
      sportName,
      bookableCourts: parsePositiveInt(captureFirst(panel, /<strong>(\d+)<\/strong>\s*bookable courts/i) ?? ""),
    });
  }

  return facilities;
}

function parseFacilityPageHtml(
  html: string,
  facility: Pick<MatchiFacilityConfig, "slug" | "name">,
): FacilityMetadata {
  const facilityId =
    captureFirst(html, /\/book\/listSlots\?wl=.*?facility=(\d+)/) ??
    captureFirst(html, /facilityId" class="form-control" value="(\d+)"/) ??
    captureFirst(html, /facilityId:\s*"(\d+)"/) ??
    captureFirst(html, /facility=(\d+)/);
  if (!facilityId) {
    throw new Error(`Could not extract Matchi facility id for ${facility.slug}`);
  }

  const facilityName =
    cleanText(captureFirst(html, /<h2[^>]*>\s*([\s\S]*?)\s*<\/h2>/i)) ||
    cleanText(captureFirst(html, /<title>\s*([\s\S]*?)\s*<\/title>/i)) ||
    facility.name;

  return {
    facilityId,
    facilityName: facilityName.replace(/\s*\|\s*MATCHi.*$/i, "") || facility.name,
  };
}

function parseAvailabilityHtml(
  html: string,
  meta: {
    facilitySlug: string;
    facilityId: string;
    facilityName: string;
    sportId: string;
    sportName: string;
    sourceFetchedAt: string;
  },
): MatchiAvailabilityOption[] {
  const options: MatchiAvailabilityOption[] = [];
  const itemPattern = /<li class="list-group-item">([\s\S]*?)<\/li>/gi;

  let match: RegExpExecArray | null;
  while ((match = itemPattern.exec(html)) !== null) {
    const block = match[1] ?? "";
    if (!block.includes("/login/auth?returnUrl=")) continue;

    const courtName = cleanText(captureFirst(block, /<td width="45%">([\s\S]*?)<\/td>/i));
    const fallbackDuration = parseDurationMinutes(
      captureFirst(block, /<td width="15%">\s*([^<]+?)\s*<\/td>/i) ?? "",
    );
    const sportName =
      cleanText(
        captureFirst(block, /<td width="20%">[\s\S]*?<div>\s*([^<]+?)\s*<\/div>/i),
      ) || meta.sportName;
    const surfaceName =
      cleanText(
        captureFirst(
          block,
          /<td width="20%">[\s\S]*?<div>\s*[^<]*?\s*<\/div>\s*<div><small>([\s\S]*?)<\/small><\/div>/i,
        ),
      ) || null;
    const href = decodeHtmlEntities(captureFirst(block, /<a[^>]*href="([^"]+)"/i) ?? "");
    const bookingLink = extractBookingLink(href);
    if (!courtName || !bookingLink?.slotId) continue;

    const startEpoch = parsePositiveInt(bookingLink.query.start);
    const endEpoch = parsePositiveInt(bookingLink.query.end);
    const date = startEpoch ? formatDateFromEpoch(startEpoch) : "";
    const start = startEpoch ? formatTimeFromEpoch(startEpoch) : "";
    const end = endEpoch ? formatTimeFromEpoch(endEpoch) : "";
    const durationMinutes =
      startEpoch && endEpoch && endEpoch > startEpoch
        ? Math.round((endEpoch - startEpoch) / 60_000)
        : fallbackDuration;
    if (!date || !start || !end || durationMinutes <= 0) continue;

    options.push({
      facilitySlug: meta.facilitySlug,
      facilityId: bookingLink.query.facilityId || meta.facilityId,
      facilityName: meta.facilityName,
      sportId: bookingLink.query.sportIds || meta.sportId,
      sportName,
      slotId: bookingLink.slotId,
      courtName,
      surfaceName,
      date,
      start,
      end,
      durationMinutes,
      bookingPath: bookingLink.path,
      bookingQuery: bookingLink.query,
      sourceFetchedAt: meta.sourceFetchedAt,
      mockPrice: calculateMockPrice(start, durationMinutes),
    });
  }

  return options.sort(compareOptions);
}

function extractBookingLink(
  href: string,
): { path: string; query: MatchiBookingQuery; slotId: string } | null {
  if (!href) return null;
  try {
    const loginUrl = new URL(href, MATCHI_BASE_URL);
    const returnUrl = loginUrl.searchParams.get("returnUrl") ?? "";
    if (!returnUrl) return null;
    const bookingUrl = new URL(returnUrl, MATCHI_BASE_URL);
    const query: MatchiBookingQuery = {};
    for (const [key, value] of bookingUrl.searchParams.entries()) {
      query[key] = value;
    }

    return {
      path: bookingUrl.pathname,
      query,
      slotId: query.slotIds ?? query.slotId ?? "",
    };
  } catch {
    return null;
  }
}

export function calculateMockPrice(start: string, durationMinutes: number) {
  const hour = Number(start.slice(0, 2));
  const base = hour >= 17 && hour <= 20 ? 360 : hour <= 9 || hour >= 21 ? 220 : 280;
  return Math.round(base * (durationMinutes / 60));
}

export function isIsoDate(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function compareOptions(left: MatchiAvailabilityOption, right: MatchiAvailabilityOption) {
  return (
    left.date.localeCompare(right.date) ||
    left.start.localeCompare(right.start) ||
    left.facilityName.localeCompare(right.facilityName) ||
    left.courtName.localeCompare(right.courtName)
  );
}

function formatMatchiSearchDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${month}-${day}-${year}`;
}

function parseTotalResults(html: string): number {
  return parsePositiveInt(captureFirst(html, /<span class="results-label">(\d+)\s+results<\/span>/i) ?? "") ?? 0;
}

function normalizeImageUrl(raw?: string | null): string | null {
  const value = decodeHtmlEntities(String(raw ?? "")).trim();
  if (!value) return null;
  return value.startsWith("//") ? `https:${value}` : value;
}

function normalizeOffset(value?: number): number {
  if (!Number.isFinite(value) || !value || value < 0) return 0;
  return Math.floor(value);
}

function normalizeLimit(value?: number): number {
  if (!Number.isFinite(value) || !value || value < 1) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.floor(value));
}

function parseDurationMinutes(raw: string): number {
  const match = String(raw ?? "").match(/(\d+)/);
  if (!match) return 0;
  return Number(match[1] ?? 0);
}

function parsePositiveInt(raw?: string): number | null {
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

function formatDateFromEpoch(epochMs: number): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: MATCHI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(epochMs));
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return year && month && day ? `${year}-${month}-${day}` : "";
}

function formatTimeFromEpoch(epochMs: number): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: MATCHI_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(epochMs));
  const hour = parts.find((part) => part.type === "hour")?.value ?? "";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "";
  return hour && minute ? `${hour}:${minute}` : "";
}

function captureFirst(html: string, pattern: RegExp): string | null {
  const match = pattern.exec(html);
  return match?.[1] ? String(match[1]) : null;
}

function cleanText(raw?: string | null): string {
  return decodeHtmlEntities(String(raw ?? ""))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;?/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
