import { createHash, randomUUID } from "crypto";
import type {
  MatchiBookingBatchStatusValue,
  MatchiConfirmResponse,
  MatchiStoredCheckoutBatch,
  MockQuote,
  MockQuoteItem,
} from "@/lib/matchi-types";

const MATCHI_BASE_URL = "https://www.matchi.se";

type MatchiQuoteApiResponse = {
  prices?: Record<string, number>;
  totalPrice?: number;
  pricePerSlotRow?: Record<string, number>;
  methods?: Array<{ name?: string }>;
  bookTrainerModel?: {
    slotsAreConsecutive?: boolean;
    slotsAreSameCourt?: boolean;
  };
};

type NormalizedQuote = {
  prices: Record<string, number>;
  totalPrice: number;
  methods: string[];
  raw: MatchiQuoteApiResponse | null;
};

type StartCheckoutResult = {
  status: "checkout_pending" | "action_required";
  checkoutUrl: string | null;
  checkoutRef: string | null;
  manualCheckoutUrl: string | null;
  raw: unknown;
};

type ReconcileResult = {
  status: MatchiBookingBatchStatusValue;
  bookingRef: string | null;
  lastError: string | null;
  raw: unknown;
};

export function createQuotedBatch(item: MockQuoteItem, quote: NormalizedQuote): MatchiStoredCheckoutBatch {
  const expiresAt = new Date(Date.now() + getQuoteTtlSeconds() * 1000).toISOString();
  const quotedPrice = quote.prices[item.slotId] ?? quote.totalPrice;
  const hasVerifiedPrice = Number.isFinite(quotedPrice) && quotedPrice > 0;
  const pricedItem = {
    ...item,
    mockPrice: hasVerifiedPrice ? quotedPrice : 0,
  };
  const methods = quote.methods.length ? quote.methods : ["Matchi checkout"];
  const batch: MatchiStoredCheckoutBatch = {
    batchId: randomUUID(),
    status: "quoted",
    currency: "SEK",
    totalPrice: pricedItem.mockPrice,
    methods,
    expiresAt,
    items: [pricedItem],
    checkoutMode: "matchi",
    quoteHash: stableHash({
      facilityId: pricedItem.facilityId,
      facilitySlug: pricedItem.facilitySlug,
      items: [{ slotId: pricedItem.slotId, price: pricedItem.mockPrice }],
      totalPrice: pricedItem.mockPrice,
      methods,
    }),
    manualCheckoutUrl: buildManualCheckoutUrl(pricedItem),
    checkoutUrl: null,
    checkoutRef: null,
    lastError: hasVerifiedPrice ? null : "Matchi-priset kunde inte verifieras. Slutligt pris visas i Matchi checkout.",
    confirmedAt: null,
    bookedAt: null,
    lastReconciledAt: null,
    rawCheckout: null,
    rawReconcile: null,
  };
  return batch;
}

