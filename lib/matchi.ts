import type {
  AvailabilityResponse,
  MatchiAvailabilityOption,
  MatchiBookingQuery,
  MatchiDirectoryBucket,
  MatchiDirectorySummary,
  MatchiFacilityConfig,
  MatchiFacilityMapResponse,
  MatchiFacilitySummary,
} from "@/lib/matchi-types";

const MATCHI_BASE_URL = "https://www.matchi.se";
const MATCHI_TIME_ZONE = "Europe/Stockholm";
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;
const DIRECTORY_PAGE_LIMIT = MAX_LIMIT;
const MAX_DIRECTORY_PAGES = 30;
const MAX_BOUNDS_SEARCH_PAGES_PER_POINT = 5;
const COORDINATE_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const MISSING_COORDINATE_CACHE_TTL_MS = 1000 * 60 * 60;

const SPORTS = {
  "1": "Tennis",
  "5": "Padel",
} as const;

const DIRECTORY_CITY_NAMES = [
  "Stockholm",
  "Göteborg",
  "Malmö",
  "Uppsala",
  "Linköping",
  "Västerås",
  "Lund",
  "Helsingborg",
  "Örebro",
  "Umeå",
];

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
  latitude: number | null;
  longitude: number | null;
};

type FacilitySearchResult = {
  facilities: MatchiFacilitySummary[];
  totalResults: number;
};

type FacilitySearchPoint = {
  latitude: number;
  longitude: number;
};

type CoordinateWindow = {
  time: string;
  durationMinutes: number;
};

type FacilityBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

type CoordinateCacheEntry = {
  latitude: number | null;
  longitude: number | null;
  expiresAt: number;
};

const facilityCoordinateCache = new Map<string, CoordinateCacheEntry>();

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

export async function fetchMatchiDirectorySummary(input?: {
  date?: string;
  cities?: string[];
}): Promise<MatchiDirectorySummary> {
  const date = isIsoDate(input?.date) ? input.date : tomorrowISO();
  const cityNames = input?.cities?.length ? input.cities : DIRECTORY_CITY_NAMES;
  const fetchedAt = new Date().toISOString();
  const sportEntries = Object.entries(SPORTS);
  const sportFacilities = await Promise.all(
    sportEntries.map(async ([sportId, sportName]) => {
      const facilities = await fetchAllMatchiFacilities({
        date,
        sportId,
        sportName,
      });
      return [sportId, facilities] as const;
    }),
  );

  const bySport = Object.fromEntries(
    sportFacilities.map(([sportId, facilities]) => [sportId, createDirectoryBucket(facilities, cityNames)]),
  );
  const combinedFacilities = sportFacilities.flatMap(([, facilities]) => facilities);

  return {
    ...createDirectoryBucket(combinedFacilities, cityNames),
    bySport,
    fetchedAt,
  };
}

export async function fetchMatchiAvailability(input: {
  facilitySlug?: string;
  query?: string;
  date: string;
  sportId?: string;
  offset?: number;
  limit?: number;
  includeCoordinates?: boolean;
  coordinateWindow?: CoordinateWindow;
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
  const options = optionGroups.flat().sort(compareOptions);
  const facilities = input.includeCoordinates
    ? await enrichFacilitiesWithCoordinates(
        search.facilities,
        input.date,
        sportId,
        facilitySlugsForCoordinates(options, input.coordinateWindow),
      )
    : search.facilities;

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
    facilities,
    options,
    totalResults: search.totalResults,
    offset,
    limit,
    query: input.query ?? "",
    sportId,
    sportName,
    fetchedAt,
  };
}

