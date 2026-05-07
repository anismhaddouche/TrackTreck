import { getSupabase, STORAGE_BUCKET } from "./supabase";
import { slugify } from "./utils";

// Resolves source assets for an offer from the travel-offer-assets bucket.
//
// The pipeline uses different folder layouts over time. We probe several
// prefixes in priority order and merge what we find. We deliberately avoid raw
// <img src> for private buckets — every URL we return is a freshly signed URL.
//
// Supported layouts (probed in priority order):
//   1. Spec / id-based:
//        {country}/agency-{agency_id}/{offerId}/images/
//        {country}/agency-{agency_id}/{offerId}/pdf/
//        {country}/agency-{agency_id}/{offerId}/text/
//   2. Slug / name-based (current real-world layout):
//        {country}/{agency-slug}/{title-slug}/...
//        {country}/{agency-slug}/...
//   3. Older fallbacks:
//        {country}/agency-{agency_id}/images/
//        {country}/agency-{agency_id}/pdf/
//        incoming/agency-{agency_id}/images/
//        incoming/agency-{agency_id}/pdf/
//
// On listing failure (e.g. RLS blocks anon list), we surface a typed status so
// the UI can show a clean message instead of a broken resource.

export type ResolveStatus =
  | "ok"
  | "no-source"
  | "listing-blocked"
  | "no-anchor";

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

const SIGNED_URL_TTL_SECONDS = 60 * 5;
const MAX_RECURSION_DEPTH = 3;
const LIST_LIMIT = 200;

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|avif)$/i;
const PDF_EXT = /\.pdf$/i;
const TEXT_EXT = /\.(txt|md|caption)$/i;

const PUBLIC_OBJECT_PATTERN = new RegExp(
  `/storage/v1/object/(?:public|sign)/${STORAGE_BUCKET}/([^?]+)`,
);

function classify(name: string): ResolvedAsset["kind"] | null {
  if (IMAGE_EXT.test(name)) return "image";
  if (PDF_EXT.test(name)) return "pdf";
  if (TEXT_EXT.test(name) || /caption/i.test(name)) return "text";
  return null;
}

function extractBucketPath(url: string): string | null {
  const m = url.match(PUBLIC_OBJECT_PATTERN);
  return m ? decodeURIComponent(m[1]) : null;
}

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr.filter((s) => s && s.length > 0)));
}

// Build candidate prefixes ordered most-specific → most-permissive.
function buildCandidatePrefixes(input: ResolveInput): string[] {
  const candidates: string[] = [];
  const country = (input.countries ?? []).find(
    (c) => typeof c === "string" && c.trim().length > 0,
  );
  const countrySlug = country ? slugify(country) : null;
  const agencyId = input.agencyId;
  const agencySlug = input.agencyName ? slugify(input.agencyName) : null;
  const titleSlug = input.title ? slugify(input.title) : null;
  const offerId = input.offerId;

  // 1) Anchors derived from photo_urls we already have. Most reliable when
  // the n8n pipeline persisted at least one photo path.
  for (const url of input.photoUrls ?? []) {
    const path = extractBucketPath(url);
    if (!path) continue;
    const parts = path.split("/").filter(Boolean);
    if (parts.length >= 2) candidates.push(parts.slice(0, -1).join("/"));
    if (parts.length >= 3) candidates.push(parts.slice(0, -2).join("/"));
    if (parts.length >= 4) candidates.push(parts.slice(0, -3).join("/"));
  }

  // 2) Spec / id-based layout.
  if (countrySlug && agencyId !== null) {
    candidates.push(`${countrySlug}/agency-${agencyId}/${offerId}`);
    candidates.push(`${countrySlug}/agency-${agencyId}/${offerId}/images`);
    candidates.push(`${countrySlug}/agency-${agencyId}/${offerId}/pdf`);
    candidates.push(`${countrySlug}/agency-${agencyId}/${offerId}/text`);
    candidates.push(`${countrySlug}/agency-${agencyId}`);
    candidates.push(`${countrySlug}/agency-${agencyId}/images`);
    candidates.push(`${countrySlug}/agency-${agencyId}/pdf`);
  }

  // 3) Slug / name-based layout. The agency slug and title slug let us hit
  // {country}/{agency-slug}/{title-slug}/... directly when they exist.
  if (countrySlug && agencySlug) {
    if (titleSlug) {
      candidates.push(`${countrySlug}/${agencySlug}/${titleSlug}`);
      candidates.push(`${countrySlug}/${agencySlug}/${titleSlug}/images`);
      candidates.push(`${countrySlug}/${agencySlug}/${titleSlug}/pdf`);
      candidates.push(`${countrySlug}/${agencySlug}/${titleSlug}/text`);
    }
    candidates.push(`${countrySlug}/${agencySlug}/${offerId}`);
    candidates.push(`${countrySlug}/${agencySlug}`);
  }

  // 4) Older incoming/ fallbacks.
  if (agencyId !== null) {
    candidates.push(`incoming/agency-${agencyId}/images`);
    candidates.push(`incoming/agency-${agencyId}/pdf`);
    candidates.push(`incoming/agency-${agencyId}`);
  }

  return uniq(candidates);
}

interface ListedFile {
  prefix: string;
  name: string;
  fullPath: string;
}

interface ListResult {
  files: ListedFile[];
  folders: string[];
  blocked: boolean;
}

