import { todayIsoDate } from "./date";

export type CalendarEventInput = {
  title: string;
  dates: string[]; // YYYY-MM-DD; how these are used depends on recurrence (see buildCalendarUrls)
  startTime: string; // HH:MM, 24-hour; empty string if not set
  endTime: string; // HH:MM, 24-hour; empty string if not set
  location: string;
  description: string;
  meetingLink?: string;
  recurrence?: string;
};

export type CalendarUrlEntry = {
  date: string;
  url: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function toCompactDate(date: string): string {
  return date.replace(/-/g, "");
}

function addOneDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

function toCompactDateTime(date: string, time: string): string {
  return `${toCompactDate(date)}T${time.replace(":", "")}00`;
}

function buildSingleEventUrl(event: CalendarEventInput, date: string): string {
  // Only build a timed event when both start and end are present; otherwise
  // fall back to an all-day event on the given date (Google's all-day
  // "dates" range uses an exclusive end date, hence date + 1 day).
  const hasTimes = TIME_RE.test(event.startTime) && TIME_RE.test(event.endTime);
  const datesParam = hasTimes
    ? `${toCompactDateTime(date, event.startTime)}/${toCompactDateTime(date, event.endTime)}`
    : `${toCompactDate(date)}/${toCompactDate(addOneDay(date))}`;

  const detailsParts = [
    event.description.trim(),
    event.meetingLink?.trim() ? `Join: ${event.meetingLink.trim()}` : "",
  ].filter(Boolean);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: datesParam,
  });

  if (event.location.trim()) params.set("location", event.location.trim());
  if (detailsParts.length > 0) params.set("details", detailsParts.join("\n\n"));
  if (event.recurrence?.trim()) params.set("recur", event.recurrence.trim());

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Single-event convenience wrapper. Uses the first valid date as the anchor —
// correct for recurring events (recurrence expands from that one date) and
// for events with a single date, but collapses multiple *disjoint* dates
// into just the first one. Use buildCalendarUrls for the general case.
export function buildCalendarUrl(event: CalendarEventInput): string {
  const anchorDate = event.dates.find((d) => DATE_RE.test(d)) ?? todayIsoDate();
  return buildSingleEventUrl(event, anchorDate);
}

// Google Calendar's prefill URL can only represent one event (one date, or
// one date + a recurrence rule expanding from it) at a time. When an event
// has multiple disjoint dates and no recurrence rule (e.g. "4/14 AND 4/16"),
// there's no single URL that captures both — so this returns one URL per
// date instead of silently dropping all but the first.
export function buildCalendarUrls(event: CalendarEventInput): CalendarUrlEntry[] {
  const validDates = event.dates.filter((d) => DATE_RE.test(d));

  if (event.recurrence?.trim() || validDates.length <= 1) {
    const anchorDate = validDates[0] ?? todayIsoDate();
    return [{ date: anchorDate, url: buildSingleEventUrl(event, anchorDate) }];
  }

  return validDates.map((date) => ({ date, url: buildSingleEventUrl(event, date) }));
}