export async function quoteMatchiItem(item: MockQuoteItem): Promise<NormalizedQuote> {
  const fallback = createFallbackQuote(item);
  if (isDisabled(process.env.MATCHI_REMOTE_QUOTE_ENABLED)) {
    return fallback;
  }

  try {
    const path = String(process.env.MATCHI_QUOTE_PATH ?? "/bookingPayment/updateConfirmModalModel").trim();
    const url = new URL(path, MATCHI_BASE_URL);
    url.searchParams.set("slotIds", item.slotId);
    url.searchParams.set("firstSlotIds", item.slotId);
    url.searchParams.set("_", String(Date.now()));

    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json, text/plain, */*",
        Referer: buildFacilityReferer(item),
        "accept-language": "en-US,en;q=0.9,sv-SE;q=0.8,sv;q=0.7",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
        "x-requested-with": "XMLHttpRequest",
      },
    });
    if (!response.ok) {
      throw new Error(`Matchi price request failed (${response.status})`);
    }
    const payload = (await response.json()) as MatchiQuoteApiResponse;
    const normalized = normalizeQuoteResponse(payload);
    if (normalized.totalPrice <= 0) {
      throw new Error("Matchi returned no price for this slot");
    }
    return normalized;
  } catch (error) {
    if (isEnabled(process.env.MATCHI_ALLOW_ESTIMATED_PRICE_FALLBACK)) {
      return fallback;
    }
    throw error;
  }
}

export async function confirmCheckoutBatch(batch: MatchiStoredCheckoutBatch): Promise<MatchiStoredCheckoutBatch> {
  if (!["quoted", "action_required"].includes(batch.status)) {
    throw new Error(`Kan inte slutföra checkout från status ${batch.status}.`);
  }
  if (new Date(batch.expiresAt).getTime() < Date.now()) {
    throw new Error("Matchi-offerten har gått ut. Skapa en ny offert innan du slutför.");
  }

  const item = batch.items[0];
  if (!item) throw new Error("Checkout saknar bokningsrad.");
  const liveQuote = await quoteMatchiItem(item).catch(() => createUnpricedQuote());
  const quotedPrice = liveQuote.prices[item.slotId] ?? liveQuote.totalPrice;
  const livePrice = quotedPrice || item.mockPrice;
  const liveMethods = liveQuote.methods.length ? liveQuote.methods : batch.methods;
  const liveHash = stableHash({
    facilityId: item.facilityId,
    facilitySlug: item.facilitySlug,
    items: [{ slotId: item.slotId, price: livePrice }],
    totalPrice: livePrice,
    methods: liveMethods,
  });

  if (liveHash !== batch.quoteHash) {
    throw new Error("Matchi-offerten ändrades innan bekräftelse. Skapa en ny offert.");
  }

  const checkout = await startCheckout(batch);
  return {
    ...batch,
    status: checkout.status,
    totalPrice: livePrice,
    methods: liveMethods,
    items: [{ ...item, mockPrice: livePrice }],
    checkoutUrl: checkout.checkoutUrl,
    checkoutRef: checkout.checkoutRef,
    manualCheckoutUrl: checkout.manualCheckoutUrl,
    confirmedAt: new Date().toISOString(),
    lastError:
      checkout.status === "action_required"
        ? "Automatisk Matchi-checkout kunde inte startas. Slutför via Matchi-länken."
        : null,
    rawCheckout: checkout.raw,
  };
}

export async function reconcileCheckoutBatch(batch: MatchiStoredCheckoutBatch): Promise<MatchiStoredCheckoutBatch> {
  if (!["checkout_pending", "payment_processing", "action_required"].includes(batch.status)) {
    return batch;
  }
  const reconcile = await reconcileCheckout(batch);
  return {
    ...batch,
    status: reconcile.status,
    checkoutRef: batch.checkoutRef,
    bookedAt: reconcile.status === "booked" ? batch.bookedAt ?? new Date().toISOString() : batch.bookedAt,
    lastReconciledAt: new Date().toISOString(),
    lastError: reconcile.lastError,
    rawReconcile: reconcile.raw,
  };
}

export function toPublicQuote(batch: MatchiStoredCheckoutBatch): MockQuote {
  return {
    batchId: batch.batchId,
    status: batch.status,
    currency: batch.currency,
    totalPrice: batch.totalPrice,
    methods: batch.methods,
    expiresAt: batch.expiresAt,
    items: batch.items,
    checkoutMode: batch.checkoutMode,
    quoteHash: batch.quoteHash,
    manualCheckoutUrl: batch.manualCheckoutUrl,
    checkoutUrl: batch.checkoutUrl,
    checkoutRef: batch.checkoutRef,
    lastError: batch.lastError,
  };
}

export function toConfirmResponse(batch: MatchiStoredCheckoutBatch): MatchiConfirmResponse {
  return {
    ok: batch.status !== "failed",
    status: batch.status,
    batchId: batch.batchId,
    reference: batch.checkoutRef ?? `BB-${batch.batchId.slice(0, 8).toUpperCase()}`,
    confirmedAt: batch.confirmedAt ?? new Date().toISOString(),
    checkoutUrl: batch.checkoutUrl,
    manualCheckoutUrl: batch.manualCheckoutUrl,
    checkoutRef: batch.checkoutRef,
    lastError: batch.lastError,
  };
}

async function startCheckout(batch: MatchiStoredCheckoutBatch): Promise<StartCheckoutResult> {
  const item = batch.items[0];
  if (!item) throw new Error("Checkout saknar bokningsrad.");
  const manualCheckoutUrl = buildManualCheckoutUrl(item);
  const path = String(process.env.MATCHI_CHECKOUT_INIT_PATH ?? "").trim();
  if (!path) {
    return {
      status: "action_required",
      checkoutUrl: null,
      checkoutRef: null,
      manualCheckoutUrl,
      raw: { mode: "manual_fallback" },
    };
  }

  const payload = {
    batchId: batch.batchId,
    facilityId: item.facilityId,
    facilitySlug: item.facilitySlug,
    slotIds: batch.items.map((entry) => entry.slotId),
    firstSlotIds: batch.items.slice(0, 1).map((entry) => entry.slotId),
  };
  const method = String(process.env.MATCHI_CHECKOUT_INIT_METHOD ?? "POST").trim().toUpperCase();
  const response = await fetch(buildCheckoutUrl(path, method === "GET" ? payload : undefined), {
    method: method === "GET" ? "GET" : "POST",
    cache: "no-store",
    redirect: "manual",
    headers: {
      Accept: "application/json, text/plain, */*",
      Referer: buildDirectBookingUrl(item),
      "Content-Type": "application/json",
      "x-requested-with": "XMLHttpRequest",
    },
    body: method === "GET" ? undefined : JSON.stringify(payload),
  });

  const redirectUrl = response.headers.get("location");
  if (redirectUrl) {
    return {
      status: "checkout_pending",
      checkoutUrl: new URL(redirectUrl, MATCHI_BASE_URL).toString(),
      checkoutRef: batch.batchId,
      manualCheckoutUrl,
      raw: { location: redirectUrl },
    };
  }

  const body = await response.text();
  const parsed = tryParseBody(body);
  const checkoutUrl = pickUrl(parsed);
  if (checkoutUrl) {
    return {
      status: "checkout_pending",
      checkoutUrl,
      checkoutRef: pickCheckoutRef(parsed) ?? batch.batchId,
      manualCheckoutUrl,
      raw: parsed,
    };
  }

  return {
    status: "action_required",
    checkoutUrl: null,
    checkoutRef: null,
    manualCheckoutUrl,
    raw: parsed,
  };
}

