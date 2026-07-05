const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthLabel(date: Date): string {
  return `${MONTH_LABELS[date.getMonth()] ?? "Month"} ${date.getFullYear()}`;
}

function monthStartForDateKey(value: string): Date | null {
  const parsed = parseDateKey(value);
  if (!parsed) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
}

function dateKeysInRange(startKey: string | null, endKey: string | null): string[] {
  if (!startKey || !endKey) return [];
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  if (!start || !end || end.getTime() < start.getTime()) return [];

  const keys: string[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    keys.push(localDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

function parseDateKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1] ?? "0");
  const monthIndex = Number(match[2] ?? "1") - 1;
  const day = Number(match[3] ?? "1");
  const date = new Date(year, monthIndex, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export { dateKeysInRange, localDateKey, monthLabel, monthStartForDateKey };
