export function getMetricsLabel(key: string) {
  return key.replace(/([A-Z])/g, " $1").toLowerCase();
}
