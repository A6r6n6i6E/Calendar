import test from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  durationMinutes,
  eventsOverlap,
  formatDuration,
  fromDateKey,
  getTimelineRange,
  layoutEventLanes,
  startOfWeek,
  toDateKey,
  weekdayNumber,
} from "../utils.js";
import { INITIAL_BASE_EVENTS, TIME_SLOTS } from "../data.js";

test("wyznacza poniedziałek jako początek tygodnia", () => {
  const tuesday = fromDateKey("2026-09-01");
  assert.equal(toDateKey(startOfWeek(tuesday)), "2026-08-31");
  assert.equal(weekdayNumber(startOfWeek(tuesday)), 1);
});

test("dodaje dni bez konwersji do UTC", () => {
  assert.equal(toDateKey(addDays(fromDateKey("2026-09-01"), 6)), "2026-09-07");
});

test("wykrywa nakładające się wydarzenia", () => {
  assert.equal(eventsOverlap({ start: "11:20", end: "12:05" }, { start: "12:00", end: "12:30" }), true);
  assert.equal(eventsOverlap({ start: "11:20", end: "12:05" }, { start: "12:05", end: "12:30" }), false);
});

test("liczy i opisuje czas trwania", () => {
  assert.equal(durationMinutes("11:20", "12:05"), 45);
  assert.equal(formatDuration(135), "2 godz. 15 min");
});

test("plan bazowy odpowiada dostarczonej tabeli", () => {
  const countsByDay = Object.groupBy(INITIAL_BASE_EVENTS, (event) => event.weekday);
  assert.equal(INITIAL_BASE_EVENTS.length, 11);
  assert.equal(countsByDay[1].length, 4);
  assert.equal(countsByDay[2], undefined);
  assert.equal(countsByDay[3].length, 2);
  assert.equal(countsByDay[4].length, 3);
  assert.equal(countsByDay[5].length, 2);
  assert.deepEqual(
    INITIAL_BASE_EVENTS.filter((event) => event.weekday === 5).map((event) => [event.start, event.end, event.title]),
    [["11:20", "12:05", "7 matematyka"], ["12:15", "13:00", "7 fizyka"]],
  );
});

test("siatka tygodnia zawiera dziewięć godzin z tabeli", () => {
  assert.equal(TIME_SLOTS.length, 9);
  assert.deepEqual(TIME_SLOTS[0], { number: 1, start: "08:30", end: "09:15" });
  assert.deepEqual(TIME_SLOTS.at(-1), { number: 9, start: "16:05", end: "16:50" });
  for (const event of INITIAL_BASE_EVENTS) {
    assert.equal(TIME_SLOTS.some((slot) => slot.start === event.start && slot.end === event.end), true);
  }
});

test("elastyczna oś czasu rozszerza się dla wydarzeń poza planem lekcji", () => {
  assert.deepEqual(getTimelineRange([
    { start: "07:25", end: "08:10" },
    { start: "17:35", end: "19:20" },
  ]), { start: 7 * 60, end: 20 * 60 });
});

test("nakładające się wydarzenia otrzymują osobne pasy", () => {
  const layout = layoutEventLanes([
    { id: "a", start: "13:10", end: "14:35" },
    { id: "b", start: "13:30", end: "14:00" },
    { id: "c", start: "14:35", end: "15:05" },
  ]);
  const first = layout.find((event) => event.id === "a");
  const second = layout.find((event) => event.id === "b");
  const third = layout.find((event) => event.id === "c");
  assert.equal(first.laneCount, 2);
  assert.notEqual(first.lane, second.lane);
  assert.equal(third.laneCount, 1);
});