async function reconcileCheckout(batch: MatchiStoredCheckoutBatch): Promise<ReconcileResult> {
  const item = batch.items[0];
  if (!item) throw new Error("Checkout saknar bokningsrad.");
  const configuredPath = String(process.env.MATCHI_CHECKOUT_STATUS_PATH ?? "").trim();
  if (configuredPath) {
    const url = buildCheckoutUrl(configuredPath, {
      batchId: batch.batchId,
      checkoutRef: batch.checkoutRef ?? "",
    });
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json, text/plain, */*",
        Referer: buildDirectBookingUrl(item),
      },
    });
    const payload = tryParseBody(await response.text());
    return parseReconcilePayload(payload, batch);
  }

  return reconcileWithQuoteProbe(batch);
}

async function reconcileWithQuoteProbe(batch: MatchiStoredCheckoutBatch): Promise<ReconcileResult> {
  const item = batch.items[0];
  if (!item) throw new Error("Checkout saknar bokningsrad.");
  const assumeBooked = isEnabled(process.env.MATCHI_ASSUME_UNAVAILABLE_IS_BOOKED);
  try {
    const quote = await quoteMatchiItem(item);
    const isStillAvailable = quote.prices[item.slotId] !== undefined || quote.totalPrice > 0;
    if (isStillAvailable) {
      return {
        status: batch.status === "checkout_pending" ? "payment_processing" : "action_required",
        bookingRef: batch.checkoutRef,
        lastError: "Checkout är startad, men bokningen är fortfarande inte verifierad i Matchi.",
        raw: { strategy: "quote_probe", stillAvailable: true },
      };
    }
    return {
      status: assumeBooked ? "booked" : "action_required",
      bookingRef: batch.checkoutRef,
      lastError: assumeBooked ? null : "Tiden verkar inte längre vara tillgänglig. Verifiera manuellt i Matchi.",
      raw: { strategy: "quote_probe", stillAvailable: false },
    };
  } catch (error) {
    return {
      status: batch.status === "checkout_pending" ? "payment_processing" : "action_required",
      bookingRef: batch.checkoutRef,
      lastError: error instanceof Error ? error.message : String(error),
      raw: { strategy: "quote_probe_error" },
    };
  }
}

function parseReconcilePayload(payload: unknown, batch: MatchiStoredCheckoutBatch): ReconcileResult {
  const raw = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
  const statusValue = String(raw.status ?? raw.bookingStatus ?? raw.paymentStatus ?? "")
    .trim()
    .toLowerCase();
  const bookingRef = String(raw.bookingRef ?? raw.reference ?? raw.booking_id ?? batch.checkoutRef ?? "").trim() || null;
  if (/booked|paid|confirmed|success/.test(statusValue)) {
    return { status: "booked", bookingRef, lastError: null, raw: payload };
  }
  if (/failed|declined|cancelled|error/.test(statusValue)) {
    return {
      status: "failed",
      bookingRef,
      lastError: String(raw.message ?? raw.error ?? "Matchi rapporterade misslyckad checkout"),
      raw: payload,
    };
  }
  if (/pending|processing/.test(statusValue)) {
    return { status: "payment_processing", bookingRef, lastError: null, raw: payload };
  }
  return {
    status: batch.status === "checkout_pending" ? "payment_processing" : "action_required",
    bookingRef,
    lastError: pickUrl(payload) ? "Ytterligare åtgärd krävs i Matchi checkout." : null,
    raw: payload,
  };
}

function createFallbackQuote(item: MockQuoteItem): NormalizedQuote {
  return {
    prices: { [item.slotId]: item.mockPrice },
    totalPrice: item.mockPrice,
    methods: ["Matchi checkout"],
    raw: null,
  };
}

export function createUnpricedQuote(): NormalizedQuote {
  return {
    prices: {},
    totalPrice: 0,
    methods: ["Matchi checkout"],
    raw: null,
  };
}

function normalizeQuoteResponse(raw: MatchiQuoteApiResponse): NormalizedQuote {
  const prices = normalizeNumericMap(raw.pricePerSlotRow);
  const fallbackPrices = normalizeNumericMap(raw.prices);
  return {
    prices: { ...fallbackPrices, ...prices },
    totalPrice: Number(raw.totalPrice ?? 0),
    methods: Array.isArray(raw.methods)
      ? uniqueStrings(raw.methods.map((method) => String(method?.name ?? "").trim()))
      : [],
    raw,
  };
}

function buildCheckoutUrl(path: string, query?: Record<string, unknown>) {
  const url = new URL(path, MATCHI_BASE_URL);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined) continue;
      url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
    }
  }
  return url;
}

export function buildManualCheckoutUrl(item: MockQuoteItem): string {
  const loginUrl = new URL("/login/auth", MATCHI_BASE_URL);
  const bookingUrl = new URL(item.bookingPath, MATCHI_BASE_URL);
  for (const [key, value] of Object.entries(item.bookingQuery ?? {})) {
    if (value) bookingUrl.searchParams.set(key, value);
  }
  if (!bookingUrl.searchParams.get("slotIds")) {
    bookingUrl.searchParams.set("slotIds", item.slotId);
  }
  loginUrl.searchParams.set("returnUrl", `${bookingUrl.pathname}${bookingUrl.search}`);
  return loginUrl.toString();
}

function buildDirectBookingUrl(item: MockQuoteItem): string {
  const bookingUrl = new URL(item.bookingPath, MATCHI_BASE_URL);
  for (const [key, value] of Object.entries(item.bookingQuery ?? {})) {
    if (value) bookingUrl.searchParams.set(key, value);
  }
  if (!bookingUrl.searchParams.get("slotIds")) {
    bookingUrl.searchParams.set("slotIds", item.slotId);
  }
  return bookingUrl.toString();
}

function buildFacilityReferer(item: MockQuoteItem): string {
  const url = new URL(`/facilities/${item.facilitySlug}`, MATCHI_BASE_URL);
  url.searchParams.set("date", item.date);
  if (item.sportId) url.searchParams.set("sport", item.sportId);
  return url.toString();
}

function pickUrl(payload: unknown): string | null {
  if (!payload) return null;
  if (typeof payload === "string") {
    const match = payload.match(/https?:\/\/[^\s"'<>]+/i);
    return match?.[0] ?? null;
  }
  if (typeof payload === "object" && !Array.isArray(payload)) {
    const raw = payload as Record<string, unknown>;
    for (const candidate of [raw.checkoutUrl, raw.redirectUrl, raw.url, raw.checkoutSessionUrl, raw.paymentUrl]) {
      const url = String(candidate ?? "").trim();
      if (/^https?:\/\//i.test(url)) return url;
      if (url.startsWith("/")) return new URL(url, MATCHI_BASE_URL).toString();
    }
  }
  return null;
}

function pickCheckoutRef(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const raw = payload as Record<string, unknown>;
  return String(raw.checkoutRef ?? raw.checkoutSessionId ?? raw.reference ?? "").trim() || null;
}

function tryParseBody(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function normalizeNumericMap(input: unknown): Record<string, number> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>)
      .map(([key, value]) => [String(key ?? "").trim(), Number(value)] as const)
      .filter(([key, value]) => Boolean(key) && Number.isFinite(value)),
  );
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(sortValue(value))).digest("hex");
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sortValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortValue(nested)]),
    );
  }
  return value;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function getQuoteTtlSeconds() {
  return Math.max(60, Number(process.env.MATCHI_QUOTE_TTL_SECONDS ?? 10 * 60) || 10 * 60);
}

function isEnabled(value: string | undefined) {
  return ["1", "true", "yes"].includes(String(value ?? "").trim().toLowerCase());
}

function isDisabled(value: string | undefined) {
  return ["0", "false", "no"].includes(String(value ?? "").trim().toLowerCase());
}
