export function formatCurrency(amount: number, currency = "ZAR"): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDuration(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours === 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateTime(date: Date): string {
  return `${date.toLocaleDateString("en-ZA")} ${formatTime(date)}`;
}

/** CA 123-456 */
export function formatPlate(plate: string): string {
  const normalised = plate.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

  if (normalised.length < 6) return normalised;

  return `${normalised.slice(0, 2)} ${normalised.slice(2, 5)}-${normalised.slice(5, 7)}`;
}