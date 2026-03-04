const ITALY_TIMEZONE = "Europe/Rome";

export function getTodayInItaly() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: ITALY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function dateKeyInItaly(input: string | Date) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    return getTodayInItaly();
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: ITALY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function localDateTimeDefault() {
  const now = new Date();
  const two = (value: number) => String(value).padStart(2, "0");
  const year = now.getFullYear();
  const month = two(now.getMonth() + 1);
  const day = two(now.getDate());
  const hour = two(now.getHours());
  const minute = two(now.getMinutes());
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function toIsoStringFromLocal(localDateTime: string) {
  if (!localDateTime) {
    return new Date().toISOString();
  }

  const parsed = new Date(localDateTime);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
}

export function computeHoursBetween(startTime: string, endTime: string) {
  const [startHours, startMinutes] = startTime.split(":").map(Number);
  const [endHours, endMinutes] = endTime.split(":").map(Number);

  if (
    Number.isNaN(startHours) ||
    Number.isNaN(startMinutes) ||
    Number.isNaN(endHours) ||
    Number.isNaN(endMinutes)
  ) {
    return 0;
  }

  const startTotal = startHours * 60 + startMinutes;
  const endTotal = endHours * 60 + endMinutes;

  if (endTotal <= startTotal) {
    return 0;
  }

  const minutes = endTotal - startTotal;
  return Math.round((minutes / 60) * 100) / 100;
}

export function formatEur(value: number | string) {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value).replace(",", "."));

  if (Number.isNaN(parsed)) {
    return "€0.00";
  }

  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(parsed);
}

function escapeCsvValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

export function toCsv<
  Row extends Record<string, unknown>,
  Header extends keyof Row,
>(rows: Row[], headers: Header[]) {
  const headerLine = headers.join(",");
  const bodyLines = rows.map((row) =>
    headers.map((header) => escapeCsvValue(row[header])).join(","),
  );
  return [headerLine, ...bodyLines].join("\n");
}

export function downloadCsv(filename: string, csvContent: string) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function sanitizeFileName(fileName: string) {
  return fileName.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
}
