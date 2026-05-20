import { getSupabase, STORAGE_BUCKET } from "./supabase";
import { slugify } from "./utils";

// =============================================================================
// Source resolver for the admin "Source originale" panel.
//
// Strategy (intentionally minimal — see commit notes):
//   1. The offer row in Postgres already carries the source-of-truth list of
//      uploaded image URLs in `tours.photo_urls`. Each URL points to a real,
//      reachable object in the `travel-offer-assets` bucket.
//   2. We extract the object path from each photo URL and rebuild a fresh
//      public URL (no network call — getPublicUrl is synchronous).
//   3. The n8n ingestion workflow stores siblings of those images in the same
//      parent prefix (e.g. caption.txt, 01.pdf, source.pdf). We probe ONLY the
//      unique parent prefixes derived from photo_urls, and ONLY a handful of
//      well-known names.
//   4. All probes go through a module-level cache, keyed by absolute URL, so
//      a path is fetched at most once for the lifetime of the page.
//
// What we DO NOT do anymore:
//   - call supabase.storage.list() (anon RLS commonly forbids LIST → 400).
//   - brute-force candidate prefixes from country/agency/title slugs.
//   - re-probe the same path on every render / route change.
//   - retry the same 4xx response.
//
// Public surface (kept compatible with existing consumers):
//   resolveOfferSource, inferSourceLabelFromPhotoUrls, isDefaultAgencyName.
// =============================================================================

export type ResolveStatus = "ok" | "no-source" | "no-anchor" | "listing-blocked";

export interface ResolvedAsset {
  url: string;
  path: string;
  name: string;
  kind: "image" | "pdf" | "text";
}

export interface ResolvedSource {
  status: ResolveStatus;
  message?: string;
  imageUrls: string[];
  pdfUrl: string | null;
  pdfPath: string | null;
  pdfName: string | null;
  captionText: string | null;
  captionError: string | null;
  textFiles: ResolvedAsset[];
  probedPrefixes: string[];
  hasAny: boolean;
}

interface ResolveInput {
  offerId: number;
  agencyId: number | null;
  agencyName?: string | null;
  title?: string | null;
  countries: string[] | null;
  photoUrls: string[] | null;
}

interface ResolveOptions {
  signal?: AbortSignal;
}

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
const PDF_EXT = /\.pdf$/i;

// Cap how many distinct parent prefixes we probe. Almost every offer has 1.
const MAX_PREFIXES = 5;

// Well-known sibling filenames written by the n8n workflow.
const CAPTION_CANDIDATES = ["caption.txt"];
const PDF_CANDIDATES = ["01.pdf", "source.pdf", "offer.pdf", "document.pdf"];

// -----------------------------------------------------------------------------
// Module-level cache. Survives across offer changes within the same SPA load,
// so navigating offer-A → offer-B → offer-A does not re-probe anything.
// -----------------------------------------------------------------------------
type ProbeResult = "ok" | "missing";
const headCache = new Map<string, Promise<ProbeResult>>();
const captionCache = new Map<string, Promise<string | null>>();

// -----------------------------------------------------------------------------
// Public helpers retained for use outside the panel.
// -----------------------------------------------------------------------------

export function normalizeCountrySlug(country: string): string {
  const slug = slugify(country);
  if (slug === "egypt") return "egypte";
  if (slug === "turkey") return "turquie";
  if (slug === "malaysia") return "malaisie";
  return slug;
}

export function isDefaultAgencyName(name: string | null | undefined): boolean {
  return !name || name.trim().toLowerCase() === "default agency";
}

export function inferSourceLabelFromPhotoUrls(
  photoUrls: string[] | null | undefined,
): string | null {
  for (const url of photoUrls ?? []) {
    const path = extractObjectPath(url);
    if (!path) continue;
    const parts = path.split("/").filter(Boolean);
    const candidate =
      parts.length >= 3
        ? parts[parts.length - 3]
        : parts.length >= 2
          ? parts[1]
          : null;
    const label = candidate ? labelFromSlug(candidate) : null;
    if (label) return label;
  }
  return null;
}

