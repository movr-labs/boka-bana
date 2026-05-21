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
  facility: MatchiFacility;
  options: MatchiAvailabilityOption[];
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
