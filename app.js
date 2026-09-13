import {
  addDays,
  durationMinutes,
  eventsOverlap,
  formatDuration,
  fromDateKey,
  getTimelineRange,
  isSameDay,
  layoutEventLanes,
  minutesToTime,
  startOfWeek,
  timeToMinutes,
  toDateKey,
  weekdayNumber,
} from "./utils.js";
import { CATEGORY_CONFIG, INITIAL_BASE_EVENTS, TIME_SLOTS, WEEKDAY_NAMES } from "./data.js";

const STORAGE_KEY = "moj-plan-v1";
const FIT_PREFERENCE_KEY = "moj-plan-fit-table";
const SYNC_CODE_KEY = "moj-plan-sync-code";
const MINUTE_HEIGHT = 1.08;
const SYNC_INTERVAL = 30_000;

function freshState() {
  return {
    version: 2,
    baseEvents: INITIAL_BASE_EVENTS.map((event) => ({ ...event })),
    customEvents: [],
    cancellations: [],
    meta: { updatedAt: 0 },
  };
}

function normalizeState(candidate) {
  if (!candidate || typeof candidate !== "object") return freshState();
  const baseEvents = Array.isArray(candidate.baseEvents) ? candidate.baseEvents : INITIAL_BASE_EVENTS;
  const customEvents = Array.isArray(candidate.customEvents) ? candidate.customEvents : [];
  const cancellations = Array.isArray(candidate.cancellations) ? candidate.cancellations : [];
  return {
    version: 2,
    baseEvents: baseEvents.filter(isValidBaseEvent).map(normalizeEvent),
    customEvents: customEvents.filter(isValidCustomEvent).map(normalizeEvent),
    cancellations: cancellations.filter((value) => typeof value === "string"),
    meta: {
      updatedAt: Number.isFinite(Number(candidate.meta?.updatedAt)) ? Number(candidate.meta.updatedAt) : 0,
    },
  };
}

function normalizeEvent(event) {
  return {
    ...event,
    title: String(event.title).slice(0, 80),
    category: CATEGORY_CONFIG[event.category] ? event.category : "inne",
    place: typeof event.place === "string" ? event.place.slice(0, 80) : "",
    note: typeof event.note === "string" ? event.note.slice(0, 240) : "",
  };
}

function isValidTime(value) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isValidBaseEvent(event) {
  return event && typeof event.id === "string" && typeof event.title === "string"
    && Number(event.weekday) >= 1 && Number(event.weekday) <= 7
    && isValidTime(event.start) && isValidTime(event.end) && event.start < event.end;
}

function isValidCustomEvent(event) {
  return event && typeof event.id === "string" && typeof event.title === "string"
    && /^\d{4}-\d{2}-\d{2}$/.test(event.date)
    && isValidTime(event.start) && isValidTime(event.end) && event.start < event.end;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshState();
    const candidate = JSON.parse(raw);
    const normalized = normalizeState(candidate);
    if (!Number(candidate.meta?.updatedAt)) normalized.meta.updatedAt = Date.now();
    return normalized;
  } catch {
    return freshState();
  }
}