// -----------------------------------------------------------------------------
// Path normalization. Accepts:
//   - a fully-qualified public/signed URL
//     (.../storage/v1/object/{public,sign}/<bucket>/<path>...)
//   - a bucket-prefixed path: "travel-offer-assets/foo/bar.jpg"
//   - a bare object path:     "foo/bar.jpg" (returned as-is)
// Returns null for empty / invalid input.
// -----------------------------------------------------------------------------
export function extractObjectPath(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const stripQueryAndHash = (s: string): string =>
    (s.split("#")[0] ?? "").split("?")[0] ?? "";

  const tryDecode = (s: string): string => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };

  const normalize = (p: string): string | null => {
    const clean = stripQueryAndHash(p).replace(/^\/+/, "");
    return clean.length > 0 ? clean : null;
  };

  // Marker patterns Supabase Storage uses, in priority order.
  const markers = [
    `/storage/v1/object/sign/${STORAGE_BUCKET}/`,
    `/storage/v1/object/public/${STORAGE_BUCKET}/`,
    `/storage/v1/object/${STORAGE_BUCKET}/`,
    `/${STORAGE_BUCKET}/`,
  ];
  for (const marker of markers) {
    const idx = trimmed.indexOf(marker);
    if (idx >= 0) {
      return normalize(tryDecode(trimmed.slice(idx + marker.length)));
    }
  }

  // Plain prefix without leading slash (e.g. from a stored relative path).
  const plain = `${STORAGE_BUCKET}/`;
  if (trimmed.startsWith(plain)) {
    return normalize(tryDecode(trimmed.slice(plain.length)));
  }

  // No bucket marker — treat as bare object path only if there's no scheme.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return null;
  return normalize(tryDecode(trimmed));
}

// Back-compat re-export: older callers may still import this name.
export const extractBucketPath = extractObjectPath;

// -----------------------------------------------------------------------------
// Internal helpers.
// -----------------------------------------------------------------------------

function dirname(path: string): string | null {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join("/");
}

function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function labelFromSlug(slug: string): string | null {
  const words = slug
    .split("-")
    .map((part) => part.trim())
    .filter(Boolean);
  if (words.length === 0) return null;
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function getPublicUrl(objectPath: string): string | null {
  if (!objectPath) return null;
  const supabase = getSupabase();
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath);
  return data.publicUrl || null;
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

// One HEAD per unique URL, ever. Cache the verdict.
async function probeHead(url: string, signal?: AbortSignal): Promise<ProbeResult> {
  const cached = headCache.get(url);
  if (cached) return cached;

  const promise = (async (): Promise<ProbeResult> => {
    try {
      const res = await fetch(url, { method: "HEAD", signal });
      return res.ok ? "ok" : "missing";
    } catch (err) {
      if (isAbortError(err)) {
        // Don't poison the cache on abort — let a future call retry.
        headCache.delete(url);
        throw err;
      }
      return "missing";
    }
  })();

  headCache.set(url, promise);
  return promise;
}

// One GET per unique caption URL, ever. Returns the text body or null.
async function fetchCaption(url: string, signal?: AbortSignal): Promise<string | null> {
  const cached = captionCache.get(url);
  if (cached) return cached;

  const promise = (async (): Promise<string | null> => {
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) return null;
      return await res.text();
    } catch (err) {
      if (isAbortError(err)) {
        captionCache.delete(url);
        throw err;
      }
      return null;
    }
  })();

  captionCache.set(url, promise);
  return promise;
}

interface Anchor {
  objectPath: string;
  parentPrefix: string | null;
}

function buildAnchors(photoUrls: string[] | null | undefined): Anchor[] {
  const seen = new Set<string>();
  const anchors: Anchor[] = [];
  for (const url of photoUrls ?? []) {
    const objectPath = extractObjectPath(url);
    if (!objectPath || seen.has(objectPath)) continue;
    seen.add(objectPath);
    anchors.push({ objectPath, parentPrefix: dirname(objectPath) });
  }
  return anchors;
}

interface ResolvedCaption {
  text: string | null;
  asset: ResolvedAsset | null;
  failedPaths: string[];
}

async function resolveCaption(
  prefixes: string[],
  signal: AbortSignal | undefined,
): Promise<ResolvedCaption> {
  const failedPaths: string[] = [];

  for (const prefix of prefixes) {
    for (const name of CAPTION_CANDIDATES) {
      if (signal?.aborted) return { text: null, asset: null, failedPaths };
      const path = `${prefix}/${name}`;
      const url = getPublicUrl(path);
      if (!url) continue;

      const text = await fetchCaption(url, signal);
      if (text !== null) {
        return {
          text,
          asset: { url, path, name, kind: "text" },
          failedPaths,
        };
      }
      failedPaths.push(path);
    }
  }
  return { text: null, asset: null, failedPaths };
}

interface ResolvedPdf {
  asset: ResolvedAsset | null;
  failedPaths: string[];
}

