export interface ReceiverConfig {
  host: "127.0.0.1";
  port: number;
}

// writer/plan.html section 3.2: strict decimal port; only absence selects the default.
export function parsePort(raw: string | undefined): number {
  if (raw === undefined) return 3000;
  if (!/^[0-9]+$/.test(raw)) throw new RangeError("PORT must be a decimal integer from 0 to 65535");
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new RangeError("PORT must be a decimal integer from 0 to 65535");
  }
  return port;
}
