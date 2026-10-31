export function validTimeZone(zone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone }).format();
    return true;
  } catch {
    return false;
  }
}
export function localDate(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"]
    .map((type) => parts.find((p) => p.type === type)!.value)
    .join("-");
}
export function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}
export function daysBetween(earlier: string, later: string) {
  return Math.round(
    (Date.parse(`${later}T12:00:00Z`) - Date.parse(`${earlier}T12:00:00Z`)) /
      86400000,
  );
}
export function nextRollover(now: Date, timeZone: string) {
  const today = localDate(now, timeZone);
  // Binary search avoids assumptions about 23/24/25-hour days or UTC offsets.
  let low = now.getTime(),
    high = low + 48 * 3600000;
  while (high - low > 1000) {
    const middle = Math.floor((low + high) / 2);
    if (localDate(new Date(middle), timeZone) === today) low = middle;
    else high = middle;
  }
  return new Date(high).toISOString();
}
