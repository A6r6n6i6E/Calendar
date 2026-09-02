export const CATEGORY_CONFIG = {
  dydaktyczne: { label: "Zajęcia dydaktyczne", color: "#397ca4", soft: "#e6f1f7" },
  dodatkowe: { label: "Dodatkowe zajęcia", color: "#5b6fc7", soft: "#eceefa" },
  korepetycje: { label: "Korepetycje", color: "#8b5aa7", soft: "#f3ebf7" },
  zebranie: { label: "Zebranie", color: "#2f806f", soft: "#e4f2ee" },
  rada: { label: "Rada pedagogiczna", color: "#c16b3c", soft: "#f9ece4" },
  inne: { label: "Inne", color: "#65727a", soft: "#edf0f1" },
};

export const WEEKDAY_NAMES = ["", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"];
export const WEEKDAY_SHORT = ["", "PON", "WT", "ŚR", "CZW", "PT", "SOB", "ND"];

export const TIME_SLOTS = [
  { number: 1, start: "08:30", end: "09:15" },
  { number: 2, start: "09:25", end: "10:10" },
  { number: 3, start: "10:25", end: "11:10" },
  { number: 4, start: "11:20", end: "12:05" },
  { number: 5, start: "12:15", end: "13:00" },
  { number: 6, start: "13:20", end: "14:05" },
  { number: 7, start: "14:25", end: "15:10" },
  { number: 8, start: "15:15", end: "16:00" },
  { number: 9, start: "16:05", end: "16:50" },
];

export const INITIAL_BASE_EVENTS = [
  { id: "base-mon-4a-1", weekday: 1, title: "4a", category: "dydaktyczne", accent: "class4", start: "11:20", end: "12:05", place: "", note: "" },
  { id: "base-mon-4a-2", weekday: 1, title: "4a", category: "dydaktyczne", accent: "class4", start: "12:15", end: "13:00", place: "", note: "" },
  { id: "base-mon-7-math-1", weekday: 1, title: "7 matematyka", category: "dydaktyczne", accent: "class7", start: "13:20", end: "14:05", place: "", note: "" },
  { id: "base-mon-7-math-2", weekday: 1, title: "7 matematyka", category: "dydaktyczne", accent: "class7", start: "14:25", end: "15:10", place: "", note: "" },
  { id: "base-wed-7-math", weekday: 3, title: "7 matematyka", category: "dydaktyczne", accent: "class7", start: "12:15", end: "13:00", place: "", note: "" },
  { id: "base-wed-4a", weekday: 3, title: "4a", category: "dydaktyczne", accent: "class4", start: "13:20", end: "14:05", place: "", note: "" },
  { id: "base-thu-4a", weekday: 4, title: "4a", category: "dydaktyczne", accent: "class4", start: "12:15", end: "13:00", place: "", note: "" },
  { id: "base-thu-7-pe", weekday: 4, title: "7 (P.E)", category: "dydaktyczne", accent: "class7", start: "13:20", end: "14:05", place: "", note: "" },
  { id: "base-thu-7-physics", weekday: 4, title: "7 fizyka", category: "dydaktyczne", accent: "class7", start: "15:15", end: "16:00", place: "", note: "" },
  { id: "base-fri-7-math", weekday: 5, title: "7 matematyka", category: "dydaktyczne", accent: "class7", start: "11:20", end: "12:05", place: "", note: "" },
  { id: "base-fri-7-physics", weekday: 5, title: "7 fizyka", category: "dydaktyczne", accent: "class7", start: "12:15", end: "13:00", place: "", note: "" },
];