async function resolvePdf(
  prefixes: string[],
  signal: AbortSignal | undefined,
): Promise<ResolvedPdf> {
  const failedPaths: string[] = [];

  for (const prefix of prefixes) {
    for (const name of PDF_CANDIDATES) {
      if (signal?.aborted) return { asset: null, failedPaths };
      const path = `${prefix}/${name}`;
      const url = getPublicUrl(path);
      if (!url) continue;

      const verdict = await probeHead(url, signal);
      if (verdict === "ok") {
        return {
          asset: { url, path, name, kind: "pdf" },
          failedPaths,
        };
      }
      failedPaths.push(path);
    }
  }
  return { asset: null, failedPaths };
}

// -----------------------------------------------------------------------------
// Entry point.
// -----------------------------------------------------------------------------

export async function resolveOfferSource(
  input: ResolveInput,
  options: ResolveOptions = {},
): Promise<ResolvedSource> {
  const { signal } = options;

  const empty: ResolvedSource = {
    status: "no-source",
    imageUrls: [],
    pdfUrl: null,
    pdfPath: null,
    pdfName: null,
    captionText: null,
    captionError: null,
    textFiles: [],
    probedPrefixes: [],
    hasAny: false,
  };

  const anchors = buildAnchors(input.photoUrls);

  if (anchors.length === 0) {
    console.info("[source-resolver] resolving source", {
      offerId: input.offerId,
      bucket: STORAGE_BUCKET,
      candidateCount: 0,
      candidates: [],
    });
    return { ...empty, status: "no-anchor" };
  }

  // Unique parent prefixes from the anchor paths. Capped — almost every offer
  // has exactly one prefix (all photos in the same folder).
  const prefixes = uniq(
    anchors.map((a) => a.parentPrefix).filter((p): p is string => Boolean(p)),
  ).slice(0, MAX_PREFIXES);

  console.info("[source-resolver] resolving source", {
    offerId: input.offerId,
    bucket: STORAGE_BUCKET,
    candidateCount: prefixes.length,
    candidates: prefixes,
  });

  // Image URLs are derived directly from the stored anchors — no network.
  const imageUrls = anchors
    .filter((a) => IMAGE_EXT.test(a.objectPath))
    .map((a) => getPublicUrl(a.objectPath))
    .filter((u): u is string => Boolean(u));

  // If photo_urls already contained the PDF (rare but possible), pick it up
  // without a HEAD probe.
  const pdfAnchor =
    anchors.find((a) => PDF_EXT.test(a.objectPath)) ?? null;

  try {
    const [captionResult, pdfResult] = await Promise.all([
      resolveCaption(prefixes, signal),
      pdfAnchor
        ? Promise.resolve<ResolvedPdf>({
            asset: {
              url: getPublicUrl(pdfAnchor.objectPath) ?? "",
              path: pdfAnchor.objectPath,
              name: basename(pdfAnchor.objectPath),
              kind: "pdf",
            },
            failedPaths: [],
          })
        : resolvePdf(prefixes, signal),
    ]);

    if (signal?.aborted) return empty;

    const textFiles: ResolvedAsset[] = captionResult.asset
      ? [captionResult.asset]
      : [];

    const hasAny =
      imageUrls.length > 0 ||
      pdfResult.asset !== null ||
      (captionResult.text?.length ?? 0) > 0;

    const failedCount =
      captionResult.failedPaths.length + pdfResult.failedPaths.length;
    if (failedCount > 0) {
      // One clean line per offer summarising what we could not find. Each
      // individual 404/400 is silent on the network — the cache prevents repeats.
      console.info("[source-resolver] failed candidates", {
        offerId: input.offerId,
        caption: captionResult.failedPaths,
        pdf: pdfResult.failedPaths,
      });
    }

    console.info("[source-resolver] resolved", {
      offerId: input.offerId,
      imageCount: imageUrls.length,
      hasCaption: captionResult.text !== null,
      hasPdf: pdfResult.asset !== null,
    });

    return {
      status: hasAny ? "ok" : "no-source",
      imageUrls,
      pdfUrl: pdfResult.asset?.url ?? null,
      pdfPath: pdfResult.asset?.path ?? null,
      pdfName: pdfResult.asset?.name ?? null,
      captionText: captionResult.text,
      captionError:
        captionResult.text === null && captionResult.failedPaths.length > 0
          ? null
          : null,
      textFiles,
      probedPrefixes: prefixes,
      hasAny,
    };
  } catch (err) {
    if (isAbortError(err)) {
      return empty;
    }
    console.warn("[source-resolver] unexpected error", {
      offerId: input.offerId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ...empty, probedPrefixes: prefixes };
  }
}
