const ZONED_ISO_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|([+-])(\d{2}):?(\d{2}))$/i;

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Parse an ISO timestamp only when its calendar fields and UTC offset are real. */
export function parseZonedTimestamp(value: string): number | null {
  const timestamp = value.trim();
  const match = timestamp.match(ZONED_ISO_TIMESTAMP);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText = "0"] =
    match;
  const [year, month, day, hour, minute, second] = [
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
  ].map(Number);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }

  if (match[7].toUpperCase() !== "Z") {
    const offsetHour = Number(match[9]);
    const offsetMinute = Number(match[10]);
    // ISO 8601 permits offsets through ±14:00, but not beyond it.
    if (
      offsetHour > 14 ||
      offsetMinute > 59 ||
      (offsetHour === 14 && offsetMinute !== 0)
    ) {
      return null;
    }
  }

  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : null;
}
