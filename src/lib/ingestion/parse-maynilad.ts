// Narrow parsers for Maynilad's advisory date + time formats (observed verbatim in recon).
//
// Date format observed: "October 15, 2026" (also "October 01, 2026" with a leading-zero day).
//   -> Date at 00:00 Asia/Manila (UTC+08:00). No timezone in the source string, so we assume +08:00.
//
// Time format observed: "11:00 PM to 6:00 AM" (case varies: "PM"/"pm", "AM"/"am").
//   -> { startH, startM, endH, endM } in 24h terms.
//
// Combine: date + time -> Date at +08:00.
//
// If a format we haven't seen appears, throw — do not silently guess.

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
] as const;

const MONTH_RE = new RegExp(
  `^(${MONTH_NAMES.join('|')})\\s+(\\d{1,2}),\\s+(\\d{4})$`,
  'i',
);

const TIME_WINDOW_RE = /^(\d{1,2}):(\d{2})\s*([AP]M)\s+to\s+(\d{1,2}):(\d{2})\s*([AP]M)$/i;

export type TimeWindow = { startH: number; startM: number; endH: number; endM: number };

export function parseMayniladDate(raw: string): Date {
  const m = MONTH_RE.exec(raw.trim());
  if (!m) throw new Error(`unrecognized Maynilad date format: ${raw}`);
  const monthIndex = MONTH_NAMES.indexOf(m[1]!.toLowerCase() as (typeof MONTH_NAMES)[number]);
  if (monthIndex < 0) throw new Error(`unrecognized month in: ${raw}`);
  const day = parseInt(m[2]!, 10);
  const year = parseInt(m[3]!, 10);
  if (day < 1 || day > 31 || year < 1900 || year > 2100) {
    throw new Error(`out-of-range date components in: ${raw}`);
  }
  // "October 15, 2026" means the calendar day Oct 15 in Manila (UTC+08:00).
  // Midnight Manila on Oct 15 = 16:00 UTC on Oct 14.
  const manilaMidnightUTC = Date.UTC(year, monthIndex, day - 1, 16, 0, 0, 0);
  return new Date(manilaMidnightUTC);
}

export function parseMayniladTimeWindow(raw: string): TimeWindow {
  const m = TIME_WINDOW_RE.exec(raw.trim());
  if (!m) throw new Error(`unrecognized Maynilad time-window format: ${raw}`);
  const startH = parseInt(m[1]!, 10);
  const startM = parseInt(m[2]!, 10);
  const startPeriod = m[3]!.toUpperCase();
  const endH = parseInt(m[4]!, 10);
  const endM = parseInt(m[5]!, 10);
  const endPeriod = m[6]!.toUpperCase();

  const to24 = (h: number, period: string) => {
    if (h < 1 || h > 12) throw new Error(`hour out of range in: ${raw}`);
    if (period === 'AM') return h === 12 ? 0 : h;
    return h === 12 ? 12 : h + 12;
  };
  if (startM > 59 || endM > 59) throw new Error(`minute out of range in: ${raw}`);

  return {
    startH: to24(startH, startPeriod),
    startM,
    endH: to24(endH, endPeriod),
    endM,
  };
}

export function combineDateAndTime(date: Date, tw: TimeWindow): Date {
  // date is already at 00:00 Manila (UTC+8). Add the start-of-window offset.
  const ms = date.getTime() + tw.startH * 3600 * 1000 + tw.startM * 60 * 1000;
  return new Date(ms);
}

/** End of the time window, as a Date at +08:00. Useful for endsAt when the table gives From/To as dates
 *  and Time as a single window crossing midnight. In that common case endsAt = combineDateAndTime(toDate, tw). */
export function combineDateAndTimeEnd(date: Date, tw: TimeWindow): Date {
  const ms = date.getTime() + tw.endH * 3600 * 1000 + tw.endM * 60 * 1000;
  return new Date(ms);
}
