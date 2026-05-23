export type MatchiBookingQuery = Record<string, string>;

export type MatchiFacilityConfig = {
  slug: string;
  name: string;
  defaultSportId: string;
  defaultSportName: string;
};

export type MatchiFacility = MatchiFacilityConfig & {
  facilityId: string;
};

export type MatchiFacilitySummary = {
  slug: string;
  facilityId: string;
  name: string;
  city: string;
  imageUrl: string | null;
  sportId: string;
  sportName: string;
  bookableCourts: number | null;
  latitude: number | null;
  longitude: number | null;
};

export type MatchiAvailabilityOption = {
  facilitySlug: string;
  facilityId: string;
  facilityName: string;
  sportId: string;
  sportName: string;
  slotId: string;
  courtName: string;
  surfaceName: string | null;
  date: string;
  start: string;
  end: string;
  durationMinutes: number;
  bookingPath: string;
  bookingQuery: MatchiBookingQuery;
  sourceFetchedAt: string;
  mockPrice: number;
};

export type AvailabilityResponse = {
  facility?: MatchiFacility;
  facilities: MatchiFacilitySummary[];
  options: MatchiAvailabilityOption[];
  totalResults: number;
  offset: number;
  limit: number;
  query: string;
  sportId: string;
  sportName: string;
  fetchedAt: string;
};

export type MatchiFacilityMapResponse = {
  facilities: MatchiFacilitySummary[];
  totalResults: number;
  offset: number;
  limit: number;
  query: string;
  sportId: string;
  sportName: string;
  fetchedAt: string;
};

export type MatchiDirectoryCitySummary = {
  name: string;
  clubs: number;
  query: string;
};

export type MatchiDirectoryBucket = {
  totalClubs: number;
  totalCourts: number | null;
  cities: MatchiDirectoryCitySummary[];
};

export type MatchiDirectorySummary = MatchiDirectoryBucket & {
  bySport: Record<string, MatchiDirectoryBucket>;
  fetchedAt: string;
};

export type MockQuoteItem = Pick<
  MatchiAvailabilityOption,
  | "facilitySlug"
  | "facilityId"
  | "facilityName"
  | "sportId"
  | "sportName"
  | "slotId"
  | "courtName"
  | "surfaceName"
  | "date"
  | "start"
  | "end"
  | "durationMinutes"
  | "bookingPath"
  | "bookingQuery"
  | "mockPrice"
>;

export type MockQuote = {
  batchId: string;
  status: MatchiBookingBatchStatusValue;
  currency: "SEK";
  totalPrice: number;
  methods: string[];
  expiresAt: string;
  items: MockQuoteItem[];
  checkoutMode: "matchi" | "mock";
  quoteHash: string;
  manualCheckoutUrl: string | null;
  checkoutUrl: string | null;
  checkoutRef: string | null;
  lastError: string | null;
};

export type StoredBooking = {
  id: string;
  reference: string;
  createdAt: string;
  quote: MockQuote;
  contact: {
    name: string;
    email: string;
    phone: string;
  };
  players: string[];
};

export type MatchiBookingBatchStatusValue =
  | "quoted"
  | "checkout_pending"
  | "payment_processing"
  | "booked"
  | "failed"
  | "action_required"
  | "cancelled";

export type MatchiStoredCheckoutBatch = MockQuote & {
  confirmedAt: string | null;
  bookedAt: string | null;
  lastReconciledAt: string | null;
  rawCheckout: unknown;
  rawReconcile: unknown;
};

export type MatchiConfirmResponse = {
  ok: boolean;
  status: MatchiBookingBatchStatusValue;
  batchId: string;
  reference: string;
  confirmedAt: string;
  checkoutUrl: string | null;
  manualCheckoutUrl: string | null;
  checkoutRef: string | null;
  lastError: string | null;
};