function isValidSyncCode(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

function loadSyncCode() {
  try {
    const value = localStorage.getItem(SYNC_CODE_KEY) || "";
    return isValidSyncCode(value) ? value : "";
  } catch {
    return "";
  }
}

let state = loadState();
let syncCode = loadSyncCode();
let selectedDate = new Date();
selectedDate.setHours(12, 0, 0, 0);
let currentView = "plan";
let toastTimer;
let installPrompt;
let fitTimetable = localStorage.getItem(FIT_PREFERENCE_KEY) !== "scroll";
let fitFrame;
let syncDebounceTimer;
let syncInFlight;
let syncUnavailable = false;
let syncLocked = false;

const elements = {
  views: [...document.querySelectorAll(".view")],
  navItems: [...document.querySelectorAll(".nav-item")],
  previousWeek: document.querySelector("#previousWeek"),
  nextWeek: document.querySelector("#nextWeek"),
  weekCaption: document.querySelector("#weekCaption"),
  planTitle: document.querySelector("#planTitle"),
  weekSummary: document.querySelector("#weekSummary"),
  fitTableButton: document.querySelector("#fitTableButton"),
  fitTableLabel: document.querySelector("#fitTableLabel"),
  timetableScroll: document.querySelector("#timetableScroll"),
  timetableGrid: document.querySelector("#timetableGrid"),
  baseList: document.querySelector("#baseList"),
  addButton: document.querySelector("#addButton"),
  addBaseButton: document.querySelector("#addBaseButton"),
  jumpTodayButton: document.querySelector("#jumpTodayButton"),
  todayBadge: document.querySelector("#todayBadge"),
  eventDialog: document.querySelector("#eventDialog"),
  eventForm: document.querySelector("#eventForm"),
  eventDialogTitle: document.querySelector("#eventDialogTitle"),
  formEyebrow: document.querySelector("#formEyebrow"),
  scopeField: document.querySelector("#scopeField"),
  eventId: document.querySelector("#eventId"),
  eventTitle: document.querySelector("#eventTitle"),
  eventCategory: document.querySelector("#eventCategory"),
  eventDate: document.querySelector("#eventDate"),
  eventWeekday: document.querySelector("#eventWeekday"),
  eventStart: document.querySelector("#eventStart"),
  eventEnd: document.querySelector("#eventEnd"),
  eventPlace: document.querySelector("#eventPlace"),
  eventNote: document.querySelector("#eventNote"),
  dateField: document.querySelector("#dateField"),
  weekdayField: document.querySelector("#weekdayField"),
  titleError: document.querySelector("#titleError"),
  timeError: document.querySelector("#timeError"),
  conflictNote: document.querySelector("#conflictNote"),
  editActions: document.querySelector("#editActions"),
  deleteEventButton: document.querySelector("#deleteEventButton"),
  closeEventDialog: document.querySelector("#closeEventDialog"),
  cancelEventButton: document.querySelector("#cancelEventButton"),
  detailsDialog: document.querySelector("#eventDetailsDialog"),
  closeDetailsDialog: document.querySelector("#closeDetailsDialog"),
  detailAccent: document.querySelector("#detailAccent"),
  detailCategory: document.querySelector("#detailCategory"),
  detailTitle: document.querySelector("#detailTitle"),
  detailInfo: document.querySelector("#detailInfo"),
  editFromDetailsButton: document.querySelector("#editFromDetailsButton"),
  editOccurrenceButton: document.querySelector("#editOccurrenceButton"),
  cancelOccurrenceButton: document.querySelector("#cancelOccurrenceButton"),
  restoreOccurrenceButton: document.querySelector("#restoreOccurrenceButton"),
  categoryLegend: document.querySelector("#categoryLegend"),
  installButton: document.querySelector("#installButton"),
  syncCard: document.querySelector("#syncCard"),
  syncStatusText: document.querySelector("#syncStatusText"),
  syncStatusDetail: document.querySelector("#syncStatusDetail"),
  syncNowButton: document.querySelector("#syncNowButton"),
  syncCodeButton: document.querySelector("#syncCodeButton"),
  syncCodeDialog: document.querySelector("#syncCodeDialog"),
  syncCodeForm: document.querySelector("#syncCodeForm"),
  syncCodeInput: document.querySelector("#syncCodeInput"),
  syncCodeError: document.querySelector("#syncCodeError"),
  closeSyncCodeDialog: document.querySelector("#closeSyncCodeDialog"),
  cancelSyncCodeButton: document.querySelector("#cancelSyncCodeButton"),
  clearSyncCodeButton: document.querySelector("#clearSyncCodeButton"),
  exportButton: document.querySelector("#exportButton"),
  importButton: document.querySelector("#importButton"),
  importFile: document.querySelector("#importFile"),
  resetButton: document.querySelector("#resetButton"),
  toast: document.querySelector("#toast"),
};

function persist({ touch = true, sync = true } = {}) {
  if (touch) state.meta.updatedAt = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (sync) queueCloudSync();
}

function makeId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getCategory(event) {
  if (event.accent === "class7") return { ...CATEGORY_CONFIG.dydaktyczne, color: "#9b874b", soft: "#f1eddc" };
  return CATEGORY_CONFIG[event.category] || CATEGORY_CONFIG.inne;
}

function cancellationKey(eventId, dateKey) {
  return `${eventId}@${dateKey}`;
}

function getEventsForDate(date, includeCancelled = true) {
  const dateKey = toDateKey(date);
  const weekday = weekdayNumber(date);
  const baseEvents = state.baseEvents
    .filter((event) => Number(event.weekday) === weekday)
    .map((event) => ({
      ...event,
      source: "base",
      date: dateKey,
      cancelled: state.cancellations.includes(cancellationKey(event.id, dateKey)),
    }));
  const customEvents = state.customEvents
    .filter((event) => event.date === dateKey)
    .map((event) => ({ ...event, source: "single", cancelled: false }));
  return [...baseEvents, ...customEvents]
    .filter((event) => includeCancelled || !event.cancelled)
    .sort((first, second) => first.start.localeCompare(second.start) || first.end.localeCompare(second.end));
}

function getConflictIds(events) {
  const active = events.filter((event) => !event.cancelled);
  const ids = new Set();
  active.forEach((event, index) => {
    active.slice(index + 1).forEach((other) => {
      if (eventsOverlap(event, other)) {
        ids.add(`${event.source}:${event.id}`);
        ids.add(`${other.source}:${other.id}`);
      }
    });
  });
  return ids;
}

function relativeDateLabel(date) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  if (isSameDay(date, today)) return "DZISIAJ";
  if (isSameDay(date, addDays(today, 1))) return "JUTRO";
  if (isSameDay(date, addDays(today, -1))) return "WCZORAJ";
  return "PLAN DNIA";
}

function formatWeekRange(start) {
  const end = addDays(start, 6);
  const monthShort = new Intl.DateTimeFormat("pl-PL", { month: "short" });
  const firstMonth = monthShort.format(start).replace(".", "");
  const secondMonth = monthShort.format(end).replace(".", "");
  if (start.getMonth() === end.getMonth()) return `${start.getDate()}–${end.getDate()} ${secondMonth}`;
  return `${start.getDate()} ${firstMonth} – ${end.getDate()} ${secondMonth}`;
}

function describeWeek(start) {
  const currentStart = startOfWeek(new Date());
  const diffWeeks = Math.round((start - currentStart) / (7 * 24 * 60 * 60 * 1000));
  if (diffWeeks === 0) return "Ten tydzień";
  if (diffWeeks === 1) return "Następny tydzień";
  if (diffWeeks === -1) return "Poprzedni tydzień";
  return new Intl.DateTimeFormat("pl-PL", { year: "numeric" }).format(start);
}

function renderWeek() {
  const weekStart = startOfWeek(selectedDate);
  elements.weekCaption.textContent = describeWeek(weekStart);
  elements.planTitle.textContent = formatWeekRange(weekStart);
}

function eventStatus(event, date) {
  if (event.cancelled) return "Odwołane";
  if (!isSameDay(date, new Date())) return "";
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  if (now >= timeToMinutes(event.start) && now < timeToMinutes(event.end)) return "Teraz";
  if (now < timeToMinutes(event.start) && timeToMinutes(event.start) - now <= 60) return `Za ${timeToMinutes(event.start) - now} min`;
  return "";
}

