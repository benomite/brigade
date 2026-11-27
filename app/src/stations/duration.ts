// Une durée, telle que la ligne la dit.
export function duration(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "less than a minute";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return minutes % 60 === 0 ? `${hours} h` : `${hours} h ${String(minutes % 60).padStart(2, "0")}`;
  return `${Math.floor(hours / 24)} days`;
}
