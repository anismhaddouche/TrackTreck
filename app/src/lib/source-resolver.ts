import { getSupabase, STORAGE_BUCKET } from "./supabase";
import { slugify } from "./utils";

// Resolves source assets for an offer from the travel-offer-assets bucket.
//
// The pipeline uses different layouts over time. We probe several prefixes in
// priority order and merge what we find. We deliberately avoid raw <img src>
// for private buckets — every URL we return is a freshly signed URL.
//
// New layout (current):
//   {country}/{agency-slug}/{publicationId}/{publicationId}.jpg
//   {country}/{agency-slug}/{publicationId}/{publicationId}.pdf
//   {country}/{agency-slug}/{publicationId}/caption.txt
//
// Target layout per US_7 spec:
//   {country}/agency-{agency_id}/{parsed_offer_id}/images/
//   {country}/agency-{agency_id}/{parsed_offer_id}/pdf/
//   {country}/agency-{agency_id}/{parsed_offer_id}/text/
//
// Older / fallback layouts:
//   {country}/agency-{agency_id}/images/
//   {country}/agency-{agency_id}/pdf/
//   incoming/agency-{agency_id}/images/
//   incoming/agency-{agency_id}/pdf/
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
  countries: string[] | null;
  photoUrls: string[] | null;
}

const SIGNED_URL_TTL_SECONDS = 60 * 5;

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

// Build the candidate prefixes we should probe, ordered from most specific to
// most permissive. Anything we cannot derive is silently skipped.
function buildCandidatePrefixes(input: ResolveInput): string[] {
  const candidates: string[] = [];
  const country = (input.countries ?? []).find(
    (c) => typeof c === "string" && c.trim().length > 0,
  );
  const countrySlug = country ? slugify(country) : null;
  const agencyId = input.agencyId;
  const offerId = input.offerId;

  // 1) Anchors derived from photo_urls we already have.
  for (const url of input.photoUrls ?? []) {
    const path = extractBucketPath(url);
    if (!path) continue;
    const parts = path.split("/").filter(Boolean);
    if (parts.length >= 2) {
      // Folder containing the file we know about.
      candidates.push(parts.slice(0, -1).join("/"));
    }
    if (parts.length >= 3) {
      // One level up — sibling subfolders (images/, pdf/, text/).
      candidates.push(parts.slice(0, -2).join("/"));
    }
  }

  if (countrySlug && agencyId !== null) {
    // Spec layout: {country}/agency-{agency_id}/{offerId}/{images,pdf,text}
    candidates.push(`${countrySlug}/agency-${agencyId}/${offerId}`);
    candidates.push(`${countrySlug}/agency-${agencyId}/${offerId}/images`);
    candidates.push(`${countrySlug}/agency-${agencyId}/${offerId}/pdf`);
    candidates.push(`${countrySlug}/agency-${agencyId}/${offerId}/text`);
    // Older / fallback layouts under the same agency root.
    candidates.push(`${countrySlug}/agency-${agencyId}`);
    candidates.push(`${countrySlug}/agency-${agencyId}/images`);
    candidates.push(`${countrySlug}/agency-${agencyId}/pdf`);
  }

  if (agencyId !== null) {
    candidates.push(`incoming/agency-${agencyId}/images`);
    candidates.push(`incoming/agency-${agencyId}/pdf`);
  }

  return uniq(candidates);
}

interface ListedFile {
  prefix: string;
  name: string;
  fullPath: string;
}

async function listPrefix(
  prefix: string,
): Promise<{ files: ListedFile[]; blocked: boolean }> {
  const supabase = getSupabase();
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .list(prefix, { limit: 100, sortBy: { column: "name", order: "asc" } });

  if (error) {
    // The supabase-js storage SDK surfaces RLS/policy problems through error.
    return { files: [], blocked: true };
  }

  const files: ListedFile[] = [];
  for (const entry of data ?? []) {
    // Folders surface as zero-byte placeholder rows; skip them.
    const isFile = (entry.id ?? null) !== null || entry.metadata !== null;
    if (!isFile) continue;
    files.push({
      prefix,
      name: entry.name,
      fullPath: prefix ? `${prefix}/${entry.name}` : entry.name,
    });
  }
  return { files, blocked: false };
}

async function signMany(
  paths: string[],
): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const supabase = getSupabase();
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  const out = new Map<string, string>();
  if (error || !data) return out;
  for (const item of data) {
    if (item.signedUrl && item.path) {
      out.set(item.path, item.signedUrl);
    }
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
  if (prefixes.length === 0) {
    return { ...empty, status: "no-anchor" };
  }

  const allFiles: ListedFile[] = [];
  let everBlocked = false;
  let anySuccess = false;

  // Sequential awaits keep this gentle on Supabase storage; the prefix list is
  // small (<10) so it stays well under perceptible latency.
  for (const prefix of prefixes) {
    const result = await listPrefix(prefix);
    if (result.blocked) {
      everBlocked = true;
      continue;
    }
    anySuccess = true;
    allFiles.push(...result.files);
  }

  if (allFiles.length === 0) {
    if (everBlocked && !anySuccess) {
      return {
        ...empty,
        status: "listing-blocked",
        message:
          "Source files could not be loaded. Check storage policies or asset path metadata.",
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

  // Prefer a PDF whose name matches the publication anchor; otherwise the
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