function renderEventCard(event, date, conflictIds) {
  const category = getCategory(event);
  const status = eventStatus(event, date);
  const isConflict = conflictIds.has(`${event.source}:${event.id}`);
  const button = document.createElement("button");
  button.type = "button";
  button.className = `event-card${event.cancelled ? " is-cancelled" : ""}`;
  button.style.setProperty("--event-color", category.color);
  button.style.setProperty("--event-soft", category.soft);
  button.setAttribute("aria-label", `${event.title}, ${event.start}–${event.end}${event.cancelled ? ", odwołane" : ""}`);
  button.innerHTML = `
    <span class="event-time"><strong>${event.start}</strong><small>${event.end}</small></span>
    <span class="event-line" aria-hidden="true"></span>
    <span class="event-content">
      <span class="event-topline">
        <strong>${escapeHtml(event.title)}</strong>
        ${status ? `<em>${status}</em>` : ""}
      </span>
      <span class="event-meta">
        ${event.source === "base" ? "Stały plan" : category.label}
        ${event.place ? ` · ${escapeHtml(event.place)}` : ""}
      </span>
      <span class="event-badges">
        ${isConflict && !event.cancelled ? '<i class="warning-badge">Nakłada się</i>' : ""}
        ${event.note ? '<i class="note-badge">Notatka</i>' : ""}
      </span>
    </span>
    <svg class="event-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
  `;
  button.addEventListener("click", () => {
    if (event.source === "base") openDetails(event, date);
    else openEventForm({ event, scope: "single" });
  });
  return button;
}

function openGridEvent(event, date) {
  selectedDate = date;
  if (event.source === "base") openDetails(event, date);
  else openEventForm({ event, scope: "single", date });
}

function createTimelineEvent(event, date, conflictIds, range) {
  const category = getCategory(event);
  const button = document.createElement("button");
  button.type = "button";
  const duration = durationMinutes(event.start, event.end);
  button.className = `grid-event${event.cancelled ? " is-cancelled" : ""}${conflictIds.has(`${event.source}:${event.id}`) ? " has-conflict" : ""}${duration < 30 ? " is-short" : ""}`;
  button.style.setProperty("--event-color", category.color);
  button.style.setProperty("--event-soft", category.soft);
  button.style.top = `${(timeToMinutes(event.start) - range.start) * MINUTE_HEIGHT}px`;
  button.style.height = `${Math.max(18, duration * MINUTE_HEIGHT)}px`;
  button.style.left = `calc(${(event.lane / event.laneCount) * 100}% + 3px)`;
  button.style.width = `calc(${100 / event.laneCount}% - 6px)`;
  button.setAttribute("aria-label", `${event.title}, ${event.start}–${event.end}${event.cancelled ? ", odwołane" : ", kliknij, aby edytować"}`);
  const status = eventStatus(event, date);
  button.innerHTML = `
    <span class="grid-event-title">${escapeHtml(event.title)}</span>
    <span class="grid-event-meta">${event.start}–${event.end}</span>
    ${status ? `<span class="grid-event-status">${status}</span>` : ""}
  `;
  button.addEventListener("click", (clickEvent) => {
    clickEvent.stopPropagation();
    openGridEvent(event, date);
  });
  return button;
}

function suggestedEndFromStart(startMinutes) {
  return Math.min(startMinutes + 45, 23 * 60 + 59);
}

function addEventAtTimelinePoint(date, range, column, clientY) {
  const bounds = column.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (clientY - bounds.top) / bounds.height));
  const rawMinutes = range.start + ratio * (range.end - range.start);
  const startMinutes = Math.min(range.end - 5, Math.round(rawMinutes / 5) * 5);
  selectedDate = date;
  openEventForm({
    scope: "single",
    date,
    start: minutesToTime(startMinutes),
    end: minutesToTime(suggestedEndFromStart(startMinutes)),
  });
}

function createTimelineDay(date, events, conflictIds, range) {
  const column = document.createElement("div");
  const isWeekend = weekdayNumber(date) > 5;
  column.className = `timeline-day${isSameDay(date, new Date()) ? " is-today-column" : ""}${isWeekend ? " is-weekend-column" : ""}`;
  column.setAttribute("role", "gridcell");
  column.setAttribute("tabindex", "0");
  column.setAttribute("aria-label", `${WEEKDAY_NAMES[weekdayNumber(date)]}. Dotknij wybraną godzinę, aby dodać wydarzenie.`);
  column.style.height = `${(range.end - range.start) * MINUTE_HEIGHT}px`;
  column.style.setProperty("--quarter-height", `${15 * MINUTE_HEIGHT}px`);

  layoutEventLanes(events).forEach((event) => {
    column.append(createTimelineEvent(event, date, conflictIds, range));
  });

  if (isSameDay(date, new Date())) {
    const now = new Date().getHours() * 60 + new Date().getMinutes();
    if (now >= range.start && now <= range.end) {
      const line = document.createElement("span");
      line.className = "now-line";
      line.style.top = `${(now - range.start) * MINUTE_HEIGHT}px`;
      line.setAttribute("aria-hidden", "true");
      column.append(line);
    }
  }

  column.addEventListener("click", (clickEvent) => {
    if (clickEvent.target !== column) return;
    addEventAtTimelinePoint(date, range, column, clickEvent.clientY);
  });
  column.addEventListener("keydown", (keyEvent) => {
    if (keyEvent.key !== "Enter" && keyEvent.key !== " ") return;
    keyEvent.preventDefault();
    selectedDate = date;
    const [start, end] = suggestedTimes(date);
    openEventForm({ scope: "single", date, start, end });
  });
  return column;
}

function axisTime(minutes) {
  if (minutes === 24 * 60) return "24:00";
  return minutesToTime(minutes);
}

