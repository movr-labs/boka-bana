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
  status: "quoted";
  currency: "SEK";
  totalPrice: number;
  methods: string[];
  expiresAt: string;
  items: MockQuoteItem[];
  checkoutMode: "mock";
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
