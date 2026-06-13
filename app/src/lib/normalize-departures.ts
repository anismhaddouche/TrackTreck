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

// Arrival times: prefer the real flight-plan value when present; only derive
// `arrival = departure + 1h` as a fallback when the arrival is missing. This
// preserves authentic times coming from a flight plan (e.g. 13:45, 13:15) while
// still guaranteeing a non-null arrival for the `NOT NULL` DB columns whenever a
// departure timestamp exists. If a departure is missing/invalid the arrival is
// left null (the row is incomplete and the caller should skip it).
function hasValue(v: string | null | undefined): v is string {
  return typeof v === "string" && v.trim() !== "";
}

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
    const fwdArr = hasValue(dep.flight_arrival_time)
      ? dep.flight_arrival_time
      : dep.flight_departure_time
        ? addOneHourToIsoLocal(dep.flight_departure_time)
        : "";
    const retArr = hasValue(dep.return_flight_arrival_time)
      ? dep.return_flight_arrival_time
      : dep.return_flight_departure_time
        ? addOneHourToIsoLocal(dep.return_flight_departure_time)
        : "";
    return {
      ...dep,
      flight_arrival_time: fwdArr || null,
      return_flight_arrival_time: retArr || null,
    };
  });
}