function createLessonRail(range, kind) {
  const rail = document.createElement("div");
  rail.className = kind === "number" ? "lesson-number-rail" : "timeline-rail";
  rail.setAttribute("role", "rowheader");
  rail.setAttribute("aria-label", kind === "number" ? "Numery lekcji" : "Oś godzin");
  rail.style.height = `${(range.end - range.start) * MINUTE_HEIGHT}px`;

  if (kind === "time") {
    for (let minute = range.start; minute <= range.end; minute += 60) {
      const label = document.createElement("span");
      label.className = `timeline-hour${minute === range.start ? " is-first" : ""}${minute === range.end ? " is-last" : ""}`;
      label.style.top = `${(minute - range.start) * MINUTE_HEIGHT}px`;
      label.textContent = axisTime(minute);
      rail.append(label);
    }
    return rail;
  }

  TIME_SLOTS.forEach((slot) => {
    const start = timeToMinutes(slot.start);
    const end = timeToMinutes(slot.end);
    if (end <= range.start || start >= range.end) return;
    const visibleStart = Math.max(start, range.start);
    const visibleEnd = Math.min(end, range.end);
    const marker = document.createElement("span");
    marker.className = "lesson-slot lesson-slot--number";
    marker.style.top = `${(visibleStart - range.start) * MINUTE_HEIGHT}px`;
    marker.style.height = `${(visibleEnd - visibleStart) * MINUTE_HEIGHT}px`;
    marker.textContent = String(slot.number);
    marker.setAttribute("aria-label", `Lekcja ${slot.number}, ${slot.start}–${slot.end}`);
    rail.append(marker);
  });
  return rail;
}

function renderTimetable() {
  const weekStart = startOfWeek(selectedDate);
  const weekdays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const dayEvents = new Map();
  const dayConflicts = new Map();

  weekdays.forEach((date) => {
    const key = toDateKey(date);
    const events = getEventsForDate(date, true);
    dayEvents.set(key, events);
    dayConflicts.set(key, getConflictIds(events));
  });

  const range = getTimelineRange([...dayEvents.values()].flat());

  elements.timetableGrid.innerHTML = "";
  const numberHeader = document.createElement("div");
  numberHeader.className = "table-header table-header--number";
  numberHeader.setAttribute("role", "columnheader");
  numberHeader.textContent = "LP";
  elements.timetableGrid.append(numberHeader);

  const timeHeader = document.createElement("div");
  timeHeader.className = "table-header table-header--time";
  timeHeader.setAttribute("role", "columnheader");
  timeHeader.textContent = "Godz.";
  elements.timetableGrid.append(timeHeader);

  weekdays.forEach((date) => {
    const weekday = weekdayNumber(date);
    const header = document.createElement("div");
    header.className = `table-header table-header--day${isSameDay(date, new Date()) ? " is-today" : ""}${weekday > 5 ? " is-weekend" : ""}`;
    header.setAttribute("role", "columnheader");
    header.innerHTML = `<strong>${WEEKDAY_NAMES[weekday]}</strong><span>${date.getDate()} ${new Intl.DateTimeFormat("pl-PL", { month: "short" }).format(date).replace(".", "")}</span>`;
    elements.timetableGrid.append(header);
  });

  elements.timetableGrid.append(createLessonRail(range, "number"));
  elements.timetableGrid.append(createLessonRail(range, "time"));
  weekdays.forEach((date, index) => {
    const key = toDateKey(date);
    const day = createTimelineDay(date, dayEvents.get(key), dayConflicts.get(key), range);
    day.style.gridColumn = String(index + 3);
    elements.timetableGrid.append(day);
  });
  updateTimetableFit();
}

function updateTimetableFit() {
  cancelAnimationFrame(fitFrame);
  fitFrame = requestAnimationFrame(() => {
    const scroll = elements.timetableScroll;
    const grid = elements.timetableGrid;
    scroll.classList.toggle("is-fit", fitTimetable);
    elements.fitTableButton.setAttribute("aria-pressed", String(fitTimetable));
    elements.fitTableLabel.textContent = fitTimetable ? "Czytelniej" : "Cała tabela";
    grid.style.transform = "";
    scroll.style.height = "";
    if (!fitTimetable) return;
    const scale = Math.min(1, Math.max(0.27, (scroll.clientWidth - 2) / grid.scrollWidth));
    grid.style.transform = `scale(${scale})`;
    scroll.style.height = `${Math.ceil(grid.offsetHeight * scale + 2)}px`;
  });
}

function toggleTimetableFit() {
  fitTimetable = !fitTimetable;
  localStorage.setItem(FIT_PREFERENCE_KEY, fitTimetable ? "fit" : "scroll");
  updateTimetableFit();
}

function renderPlan() {
  renderWeek();
  renderTimetable();

  const weekStart = startOfWeek(selectedDate);
  const activeEvents = Array.from({ length: 7 }, (_, offset) => getEventsForDate(addDays(weekStart, offset), false)).flat();
  const duration = activeEvents.reduce((sum, event) => sum + durationMinutes(event.start, event.end), 0);
  const count = activeEvents.length;
  const countLabel = count === 1 ? "1 wpis" : count < 5 ? `${count} wpisy` : `${count} wpisów`;
  elements.weekSummary.innerHTML = `<strong>${countLabel}</strong><span>${formatDuration(duration)}</span>`;
}

function renderBase() {
  elements.baseList.innerHTML = "";
  for (let weekday = 1; weekday <= 7; weekday += 1) {
    const events = state.baseEvents
      .filter((event) => Number(event.weekday) === weekday)
      .sort((first, second) => first.start.localeCompare(second.start));
    if (!events.length && weekday > 5) continue;
    const group = document.createElement("section");
    group.className = "base-day";
    group.innerHTML = `<div class="base-day-heading"><h2>${WEEKDAY_NAMES[weekday]}</h2><span>${events.length || "wolne"}</span></div>`;
    if (!events.length) {
      const empty = document.createElement("p");
      empty.className = "base-empty";
      empty.textContent = "Brak stałych zajęć";
      group.append(empty);
    }
    events.forEach((event) => {
      const category = getCategory(event);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "base-event";
      button.style.setProperty("--event-color", category.color);
      button.innerHTML = `
        <span class="base-dot" aria-hidden="true"></span>
        <span><strong>${escapeHtml(event.title)}</strong><small>${event.start}–${event.end} · ${CATEGORY_CONFIG[event.category]?.label || "Inne"}</small></span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
      `;
      button.addEventListener("click", () => openEventForm({ event: { ...event, source: "base" }, scope: "base" }));
      group.append(button);
    });
    elements.baseList.append(group);
  }
}

function renderLegend() {
  elements.categoryLegend.innerHTML = Object.entries(CATEGORY_CONFIG).map(([key, category]) => `
    <span><i style="--legend-color:${category.color}" aria-hidden="true"></i>${category.label}</span>
  `).join("");
}

