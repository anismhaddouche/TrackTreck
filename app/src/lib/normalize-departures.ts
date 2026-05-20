import type { Departure } from "./types";

// Adds exactly one hour to a `YYYY-MM-DDTHH:mm[:ss]` local ISO string and
// returns the same shape. Handles day/month/year rollover via the Date object.
// Returns "" for empty/malformed inputs — callers should treat that as
// "leave the field unchanged" or "clear the arrival field".
//
// The function intentionally does NOT introduce a timezone suffix (`Z`) — it
// preserves the local-ISO format used across the form, the API payload, and
// the Postgres `timestamptz` casts in the n8n ingestion SQL.
export function addOneHourToIsoLocal(
  value: string | null | undefined,
): string {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    value.trim(),
  );
  if (!m) return "";
  const [, y, mo, d, h, mi, s] = m;
  const date = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    s ? Number(s) : 0,
  );
  if (Number.isNaN(date.getTime())) return "";
  date.setHours(date.getHours() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  const base = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return s ? `${base}:${pad(date.getSeconds())}` : base;
}

// Business rule: arrival = departure + 1h, for both outbound and return.
// This overrides any value the LLM extractor may have produced — the only
// authoritative inputs are the departure timestamps. If a departure is
// missing/invalid, the corresponding arrival is set to null.
export function normalizeDepartureTimes<
  T extends Pick<
    Departure,
    | "flight_departure_time"
    | "flight_arrival_time"
    | "return_flight_departure_time"
    | "return_flight_arrival_time"
  >,
>(departures: T[]): T[] {
  return departures.map((dep) => {
    const fwdArr = dep.flight_departure_time
      ? addOneHourToIsoLocal(dep.flight_departure_time)
      : "";
    const retArr = dep.return_flight_departure_time
      ? addOneHourToIsoLocal(dep.return_flight_departure_time)
      : "";
    return {
      ...dep,
      flight_arrival_time: fwdArr || null,
      return_flight_arrival_time: retArr || null,
    };
  });
}