export async function fetchMatchiFacilitiesForMap(input: {
  query?: string;
  date: string;
  sportId?: string;
  latitude?: number | null;
  longitude?: number | null;
  bounds?: FacilityBounds | null;
  offset?: number;
  limit?: number;
}): Promise<MatchiFacilityMapResponse> {
  if (!isIsoDate(input.date)) {
    throw new Error("Invalid date");
  }

  const { sportId, sportName } = resolveSport(input.sportId);
  const offset = normalizeOffset(input.offset);
  const limit = normalizeLimit(input.limit);
  const fetchedAt = new Date().toISOString();
  const query = input.query ?? "";
  const search =
    input.bounds && !query.trim()
      ? await findMatchiFacilitiesInBounds({
          date: input.date,
          sportId,
          sportName,
          bounds: input.bounds,
          center:
            input.latitude != null && input.longitude != null
              ? {
                  latitude: input.latitude,
                  longitude: input.longitude,
                }
              : null,
        })
      : await findMatchiFacilities({
          query,
          date: input.date,
          sportId,
          sportName,
          offset,
          limit,
          latitude: input.latitude,
          longitude: input.longitude,
        });
  const facilitiesWithCoordinates = await enrichFacilitiesWithCoordinates(
    search.facilities,
    input.date,
    sportId,
    new Set(search.facilities.map((facility) => facility.slug)),
  );
  const bounds = input.bounds;
  const facilities = bounds
    ? facilitiesWithCoordinates.filter((facility) => facilityIsInBounds(facility, bounds))
    : facilitiesWithCoordinates;

  return {
    facilities,
    totalResults: search.totalResults,
    offset,
    limit,
    query,
    sportId,
    sportName,
    fetchedAt,
  };
}

async function fetchAllMatchiFacilities(input: {
  query?: string;
  date: string;
  sportId: string;
  sportName: string;
}): Promise<MatchiFacilitySummary[]> {
  const facilities: MatchiFacilitySummary[] = [];
  let offset = 0;
  let expectedTotal = 0;

  for (let page = 0; page < MAX_DIRECTORY_PAGES; page += 1) {
    const result = await findMatchiFacilities({
      query: input.query ?? "",
      date: input.date,
      sportId: input.sportId,
      sportName: input.sportName,
      offset,
      limit: DIRECTORY_PAGE_LIMIT,
    });

    expectedTotal = Math.max(expectedTotal, result.totalResults);
    facilities.push(...result.facilities);

    if (!result.facilities.length || offset + DIRECTORY_PAGE_LIMIT >= expectedTotal) {
      break;
    }

    offset += DIRECTORY_PAGE_LIMIT;
  }

  return facilities;
}

function createDirectoryBucket(
  facilities: MatchiFacilitySummary[],
  cityNames: string[],
): MatchiDirectoryBucket {
  const bySlug = new Map<
    string,
    {
      facility: MatchiFacilitySummary;
      courtCount: number;
      cityKey: string;
    }
  >();

  for (const facility of facilities) {
    const current = bySlug.get(facility.slug);
    if (current) {
      current.courtCount += facility.bookableCourts ?? 0;
      continue;
    }

    bySlug.set(facility.slug, {
      facility,
      courtCount: facility.bookableCourts ?? 0,
      cityKey: normalizeSwedishText(facility.city),
    });
  }

  const uniqueFacilities = Array.from(bySlug.values());
  const totalCourts = uniqueFacilities.reduce((sum, item) => sum + item.courtCount, 0);

  return {
    totalClubs: uniqueFacilities.length,
    totalCourts: totalCourts > 0 ? totalCourts : null,
    cities: cityNames.map((name) => {
      const cityKey = normalizeSwedishText(name);
      return {
        name,
        query: name,
        clubs: uniqueFacilities.filter((item) => item.cityKey.includes(cityKey)).length,
      };
    }),
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
    latitude: metadata.latitude,
    longitude: metadata.longitude,
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
  latitude?: number | null;
  longitude?: number | null;
}): Promise<FacilitySearchResult> {
  const queries = buildFacilitySearchQueries(input.query);

  for (const query of queries) {
    const result = await fetchMatchiFacilitiesPage({
      ...input,
      query,
    });
    if (result.facilities.length || query === queries[queries.length - 1]) {
      return result;
    }
  }

  return {
    facilities: [],
    totalResults: 0,
  };
}