function renderAll() {
  renderPlan();
  renderBase();
  renderLegend();
}

function switchView(view) {
  currentView = view;
  elements.views.forEach((element) => {
    const active = element.dataset.view === view;
    element.hidden = !active;
    element.classList.toggle("is-active", active);
  });
  elements.navItems.forEach((item) => item.classList.toggle("is-active", item.dataset.target === view));
  elements.addButton.classList.toggle("is-hidden", view === "more");
  if (view === "base") renderBase();
  window.scrollTo({ top: 0, behavior: "smooth" });
  history.replaceState(null, "", `#${view}`);
}

function currentScope() {
  return elements.eventForm.elements.scope.value;
}

function syncScopeFields() {
  const base = currentScope() === "base";
  elements.dateField.hidden = base;
  elements.weekdayField.hidden = !base;
  elements.eventDate.required = !base;
  elements.eventWeekday.required = base;
  checkConflict();
}

function suggestedTimes(date) {
  const events = getEventsForDate(date, false);
  if (events.length) {
    const lastEnd = Math.max(...events.map((event) => timeToMinutes(event.end)));
    const start = Math.min(lastEnd + 15, 20 * 60);
    return [minutesToTime(start), minutesToTime(Math.min(start + 45, 23 * 60 + 59))];
  }
  return ["16:00", "16:45"];
}

function openEventForm({ event = null, template = null, scope = "single", date = selectedDate, start = "", end = "" } = {}) {
  elements.eventForm.reset();
  clearErrors();
  const sourceEvent = event || template;
  elements.eventForm.dataset.editScope = event ? scope : "";
  elements.eventForm.dataset.overrideBaseId = template?.id || "";
  elements.eventForm.dataset.overrideDate = template ? toDateKey(date) : "";
  elements.eventForm.dataset.accent = sourceEvent?.accent || "";
  elements.eventId.value = event?.id || "";
  elements.eventDialogTitle.textContent = template ? "Zmień zajęcia" : event ? "Edytuj wydarzenie" : "Dodaj wydarzenie";
  elements.formEyebrow.textContent = template ? "TYLKO W TYM DNIU" : event ? "EDYCJA WPISU" : "NOWY WPIS";
  elements.editActions.hidden = !event;
  elements.scopeField.disabled = Boolean(event || template);
  elements.eventForm.elements.scope.value = scope;

  const [suggestedStart, suggestedEnd] = suggestedTimes(date);
  elements.eventTitle.value = sourceEvent?.title || "";
  elements.eventCategory.value = sourceEvent?.category || (scope === "base" ? "dydaktyczne" : "dodatkowe");
  elements.eventDate.value = event?.date || toDateKey(date);
  elements.eventDate.disabled = Boolean(template);
  elements.eventWeekday.value = String(sourceEvent?.weekday || weekdayNumber(date));
  elements.eventStart.value = sourceEvent?.start || start || (scope === "base" ? "08:30" : suggestedStart);
  elements.eventEnd.value = sourceEvent?.end || end || (scope === "base" ? "09:15" : suggestedEnd);
  elements.eventPlace.value = sourceEvent?.place || "";
  elements.eventNote.value = sourceEvent?.note || "";
  syncScopeFields();
  elements.eventDialog.showModal();
  document.body.classList.add("dialog-open");
  setTimeout(() => elements.eventTitle.focus(), 120);
}

function closeDialog(dialog) {
  if (dialog.open) dialog.close();
  syncDialogState();
}

function syncDialogState() {
  const anyDialogOpen = [...document.querySelectorAll("dialog")].some((dialog) => dialog.open);
  document.body.classList.toggle("dialog-open", anyDialogOpen);
}

function clearErrors() {
  elements.titleError.textContent = "";
  elements.timeError.textContent = "";
  elements.eventTitle.removeAttribute("aria-invalid");
  elements.eventEnd.removeAttribute("aria-invalid");
}

function validateForm() {
  clearErrors();
  let valid = true;
  if (!elements.eventTitle.value.trim()) {
    elements.titleError.textContent = "Wpisz nazwę wydarzenia.";
    elements.eventTitle.setAttribute("aria-invalid", "true");
    valid = false;
  }
  if (!elements.eventStart.value || !elements.eventEnd.value || elements.eventStart.value >= elements.eventEnd.value) {
    elements.timeError.textContent = "Godzina zakończenia musi być późniejsza niż rozpoczęcia.";
    elements.eventEnd.setAttribute("aria-invalid", "true");
    valid = false;
  }
  if (currentScope() === "single" && !elements.eventDate.value) valid = false;
  return valid;
}

function eventFromForm() {
  const scope = currentScope();
  const existingId = elements.eventId.value;
  const common = {
    id: existingId || makeId(scope),
    title: elements.eventTitle.value.trim(),
    category: elements.eventCategory.value,
    start: elements.eventStart.value,
    end: elements.eventEnd.value,
    place: elements.eventPlace.value.trim(),
    note: elements.eventNote.value.trim(),
  };
  if (elements.eventForm.dataset.accent) common.accent = elements.eventForm.dataset.accent;
  if (scope === "base") return { ...common, weekday: Number(elements.eventWeekday.value) };
  return { ...common, date: elements.eventDate.value };
}

function checkConflict() {
  const start = elements.eventStart.value;
  const end = elements.eventEnd.value;
  if (!start || !end || start >= end) {
    elements.conflictNote.hidden = true;
    return;
  }
  let candidateEvents = [];
  if (currentScope() === "single" && elements.eventDate.value) {
    candidateEvents = getEventsForDate(fromDateKey(elements.eventDate.value), false);
  } else if (currentScope() === "base") {
    candidateEvents = state.baseEvents.filter((event) => Number(event.weekday) === Number(elements.eventWeekday.value));
  }
  const editId = elements.eventId.value || elements.eventForm.dataset.overrideBaseId;
  elements.conflictNote.hidden = !candidateEvents.some((event) => event.id !== editId && eventsOverlap({ start, end }, event));
}

