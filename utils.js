export const DAY_MS = 24 * 60 * 60 * 1000;

export function pad(value) {
  return String(value).padStart(2, "0");
}

export function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromDateKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function addDays(date, amount) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

export function startOfWeek(date) {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setHours(12, 0, 0, 0);
  copy.setDate(copy.getDate() - day + 1);
  return copy;
}

export function weekdayNumber(date) {
  return date.getDay() || 7;
}

export function timeToMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(minutes) {
  const normalized = Math.max(0, Math.min(23 * 60 + 59, minutes));
  return `${pad(Math.floor(normalized / 60))}:${pad(normalized % 60)}`;
}

export function durationMinutes(start, end) {
  return Math.max(0, timeToMinutes(end) - timeToMinutes(start));
}

export function eventsOverlap(first, second) {
  return timeToMinutes(first.start) < timeToMinutes(second.end)
    && timeToMinutes(second.start) < timeToMinutes(first.end);
}

export function formatDuration(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes} min`;
  if (!minutes) return `${hours} godz.`;
  return `${hours} godz. ${minutes} min`;
}

export function isSameDay(first, second) {
  return toDateKey(first) === toDateKey(second);
}

export function getTimelineRange(events, defaultStart = 8 * 60, defaultEnd = 17 * 60) {
  const starts = events.map((event) => timeToMinutes(event.start));
  const ends = events.map((event) => timeToMinutes(event.end));
  const start = Math.max(0, Math.floor(Math.min(defaultStart, ...starts) / 60) * 60);
  const end = Math.min(24 * 60, Math.ceil(Math.max(defaultEnd, ...ends) / 60) * 60);
  return { start, end: Math.max(start + 60, end) };
}

export function layoutEventLanes(events) {
  const sorted = [...events]
    .map((event) => ({
      ...event,
      _startMinutes: timeToMinutes(event.start),
      _endMinutes: timeToMinutes(event.end),
    }))
    .sort((first, second) => first._startMinutes - second._startMinutes || first._endMinutes - second._endMinutes);
  const result = [];
  let cluster = [];
  let clusterEnd = -1;

  const flushCluster = () => {
    if (!cluster.length) return;
    const laneEnds = [];
    cluster.forEach((event) => {
      let lane = laneEnds.findIndex((end) => end <= event._startMinutes);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = event._endMinutes;
      event._lane = lane;
    });
    const laneCount = Math.max(1, laneEnds.length);
    cluster.forEach(({ _startMinutes, _endMinutes, _lane, ...event }) => {
      result.push({ ...event, lane: _lane, laneCount });
    });
    cluster = [];
  };

  sorted.forEach((event) => {
    if (cluster.length && event._startMinutes >= clusterEnd) flushCluster();
    cluster.push(event);
    clusterEnd = Math.max(clusterEnd, event._endMinutes);
  });
  flushCluster();
  return result;
}