async function findMatchiFacilitiesInBounds(input: {
  date: string;
  sportId: string;
  sportName: string;
  bounds: FacilityBounds;
  center: FacilitySearchPoint | null;
}): Promise<FacilitySearchResult> {
  const bySlug = new Map<string, MatchiFacilitySummary>();
  const points = buildBoundsSearchPoints(input.bounds, input.center);

  for (const point of points) {
    for (let page = 0; page < MAX_BOUNDS_SEARCH_PAGES_PER_POINT; page += 1) {
      const offset = page * MAX_LIMIT;
      const result = await findMatchiFacilities({
        query: "",
        date: input.date,
        sportId: input.sportId,
        sportName: input.sportName,
        offset,
        limit: MAX_LIMIT,
        latitude: point.latitude,
        longitude: point.longitude,
      }).catch(() => ({ facilities: [], totalResults: 0 }));

      for (const facility of result.facilities) {
        bySlug.set(`${facility.sportId}:${facility.slug}`, facility);
      }

      if (!result.facilities.length || offset + MAX_LIMIT >= result.totalResults) {
        break;
      }
    }
  }

  const facilities = Array.from(bySlug.values());
  return {
    facilities,
    totalResults: facilities.length,
  };
}

async function fetchMatchiFacilitiesPage(input: {
  query: string;
  date: string;
  sportId: string;
  sportName: string;
  offset: number;
  limit: number;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<FacilitySearchResult> {
  const body = new URLSearchParams({
    lat: input.latitude != null ? String(input.latitude) : "",
    lng: input.longitude != null ? String(input.longitude) : "",
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

async function enrichFacilitiesWithCoordinates(
  facilities: MatchiFacilitySummary[],
  date: string,
  sportId: string,
  facilitySlugs: Set<string>,
): Promise<MatchiFacilitySummary[]> {
  const enriched: MatchiFacilitySummary[] = [];

  for (const facility of facilities) {
    if (!facilitySlugs.has(facility.slug)) {
      enriched.push(facility);
      continue;
    }

    const coordinates = await fetchFacilityCoordinates(facility.slug, date, sportId);
    enriched.push({
      ...facility,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    });
  }

  return enriched;
}

async function fetchFacilityCoordinates(slug: string, date: string, sportId: string) {
  const cacheKey = `${sportId}:${slug}`;
  const cached = facilityCoordinateCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      latitude: cached.latitude,
      longitude: cached.longitude,
    };
  }

  try {
    const html = await fetchText(
      `${MATCHI_BASE_URL}/facilities/${slug}?date=${encodeURIComponent(date)}&sport=${encodeURIComponent(sportId)}&lang=en_US`,
    );
    const coordinates = parseFacilityCoordinates(html);
    const hasCoordinates = coordinates.latitude != null && coordinates.longitude != null;
    facilityCoordinateCache.set(cacheKey, {
      ...coordinates,
      expiresAt: Date.now() + (hasCoordinates ? COORDINATE_CACHE_TTL_MS : MISSING_COORDINATE_CACHE_TTL_MS),
    });
    return coordinates;
  } catch {
    return {
      latitude: null,
      longitude: null,
    };
  }
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

  if (response.status === 429) {
    await delay(700);
    const retry = await fetch(url, {
      cache: "no-store",
      ...init,
      headers: {
        "accept-language": "en-US,en;q=0.9,sv-SE;q=0.8,sv;q=0.7",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
        ...(init?.headers ?? {}),
      },
    });

    if (!retry.ok) {
      throw new Error(`Matchi request failed (${retry.status})`);
    }

    return retry.text();
  }

  if (!response.ok) {
    throw new Error(`Matchi request failed (${response.status})`);
  }

  return response.text();
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
      latitude: null,
      longitude: null,
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
    ...parseFacilityCoordinates(html),
  };
}

function parseFacilityCoordinates(html: string): Pick<FacilityMetadata, "latitude" | "longitude"> {
  const latLngMatch = html.match(/latLng\(\s*(-?\d+(?:[.,]\d+)?)\s*,\s*(-?\d+(?:[.,]\d+)?)/i);
  const latitude =
    parseCoordinate(captureMetaCoordinate(html, "latitude")) ??
    parseCoordinate(captureFirst(html, /latitude["'][^>]*content=["'](-?\d+(?:[.,]\d+)?)/i)) ??
    parseCoordinate(latLngMatch?.[1]);
  const longitude =
    parseCoordinate(captureMetaCoordinate(html, "longitude")) ??
    parseCoordinate(captureFirst(html, /longitude["'][^>]*content=["'](-?\d+(?:[.,]\d+)?)/i)) ??
    parseCoordinate(latLngMatch?.[2]);

  return {
    latitude,
    longitude,
  };
}

function captureMetaCoordinate(html: string, key: "latitude" | "longitude"): string | null {
  const tag = html.match(new RegExp(`<meta[^>]*(?:${key})[^>]*>`, "i"))?.[0] ?? "";
  return captureFirst(tag, /content=["']([^"']+)["']/i);
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
  const itemPattern = /<li\b[^>]*class="[^"]*\blist-group-item\b[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;

  let match: RegExpExecArray | null;
  while ((match = itemPattern.exec(html)) !== null) {
    const block = match[1] ?? "";
    if (!block.includes("/login/auth?returnUrl=") && !block.includes("/book/index?")) continue;

    const courtName = cleanText(captureFirst(block, /<td\b[^>]*width=["']?45%["']?[^>]*>([\s\S]*?)<\/td>/i));
    const fallbackDuration = parseDurationMinutes(
      captureFirst(block, /<td\b[^>]*width=["']?15%["']?[^>]*>\s*([^<]+?)\s*<\/td>/i) ?? "",
    );
    const sportName =
      cleanText(
        captureFirst(block, /<td\b[^>]*width=["']?20%["']?[^>]*>[\s\S]*?<div>\s*([^<]+?)\s*<\/div>/i),
      ) || meta.sportName;
    const surfaceName =
      cleanText(
        captureFirst(
          block,
          /<td\b[^>]*width=["']?20%["']?[^>]*>[\s\S]*?<div>\s*[^<]*?\s*<\/div>\s*<div><small>([\s\S]*?)<\/small><\/div>/i,
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
    const url = new URL(href, MATCHI_BASE_URL);
    const returnUrl = url.searchParams.get("returnUrl");
    const bookingUrl = returnUrl ? new URL(returnUrl, MATCHI_BASE_URL) : url;
    if (!bookingUrl.pathname.includes("/book/index")) return null;
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

function tomorrowISO() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function compareOptions(left: MatchiAvailabilityOption, right: MatchiAvailabilityOption) {
  return (
    left.date.localeCompare(right.date) ||
    left.start.localeCompare(right.start) ||
    left.facilityName.localeCompare(right.facilityName) ||
    left.courtName.localeCompare(right.courtName)
  );
}

function facilitySlugsForCoordinates(options: MatchiAvailabilityOption[], window?: CoordinateWindow) {
  const slugs = new Set<string>();

  for (const option of options) {
    if (!window || optionMatchesWindow(option, window)) {
      slugs.add(option.facilitySlug);
    }
  }

  return slugs;
}

function optionMatchesWindow(option: MatchiAvailabilityOption, window: CoordinateWindow) {
  const start = parseTimeMinutes(option.start);
  const from = parseTimeMinutes(window.time);
  const durationMinutes = Math.max(30, window.durationMinutes || 60);
  return start >= from && start < from + durationMinutes;
}

function facilityIsInBounds(facility: MatchiFacilitySummary, bounds: FacilityBounds) {
  if (facility.latitude == null || facility.longitude == null) return false;
  const latitudeMatches = facility.latitude >= bounds.south && facility.latitude <= bounds.north;
  const longitudeMatches =
    bounds.west <= bounds.east
      ? facility.longitude >= bounds.west && facility.longitude <= bounds.east
      : facility.longitude >= bounds.west || facility.longitude <= bounds.east;
  return latitudeMatches && longitudeMatches;
}

function buildBoundsSearchPoints(bounds: FacilityBounds, center: FacilitySearchPoint | null) {
  const latitudePadding = Math.max(0.01, (bounds.north - bounds.south) * 0.08);
  const south = clampLatitude(bounds.south + latitudePadding);
  const north = clampLatitude(bounds.north - latitudePadding);
  const middleLatitude = clampLatitude(center?.latitude ?? (bounds.north + bounds.south) / 2);
  const longitudeValues = buildLongitudeSamples(bounds, center?.longitude ?? midpointLongitude(bounds.west, bounds.east));
  const candidates: FacilitySearchPoint[] = [];

  if (center) candidates.push(center);
  for (const latitude of [south, middleLatitude, north]) {
    for (const longitude of longitudeValues) {
      candidates.push({ latitude, longitude });
    }
  }

  const seen = new Set<string>();
  return candidates.filter((point) => {
    const key = `${point.latitude.toFixed(4)}:${point.longitude.toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildLongitudeSamples(bounds: FacilityBounds, centerLongitude: number) {
  if (bounds.west <= bounds.east) {
    const padding = Math.max(0.01, (bounds.east - bounds.west) * 0.08);
    return [bounds.west + padding, centerLongitude, bounds.east - padding].map(normalizeLongitude);
  }

  const westToDateLine = 180 - bounds.west;
  const dateLineToEast = bounds.east + 180;
  const span = westToDateLine + dateLineToEast;
  const padding = Math.max(0.01, span * 0.08);
  return [
    normalizeLongitude(bounds.west + padding),
    normalizeLongitude(centerLongitude),
    normalizeLongitude(bounds.east - padding),
  ];
}

function midpointLongitude(west: number, east: number) {
  if (west <= east) return normalizeLongitude((west + east) / 2);
  return normalizeLongitude(west + (180 - west + east + 180) / 2);
}

function clampLatitude(latitude: number) {
  return Math.max(-85, Math.min(85, latitude));
}

function normalizeLongitude(longitude: number) {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

function formatMatchiSearchDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${month}-${day}-${year}`;
}

function buildFacilitySearchQueries(query: string): string[] {
  const trimmed = query.trim().replace(/\s+/g, " ");
  if (!trimmed) return [""];

  const variants = [trimmed];
  const abbreviationVariant = trimmed
    .replace(/\btennisklubb(?:en)?\b/gi, "TK")
    .replace(/\btennis\s+klubb(?:en)?\b/gi, "TK")
    .replace(/\bpadelklubb(?:en)?\b/gi, "PK")
    .replace(/\bpadel\s+klubb(?:en)?\b/gi, "PK")
    .replace(/\s+/g, " ")
    .trim();
  variants.push(abbreviationVariant);

  const withoutClubWords = trimmed
    .replace(
      /\b(?:tennisklubb(?:en)?|tennis\s+klubb(?:en)?|padelklubb(?:en)?|padel\s+klubb(?:en)?|klubb(?:en)?|tennis|padel|tk|pk)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  variants.push(withoutClubWords);

  const firstUsefulWord = withoutClubWords.split(" ").find((word) => normalizeSwedishText(word).length >= 3);
  if (firstUsefulWord) variants.push(firstUsefulWord);

  const seen = new Set<string>();
  return variants.filter((variant) => {
    const key = normalizeSwedishText(variant);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseTotalResults(html: string): number {
  return (
    parsePositiveInt(
      captureFirst(
        html,
        /<span[^>]*class="[^"]*\bresults-label\b[^"]*"[^>]*>\s*(\d+)\s+(?:result|results|träff|träffar)/i,
      ) ?? "",
    ) ?? 0
  );
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

function parseTimeMinutes(value: string) {
  const match = value.match(/^(\d{1,2}):?(\d{2})?/);
  if (!match) return 0;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  return hours * 60 + minutes;
}

function parsePositiveInt(raw?: string): number | null {
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

function parseCoordinate(raw?: string | null): number | null {
  if (!raw) return null;
  const value = Number(String(raw).replace(",", "."));
  return Number.isFinite(value) ? value : null;
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

function normalizeSwedishText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
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