function saveEvent(event) {
  const scope = currentScope();
  const editing = Boolean(elements.eventId.value);
  if (scope === "base") {
    if (editing) state.baseEvents = state.baseEvents.map((item) => item.id === event.id ? { ...item, ...event } : item);
    else state.baseEvents.push(event);
  } else {
    if (editing) state.customEvents = state.customEvents.map((item) => item.id === event.id ? event : item);
    else state.customEvents.push(event);
    const overrideBaseId = elements.eventForm.dataset.overrideBaseId;
    const overrideDate = elements.eventForm.dataset.overrideDate;
    if (overrideBaseId && overrideDate) {
      const key = cancellationKey(overrideBaseId, overrideDate);
      if (!state.cancellations.includes(key)) state.cancellations.push(key);
    }
    selectedDate = fromDateKey(event.date);
  }
  persist();
  renderAll();
  showToast(editing ? "Zmiany zostały zapisane" : "Wydarzenie zostało dodane");
}

function deleteCurrentEvent() {
  const id = elements.eventId.value;
  const scope = elements.eventForm.dataset.editScope;
  if (!id) return;
  const message = scope === "base"
    ? "Usunąć te zajęcia ze wszystkich tygodni planu bazowego?"
    : "Usunąć to wydarzenie?";
  if (!window.confirm(message)) return;
  if (scope === "base") {
    state.baseEvents = state.baseEvents.filter((event) => event.id !== id);
    state.cancellations = state.cancellations.filter((key) => !key.startsWith(`${id}@`));
  } else {
    state.customEvents = state.customEvents.filter((event) => event.id !== id);
  }
  persist();
  closeDialog(elements.eventDialog);
  renderAll();
  showToast("Wydarzenie zostało usunięte");
}

function openDetails(event, date) {
  const category = getCategory(event);
  const dateKey = toDateKey(date);
  const cancelled = state.cancellations.includes(cancellationKey(event.id, dateKey));
  elements.detailsDialog.dataset.eventId = event.id;
  elements.detailsDialog.dataset.date = dateKey;
  elements.detailAccent.style.background = category.color;
  elements.detailCategory.textContent = category.label.toUpperCase();
  elements.detailTitle.textContent = event.title;
  elements.detailInfo.innerHTML = `
    <span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><strong>${event.start}–${event.end}</strong></span>
    <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v3M17 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/></svg><strong>${new Intl.DateTimeFormat("pl-PL", { weekday: "long", day: "numeric", month: "long" }).format(date)}</strong></span>
    ${event.place ? `<span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/></svg><strong>${escapeHtml(event.place)}</strong></span>` : ""}
    ${event.note ? `<p>${escapeHtml(event.note)}</p>` : ""}
    ${cancelled ? '<p class="cancelled-notice">To wystąpienie jest odwołane.</p>' : ""}
  `;
  elements.cancelOccurrenceButton.hidden = cancelled;
  elements.editOccurrenceButton.hidden = cancelled;
  elements.restoreOccurrenceButton.hidden = !cancelled;
  elements.detailsDialog.showModal();
  document.body.classList.add("dialog-open");
}

function findDetailEvent() {
  return state.baseEvents.find((event) => event.id === elements.detailsDialog.dataset.eventId);
}

function setOccurrenceCancelled(cancelled) {
  const id = elements.detailsDialog.dataset.eventId;
  const dateKey = elements.detailsDialog.dataset.date;
  const key = cancellationKey(id, dateKey);
  if (cancelled && !state.cancellations.includes(key)) state.cancellations.push(key);
  if (!cancelled) state.cancellations = state.cancellations.filter((value) => value !== key);
  persist();
  closeDialog(elements.detailsDialog);
  renderAll();
  showToast(cancelled ? "Zajęcia odwołane tylko w tym dniu" : "Zajęcia zostały przywrócone");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 2800);
}

function setSyncStatus(status, title, detail) {
  elements.syncCard.dataset.status = status;
  elements.syncStatusText.textContent = title;
  elements.syncStatusDetail.textContent = detail;
}

function updateSyncCodeControls() {
  elements.syncCodeButton.textContent = syncCode ? "Zmień kod" : syncLocked ? "Wpisz kod" : "Ustaw kod";
  elements.clearSyncCodeButton.hidden = !syncCode;
}

function openSyncCodeDialog() {
  elements.syncCodeInput.value = syncCode;
  elements.syncCodeError.textContent = "";
  updateSyncCodeControls();
  elements.syncCodeDialog.showModal();
  document.body.classList.add("dialog-open");
  setTimeout(() => {
    elements.syncCodeInput.focus();
    elements.syncCodeInput.select();
  }, 120);
}

function syncRequestHeaders(initial = {}) {
  const headers = new Headers(initial);
  if (syncCode) headers.set("Authorization", `Bearer ${syncCode}`);
  return headers;
}

function syncResponseError(response, payload = null) {
  if (response.status === 401) return new Error("sync-code-required");
  if (response.status === 404 || response.status === 405) return new Error("sync-unavailable");
  if (response.status === 503 && payload?.code === "SYNC_AUTH_NOT_CONFIGURED") {
    return new Error("sync-auth-not-configured");
  }
  return new Error("sync-failed");
}

function syncedTimeLabel(timestamp = Date.now()) {
  return `Ostatnia kontrola: ${new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit" }).format(timestamp)}`;
}

function queueCloudSync() {
  clearTimeout(syncDebounceTimer);
  setSyncStatus("pending", "Zmiany zapisane", "Za chwilę wyślę je na pozostałe urządzenia");
  syncDebounceTimer = setTimeout(() => syncWithCloud(), 650);
}