async function listPrefix(prefix: string): Promise<ListResult> {
  const supabase = getSupabase();
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .list(prefix, {
      limit: LIST_LIMIT,
      sortBy: { column: "name", order: "asc" },
    });

  if (error) return { files: [], folders: [], blocked: true };

  const files: ListedFile[] = [];
  const folders: string[] = [];
  for (const entry of data ?? []) {
    // In supabase-js, folder placeholders have id=null and metadata=null.
    const isFile = (entry.id ?? null) !== null || entry.metadata !== null;
    if (isFile) {
      files.push({
        prefix,
        name: entry.name,
        fullPath: prefix ? `${prefix}/${entry.name}` : entry.name,
      });
    } else if (entry.name) {
      folders.push(prefix ? `${prefix}/${entry.name}` : entry.name);
    }
  }
  return { files, folders, blocked: false };
}

// Recursively walk a prefix down to MAX_RECURSION_DEPTH, collecting every
// file. Used when a probed prefix has no direct files but does contain
// subfolders (typical for {country}/{agency-slug} where the offer lives in a
// nested folder named after the publication or title).
async function walkPrefix(
  prefix: string,
  depth: number,
  acc: ListedFile[],
  blockedFlag: { value: boolean },
  successFlag: { value: boolean },
): Promise<void> {
  if (depth > MAX_RECURSION_DEPTH) return;
  const result = await listPrefix(prefix);
  if (result.blocked) {
    blockedFlag.value = true;
    return;
  }
  successFlag.value = true;
  acc.push(...result.files);
  if (result.files.length === 0 && result.folders.length > 0) {
    for (const folder of result.folders) {
      await walkPrefix(folder, depth + 1, acc, blockedFlag, successFlag);
    }
  }
}

async function signMany(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const supabase = getSupabase();
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  const out = new Map<string, string>();
  if (error || !data) return out;
  for (const item of data) {
    if (item.signedUrl && item.path) out.set(item.path, item.signedUrl);
  }
  return out;
}

async function downloadText(path: string): Promise<string | null> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(path);
    if (error || !data) return null;
    return await data.text();
  } catch {
    return null;
  }
}

export async function resolveOfferSource(
  input: ResolveInput,
): Promise<ResolvedSource> {
  const empty: ResolvedSource = {
    status: "no-source",
    imageUrls: [],
    pdfUrl: null,
    pdfPath: null,
    pdfName: null,
    captionText: null,
    textFiles: [],
    probedPrefixes: [],
    hasAny: false,
  };

  const prefixes = buildCandidatePrefixes(input);
  if (prefixes.length === 0) return { ...empty, status: "no-anchor" };

  const allFiles: ListedFile[] = [];
  const blocked = { value: false };
  const success = { value: false };

  for (const prefix of prefixes) {
    await walkPrefix(prefix, 0, allFiles, blocked, success);
    // Short-circuit once we have enough material to render every tab.
    if (
      allFiles.some((f) => IMAGE_EXT.test(f.name)) &&
      allFiles.some((f) => PDF_EXT.test(f.name)) &&
      allFiles.some((f) => TEXT_EXT.test(f.name) || /caption/i.test(f.name))
    ) {
      break;
    }
  }

  if (allFiles.length === 0) {
    if (blocked.value && !success.value) {
      return {
        ...empty,
        status: "listing-blocked",
        message:
          "Impossible de charger les fichiers sources. Vérifiez les politiques Storage ou les chemins des assets.",
        probedPrefixes: prefixes,
      };
    }
    return { ...empty, probedPrefixes: prefixes };
  }

  // Deduplicate by fullPath.
  const byPath = new Map<string, ListedFile>();
  for (const f of allFiles) {
    if (!byPath.has(f.fullPath)) byPath.set(f.fullPath, f);
  }

  const images: ListedFile[] = [];
  const pdfs: ListedFile[] = [];
  const texts: ListedFile[] = [];

  for (const f of byPath.values()) {
    const kind = classify(f.name);
    if (kind === "image") images.push(f);
    else if (kind === "pdf") pdfs.push(f);
    else if (kind === "text") texts.push(f);
  }

  const signMapping = await signMany([
    ...images.map((f) => f.fullPath),
    ...pdfs.map((f) => f.fullPath),
  ]);

  const imageUrls: string[] = [];
  for (const f of images) {
    const url = signMapping.get(f.fullPath);
    if (url) imageUrls.push(url);
  }

  // Prefer a PDF whose name suggests it's the primary asset; otherwise the
  // first one found.
  const preferredPdf =
    pdfs.find((p) => /caption|cover|main/i.test(p.name)) ?? pdfs[0] ?? null;
  const pdfUrl = preferredPdf
    ? (signMapping.get(preferredPdf.fullPath) ?? null)
    : null;

  // For text we download the first match to render inline.
  let captionText: string | null = null;
  for (const t of texts) {
    captionText = await downloadText(t.fullPath);
    if (captionText) break;
  }

  const textAssets: ResolvedAsset[] = texts.map((t) => ({
    url: "",
    path: t.fullPath,
    name: t.name,
    kind: "text",
  }));

  const hasAny =
    imageUrls.length > 0 || pdfUrl !== null || (captionText?.length ?? 0) > 0;

  return {
    status: hasAny ? "ok" : "no-source",
    imageUrls,
    pdfUrl,
    pdfPath: preferredPdf?.fullPath ?? null,
    pdfName: preferredPdf?.name ?? null,
    captionText,
    textFiles: textAssets,
    probedPrefixes: prefixes,
    hasAny,
  };
}
