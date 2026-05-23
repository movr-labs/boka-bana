export type TennisEvent = {
  id: string;
  title: string;
  dateLabel: string;
  startDate: string;
  endDate?: string;
  category: string;
  location: string;
  region: string;
  href: string;
};

export const TENNIS_EVENTS_SOURCE_URL =
  "https://www.tennis.se/kalender/lista/?tribe_eventcategory%5B0%5D=1372477";

export const TENNIS_EVENTS: TennisEvent[] = [
  {
    id: "stl-ute-2026-h-d55-75",
    title: "STL Ute 2026 H/D55-75",
    dateLabel: "23-24 maj",
    startDate: "2026-05-23",
    endDate: "2026-05-24",
    category: "Seriespel",
    location: "Svenska Tennisligan",
    region: "Nationellt",
    href: "https://www.tennis.se/kalender/stl-ute-2026-h-d55-75/",
  },
  {
    id: "stl-ute-2026-pfj13abc",
    title: "STL Ute 2026 PFJ13ABC*",
    dateLabel: "23-24 maj",
    startDate: "2026-05-23",
    endDate: "2026-05-24",
    category: "Seriespel",
    location: "Svenska Tennisligan",
    region: "Nationellt",
    href: "https://www.tennis.se/kalender/stl-ute-2026-pfj13abc-2/",
  },
  {
    id: "stl-ute-2026-damer",
    title: "STL Ute 2026 Damer",
    dateLabel: "23-24 maj",
    startDate: "2026-05-23",
    endDate: "2026-05-24",
    category: "Seriespel",
    location: "Svenska Tennisligan",
    region: "Nationellt",
    href: "https://www.tennis.se/kalender/stl-ute-2026-damer/",
  },
  {
    id: "ystad-j30-j60-2026",
    title: "Ystad J30/J60",
    dateLabel: "23-30 maj",
    startDate: "2026-05-23",
    endDate: "2026-05-30",
    category: "Internationell junior",
    location: "Ystads Tennisklubb",
    region: "Ystad",
    href: "https://www.tennis.se/kalender/ystad-j30-j60/",
  },
  {
    id: "atl-open-sommartour-2026",
    title: "ATL Open - Sommartour 2026",
    dateLabel: "25-27 maj",
    startDate: "2026-05-25",
    endDate: "2026-05-27",
    category: "Sommartour",
    location: "ATL",
    region: "Lund",
    href: "https://www.tennis.se/kalender/atl-open-sommartour-2026-b-15-000kr/",
  },
  {
    id: "riviera-tennis-jsm-race-18",
    title: "Riviera Tennis - JSM Race 2026 (18)",
    dateLabel: "27-31 maj",
    startDate: "2026-05-27",
    endDate: "2026-05-31",
    category: "JSM Race",
    location: "Pitea Tennisklubb",
    region: "Pitea",
    href: "https://www.tennis.se/kalender/riviera-tennis-jsm-race-2026-18/",
  },
  {
    id: "riviera-tennis-jsm-race-14",
    title: "Riviera Tennis - JSM Race 2026 (14)",
    dateLabel: "27-31 maj",
    startDate: "2026-05-27",
    endDate: "2026-05-31",
    category: "JSM Race",
    location: "Pitea Tennisklubb",
    region: "Pitea",
    href: "https://www.tennis.se/kalender/riviera-tennis-jsm-race-2026-14/",
  },
  {
    id: "atl-open-16-jsm-race-2026",
    title: "ATL Open 16 - JSM Race 2026",
    dateLabel: "27-31 maj",
    startDate: "2026-05-27",
    endDate: "2026-05-31",
    category: "JSM Race",
    location: "ATL",
    region: "Lund",
    href: "https://www.tennis.se/kalender/atl-open-16-jsm-race-2026/",
  },
  {
    id: "audi-danderyd-open-sommartour-2026",
    title: "Audi Danderyd Open - Sommartour 2026",
    dateLabel: "3-6 juni",
    startDate: "2026-06-03",
    endDate: "2026-06-06",
    category: "Sommartour",
    location: "Danderyds TK",
    region: "Danderyd",
    href: "https://www.tennis.se/kalender/audi-danderyd-open-sommartour-2026-super-30-000kr/",
  },
  {
    id: "tabergsdalen-sigma-open-sommartour-2026",
    title: "Tabergsdalen Sigma Open - Sommartour 2026",
    dateLabel: "9-14 juni",
    startDate: "2026-06-09",
    endDate: "2026-06-14",
    category: "Sommartour",
    location: "Tabergsdalens TK",
    region: "Norrahammar",
    href: "https://www.tennis.se/kalender/tabergsdalen-sigma-open-sommartour-2026-a-25-000kr/",
  },
];

export const FEATURED_TENNIS_EVENTS = TENNIS_EVENTS.slice(0, 4);

export function monthLabelForEvent(event: TennisEvent) {
  return new Intl.DateTimeFormat("sv-SE", { month: "long", year: "numeric" }).format(
    new Date(`${event.startDate}T00:00:00`),
  );
}