async function putCloudState() {
  const response = await fetch("/api/sync", {
    method: "PUT",
    headers: syncRequestHeaders({ "Content-Type": "application/json" }),
    cache: "no-store",
    body: JSON.stringify({ state, updatedAt: state.meta.updatedAt }),
  });
  const payload = await response.json().catch(() => null);
  if (response.status === 409 && payload?.state) {
    state = normalizeState(payload.state);
    state.meta.updatedAt = Number(payload.updatedAt) || Date.now();
    persist({ touch: false, sync: false });
    renderAll();
    return "downloaded";
  }
  if (!response.ok || !payload) throw syncResponseError(response, payload);
  return "uploaded";
}

async function performCloudSync() {
  if (!navigator.onLine) {
    setSyncStatus("offline", "Tryb offline", "Zmiany wyślę automatycznie po odzyskaniu internetu");
    return "offline";
  }
  setSyncStatus("syncing", "Synchronizuję…", "Sprawdzam najnowszy plan");
  const response = await fetch("/api/sync", {
    cache: "no-store",
    headers: syncRequestHeaders({ Accept: "application/json" }),
  });
  const contentType = response.headers.get("content-type") || "";
  const remote = contentType.includes("application/json") ? await response.json().catch(() => null) : null;
  if (!response.ok || !remote) throw syncResponseError(response, remote);
  const remoteUpdatedAt = Number(remote.updatedAt) || 0;
  const localUpdatedAt = Number(state.meta.updatedAt) || 0;

  if (remote.state && remoteUpdatedAt > localUpdatedAt) {
    state = normalizeState(remote.state);
    state.meta.updatedAt = remoteUpdatedAt;
    persist({ touch: false, sync: false });
    renderAll();
    return "downloaded";
  }

  if (!remote.state && !localUpdatedAt) {
    state.meta.updatedAt = 1;
    persist({ touch: false, sync: false });
  }

  if (!remote.state || Number(state.meta.updatedAt) > remoteUpdatedAt) return putCloudState();
  return "current";
}

function syncWithCloud({ announce = false, retryUnavailable = false } = {}) {
  if (syncUnavailable && !retryUnavailable) return Promise.resolve("unavailable");
  if (syncInFlight) return syncInFlight;
  syncInFlight = performCloudSync()
    .then((result) => {
      syncUnavailable = false;
      if (result !== "offline") {
        syncLocked = false;
        updateSyncCodeControls();
        const message = result === "downloaded" ? "Plan pobrany z drugiego urządzenia" : "Plan zsynchronizowany";
        setSyncStatus("synced", message, syncedTimeLabel());
        if (announce) showToast(message);
      }
      return result;
    })
    .catch((error) => {
      if (error.message === "sync-code-required") {
        syncLocked = true;
        updateSyncCodeControls();
        setSyncStatus(
          "locked",
          syncCode ? "Kod jest nieprawidłowy" : "Wpisz kod synchronizacji",
          syncCode ? "Sprawdź kod zapisany na tym urządzeniu" : "Kod wpisujesz tylko raz na każdym urządzeniu",
        );
        if (announce) openSyncCodeDialog();
      } else if (error.message === "sync-auth-not-configured") {
        syncUnavailable = true;
        setSyncStatus("unavailable", "Czeka na konfigurację", "Na serwerze trzeba ustawić skrót kodu synchronizacji");
      } else if (error.message === "sync-unavailable") {
        syncUnavailable = true;
        setSyncStatus("unavailable", "Tylko na tym urządzeniu", "Synchronizacja działa w opublikowanej wersji aplikacji");
      } else {
        setSyncStatus("offline", "Nie udało się połączyć", "Plan jest bezpiecznie zapisany na tym urządzeniu");
      }
      return "error";
    })
    .finally(() => {
      syncInFlight = null;
    });
  return syncInFlight;
}

function jumpToToday() {
  selectedDate = new Date();
  selectedDate.setHours(12, 0, 0, 0);
  switchView("plan");
  renderPlan();
}

