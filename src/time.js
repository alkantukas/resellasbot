// Parsing of giveaway end dates ("2026-10-31") and durations ("5h", "2 dienos").

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Checked in order; the first matching prefix wins.
const UNITS = [
  { re: /^(w|wk|week|sav)/, ms: 7 * DAY },
  { re: /^(d|day|dien|par)/, ms: DAY },
  { re: /^(h|hr|hour|val)/, ms: HOUR },
  { re: /^(mėn|men|mon)/, ms: null }, // months are not supported (ambiguous length)
  { re: /^(m|min|minut)/, ms: MINUTE },
  { re: /^(s|sek|sec)/, ms: 1000 },
];

/** "5h", "5 val", "1d 12h", "90 min", "2 dienos" -> milliseconds, or null if not understood. */
function parseDuration(input) {
  const text = String(input).toLowerCase().trim();
  const tokenRe = /(\d+(?:[.,]\d+)?)\s*([a-ząčęėįšųūž]+)\.?/g;
  let total = 0;
  let matched = false;
  let match;
  while ((match = tokenRe.exec(text))) {
    const amount = Number(match[1].replace(',', '.'));
    const unit = UNITS.find((u) => u.re.test(match[2]));
    if (!unit || unit.ms === null) return null;
    total += amount * unit.ms;
    matched = true;
  }
  // Anything left over besides separators means we did not understand the input.
  const leftover = text.replace(tokenRe, '').replace(/\b(ir|and)\b/g, '').replace(/[\s,]+/g, '');
  if (!matched || leftover) return null;
  return Math.round(total);
}

// How far `timeZone` is ahead of UTC at the given moment, in ms.
function tzOffset(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * "2026-10-31" (ends at 23:59 that day) or "2026-10-31 18:00", read in the given
 * time zone -> Unix ms, or null if the date is invalid.
 */
function parseDate(input, timeZone) {
  const m = String(input).trim().match(/^(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})(?:[ T]+(\d{1,2})[:.](\d{2}))?$/);
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const [h, mi] = m[4] !== undefined ? [+m[4], +m[5]] : [23, 59];
  if (h > 23 || mi > 59) return null;
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(wall);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  // Two passes handle the hour around daylight-saving changes.
  let utc = wall - tzOffset(new Date(wall), timeZone);
  utc = wall - tzOffset(new Date(utc), timeZone);
  return utc;
}

/**
 * Date written out in Lithuanian, e.g. "2026 m. spalio 24 d., šeštadienis 15:31".
 * (Discord's own <t:…> timestamps follow each viewer's app language, often English.)
 */
function ltDate(ms, timeZone = process.env.TIMEZONE || 'Europe/Vilnius') {
  return new Intl.DateTimeFormat('lt-LT', {
    timeZone,
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(ms));
}

module.exports = { parseDuration, parseDate, ltDate, MINUTE, HOUR, DAY };
