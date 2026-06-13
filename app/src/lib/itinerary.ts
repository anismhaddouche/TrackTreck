// Itinéraire : nouveau format imposé par le PO.
//
//   [
//     { "day": 1, "title": "Titre court", "items": ["Activité 1", "Activité 2"] }
//   ]
//
// Les anciennes offres (et certaines branches du pipeline n8n) peuvent encore
// fournir l'ancien format objet { day_1: "...", day_2: "..." }, une chaîne JSON,
// `null` ou `{}`. `normalizeItinerary` ramène tout cela vers le tableau ci-dessus.

export interface ItineraryDay {
  day: number;
  title: string;
  items: string[];
}

function toItems(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => (s == null ? "" : String(s)).trim())
    .filter((s) => s.length > 0);
}

export function normalizeItinerary(input: unknown): ItineraryDay[] {
  if (input == null) return [];

  // Chaîne JSON -> on parse puis on renormalise.
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return [];
    try {
      return normalizeItinerary(JSON.parse(trimmed));
    } catch {
      return [];
    }
  }

  // Nouveau format : tableau de jours.
  if (Array.isArray(input)) {
    return input
      .map((entry, idx): ItineraryDay | null => {
        if (!entry || typeof entry !== "object") return null;
        const e = entry as Record<string, unknown>;
        const dayNum = Number(e.day);
        const title = typeof e.title === "string" ? e.title.trim() : "";
        const items = toItems(e.items);
        if (!title && items.length === 0) return null;
        return {
          day: Number.isFinite(dayNum) && dayNum > 0 ? dayNum : idx + 1,
          title,
          items,
        };
      })
      .filter((d): d is ItineraryDay => d !== null);
  }

  // Ancien format objet : { day_1: "texte", day_2: "texte" } (ou {} -> []).
  if (typeof input === "object") {
    const days: ItineraryDay[] = [];
    let fallbackIdx = 0;
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      fallbackIdx += 1;
      const match = String(key).match(/^day[_\s]?(\d+)$/i);
      const dayNum = match ? Number(match[1]) : fallbackIdx;
      const text = typeof value === "string" ? value.trim() : "";
      if (!text) continue;
      days.push({ day: dayNum, title: text, items: [] });
    }
    return days.sort((a, b) => a.day - b.day);
  }

  return [];
}