function exportData() {
  const payload = {
    ...state,
    exportedAt: new Date().toISOString(),
    app: "Mój Plan",
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `moj-plan-${toDateKey(new Date())}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  showToast("Kopia planu została pobrana");
}

async function importData(file) {
  try {
    const candidate = JSON.parse(await file.text());
    const normalized = normalizeState(candidate);
    if (!normalized.baseEvents.length && !normalized.customEvents.length) throw new Error("empty");
    if (!window.confirm("Wczytanie kopii zastąpi obecny plan. Kontynuować?")) return;
    state = normalized;
    persist();
    renderAll();
    showToast("Kopia planu została wczytana");
  } catch {
    showToast("Nie udało się wczytać tego pliku");
  } finally {
    elements.importFile.value = "";
  }
}

function saveSyncCodeFromForm() {
  const value = elements.syncCodeInput.value.trim();
  if (!isValidSyncCode(value)) {
    elements.syncCodeInput.setAttribute("aria-invalid", "true");
    elements.syncCodeError.textContent = "Kod musi mieć co najmniej 16 znaków i może zawierać litery, cyfry, - oraz _.";
    return;
  }
  try {
    localStorage.setItem(SYNC_CODE_KEY, value);
  } catch {
    elements.syncCodeError.textContent = "Przeglądarka nie pozwala zapamiętać kodu na tym urządzeniu.";
    return;
  }
  syncCode = value;
  syncLocked = false;
  syncUnavailable = false;
  elements.syncCodeInput.removeAttribute("aria-invalid");
  updateSyncCodeControls();
  closeDialog(elements.syncCodeDialog);
  setSyncStatus("syncing", "Sprawdzam kod…", "Łączę to urządzenie z planem");
  syncWithCloud({ announce: true, retryUnavailable: true });
}

function clearSyncCode() {
  try {
    localStorage.removeItem(SYNC_CODE_KEY);
  } catch {
    // Kod i tak przestaje być używany w tej sesji.
  }
  syncCode = "";
  syncLocked = true;
  syncUnavailable = false;
  updateSyncCodeControls();
  closeDialog(elements.syncCodeDialog);
  setSyncStatus("locked", "Kod usunięty", "Wpisz kod ponownie, aby synchronizować ten plan");
  showToast("Kod usunięty z tego urządzenia");
}

function registerInteractions() {
  elements.previousWeek.addEventListener("click", () => {
    selectedDate = addDays(selectedDate, -7);
    renderPlan();
  });
  elements.nextWeek.addEventListener("click", () => {
    selectedDate = addDays(selectedDate, 7);
    renderPlan();
  });
  elements.fitTableButton.addEventListener("click", toggleTimetableFit);
  elements.jumpTodayButton.addEventListener("click", jumpToToday);
  elements.addButton.addEventListener("click", () => openEventForm({ scope: currentView === "base" ? "base" : "single", date: selectedDate }));
  elements.addBaseButton.addEventListener("click", () => openEventForm({ scope: "base", date: selectedDate }));
  elements.navItems.forEach((item) => item.addEventListener("click", () => switchView(item.dataset.target)));

  elements.eventForm.elements.scope.forEach((radio) => radio.addEventListener("change", syncScopeFields));
  [elements.eventDate, elements.eventWeekday, elements.eventStart, elements.eventEnd].forEach((input) => input.addEventListener("input", checkConflict));
  elements.eventForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!validateForm()) return;
    saveEvent(eventFromForm());
    closeDialog(elements.eventDialog);
  });
  elements.closeEventDialog.addEventListener("click", () => closeDialog(elements.eventDialog));
  elements.cancelEventButton.addEventListener("click", () => closeDialog(elements.eventDialog));
  elements.deleteEventButton.addEventListener("click", deleteCurrentEvent);
  elements.eventDialog.addEventListener("click", (event) => {
    if (event.target === elements.eventDialog) closeDialog(elements.eventDialog);
  });
  elements.eventDialog.addEventListener("close", syncDialogState);

  elements.closeDetailsDialog.addEventListener("click", () => closeDialog(elements.detailsDialog));
  elements.detailsDialog.addEventListener("click", (event) => {
    if (event.target === elements.detailsDialog) closeDialog(elements.detailsDialog);
  });
  elements.detailsDialog.addEventListener("close", syncDialogState);
  elements.editFromDetailsButton.addEventListener("click", () => {
    const event = findDetailEvent();
    if (!event) return;
    closeDialog(elements.detailsDialog);
    openEventForm({ event: { ...event, source: "base" }, scope: "base" });
  });
  elements.editOccurrenceButton.addEventListener("click", () => {
    const event = findDetailEvent();
    if (!event) return;
    const date = fromDateKey(elements.detailsDialog.dataset.date);
    closeDialog(elements.detailsDialog);
    openEventForm({ template: event, scope: "single", date });
  });
  elements.cancelOccurrenceButton.addEventListener("click", () => setOccurrenceCancelled(true));
  elements.restoreOccurrenceButton.addEventListener("click", () => setOccurrenceCancelled(false));

  elements.exportButton.addEventListener("click", exportData);
  elements.syncNowButton.addEventListener("click", () => {
    if (syncLocked) {
      openSyncCodeDialog();
      return;
    }
    syncWithCloud({ announce: true, retryUnavailable: true });
  });
  elements.syncCodeButton.addEventListener("click", openSyncCodeDialog);
  elements.syncCodeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveSyncCodeFromForm();
  });
  elements.syncCodeInput.addEventListener("input", () => {
    elements.syncCodeInput.removeAttribute("aria-invalid");
    elements.syncCodeError.textContent = "";
  });
  elements.closeSyncCodeDialog.addEventListener("click", () => closeDialog(elements.syncCodeDialog));
  elements.cancelSyncCodeButton.addEventListener("click", () => closeDialog(elements.syncCodeDialog));
  elements.clearSyncCodeButton.addEventListener("click", clearSyncCode);
  elements.syncCodeDialog.addEventListener("click", (event) => {
    if (event.target === elements.syncCodeDialog) closeDialog(elements.syncCodeDialog);
  });
  elements.syncCodeDialog.addEventListener("close", syncDialogState);
  elements.importButton.addEventListener("click", () => elements.importFile.click());
  elements.importFile.addEventListener("change", () => {
    const [file] = elements.importFile.files;
    if (file) importData(file);
  });
  elements.resetButton.addEventListener("click", () => {
    if (!window.confirm("Usunąć własne wpisy i przywrócić początkowy plan z tabeli?")) return;
    state = freshState();
    persist();
    renderAll();
    showToast("Przywrócono początkowy plan");
  });

  elements.installButton.addEventListener("click", async () => {
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      return;
    }
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    showToast(isIos ? "W Safari wybierz Udostępnij → Do ekranu początkowego" : "W menu przeglądarki wybierz „Zainstaluj aplikację”");
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
  });
  window.addEventListener("hashchange", () => {
    const view = location.hash.slice(1);
    if (["plan", "base", "more"].includes(view)) switchView(view);
  });
  window.addEventListener("resize", updateTimetableFit);
  window.addEventListener("orientationchange", () => setTimeout(updateTimetableFit, 120));
  window.addEventListener("online", () => syncWithCloud({ retryUnavailable: true }));
  window.addEventListener("offline", () => setSyncStatus("offline", "Tryb offline", "Zmiany wyślę automatycznie po odzyskaniu internetu"));
  window.addEventListener("focus", () => syncWithCloud());
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) syncWithCloud();
  });
}

function initialize() {
  elements.eventCategory.innerHTML = Object.entries(CATEGORY_CONFIG)
    .map(([value, category]) => `<option value="${value}">${category.label}</option>`)
    .join("");
  elements.todayBadge.textContent = new Intl.DateTimeFormat("pl-PL", { weekday: "short" }).format(new Date()).replace(".", "").toUpperCase();
  updateSyncCodeControls();
  registerInteractions();
  const initialView = ["plan", "base", "more"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "plan";
  renderAll();
  switchView(initialView);
  syncWithCloud({ retryUnavailable: true });

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
  }
  setInterval(() => {
    if (currentView === "plan") renderPlan();
  }, 60_000);
  setInterval(() => {
    if (!document.hidden) syncWithCloud();
  }, SYNC_INTERVAL);
}

initialize();
