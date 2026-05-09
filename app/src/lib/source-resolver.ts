import { getSupabase, STORAGE_BUCKET } from "./supabase";
import { slugify } from "./utils";

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

const SIGNED_URL_TTL_SECONDS = 60 * 60;
const MAX_RECURSION_DEPTH = 3;
const LIST_LIMIT = 200;

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
const PDF_EXT = /\.pdf$/i;
const TEXT_EXT = /\.(txt|json|md)$/i;

function classify(name: string): ResolvedAsset["kind"] | null {
  if (IMAGE_EXT.test(name)) return "image";
  if (PDF_EXT.test(name)) return "pdf";
  if (TEXT_EXT.test(name) || /caption/i.test(name)) return "text";
  return null;
}

export function normalizeCountrySlug(country: string): string {
  const slug = slugify(country);
  if (slug === "egypt") return "egypte";
  if (slug === "turkey") return "turquie";
  if (slug === "malaysia") return "malaisie";
  return slug;
}

export function extractBucketPath(value: string): string | null {
  const marker = `/${STORAGE_BUCKET}/`;
  const markerIndex = value.indexOf(marker);
  if (markerIndex >= 0) {
    return cleanObjectPath(value.slice(markerIndex + marker.length));
  }

  const plainMarker = `${STORAGE_BUCKET}/`;
  const plainMarkerIndex = value.indexOf(plainMarker);
  if (plainMarkerIndex >= 0) {
    return cleanObjectPath(
      value.slice(plainMarkerIndex + plainMarker.length),
    );
  }

  const encodedMarker = `/${encodeURIComponent(STORAGE_BUCKET)}/`;
  const encodedMarkerIndex = value.indexOf(encodedMarker);
  if (encodedMarkerIndex >= 0) {
    return cleanObjectPath(value.slice(encodedMarkerIndex + encodedMarker.length));
  }

  return null;
}

export function inferSourceLabelFromPhotoUrls(
  photoUrls: string[] | null | undefined,
): string | null {
  for (const url of photoUrls ?? []) {
    const path = extractBucketPath(url);
    if (!path) continue;
    const parts = path.split("/").filter(Boolean);
    const candidate =
      parts.length >= 3 ? parts[parts.length - 3] : parts.length >= 2 ? parts[1] : null;
    const label = candidate ? labelFromSlug(candidate) : null;
    if (label) return label;
  }
  return null;
}

export function isDefaultAgencyName(name: string | null | undefined): boolean {
  return !name || name.trim().toLowerCase() === "default agency";
}

function cleanObjectPath(value: string): string | null {
  const withoutHash = value.split("#")[0] ?? "";
  const withoutQuery = withoutHash.split("?")[0] ?? "";
  const decoded = decodeURIComponent(withoutQuery).replace(/^\/+/, "");
  return decoded.length > 0 ? decoded : null;
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

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr.filter((s) => s && s.length > 0)));
}

function dirname(path: string): string | null {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join("/");
}

function getParentPrefix(path: string): string | null {
  const dir = dirname(path);
  return dir ? `${dir}/` : null;
}

function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function addNumberedFolders(candidates: string[], prefix: string): void {
  candidates.push(prefix);
  candidates.push(`${prefix}/01`);
  candidates.push(`${prefix}/02`);
}

function addKnownSourceFolderVariants(
  candidates: string[],
  countrySlug: string | null,
  titleSlug: string | null,
): void {
  if (!countrySlug || !titleSlug) return;

  if (titleSlug.includes("kuala-lumpur")) {
    addNumberedFolders(candidates, `${countrySlug}/kuala-lumpur-city-tour`);
  }
}

function buildAnchors(photoUrls: string[] | null): {
  paths: string[];
  prefixes: string[];
  sourceSlug: string | null;
} {
  const paths: string[] = [];
  const prefixes: string[] = [];
  let sourceSlug: string | null = null;

  for (const url of photoUrls ?? []) {
    const path = extractBucketPath(url);
    if (!path) continue;
    paths.push(path);

    const folder = getParentPrefix(path);
    if (folder) prefixes.push(folder);

    const parts = path.split("/").filter(Boolean);
    if (parts.length >= 3) sourceSlug = sourceSlug ?? parts[1];
  }

  return {
    paths: uniq(paths),
    prefixes: uniq(prefixes),
    sourceSlug,
  };
}

function buildCandidatePrefixes(input: ResolveInput): string[] {
  const candidates: string[] = [];
  const country = (input.countries ?? []).find(
    (c) => typeof c === "string" && c.trim().length > 0,
  );
  const countrySlug = country ? normalizeCountrySlug(country) : null;
  const agencyId = input.agencyId;
  const agencySlug = input.agencyName ? slugify(input.agencyName) : null;
  const titleSlug = input.title ? slugify(input.title) : null;
  const anchors = buildAnchors(input.photoUrls);

  candidates.push(...anchors.prefixes);

  if (countrySlug && anchors.sourceSlug) {
    addNumberedFolders(candidates, `${countrySlug}/${anchors.sourceSlug}`);
  }

  if (countrySlug && titleSlug) {
    addNumberedFolders(candidates, `${countrySlug}/${titleSlug}`);
    addKnownSourceFolderVariants(candidates, countrySlug, titleSlug);
  }

  if (countrySlug && agencySlug && !isDefaultAgencyName(input.agencyName)) {
    addNumberedFolders(candidates, `${countrySlug}/${agencySlug}`);
  }

  if (countrySlug && agencyId !== null) {
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

function normalizePrefix(prefix: string): string {
  return prefix.replace(/\/+$/, "");
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
  const normalizedPrefix = normalizePrefix(prefix);
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .list(normalizedPrefix, {
      limit: LIST_LIMIT,
      sortBy: { column: "name", order: "asc" },
    });

  if (error) return { files: [], folders: [], blocked: true };

  const files: ListedFile[] = [];
  const folders: string[] = [];

  for (const entry of data ?? []) {
    const fullPath = normalizedPrefix
      ? `${normalizedPrefix}/${entry.name}`
      : entry.name;
    if (classify(entry.name)) {
      files.push({ prefix: normalizedPrefix, name: entry.name, fullPath });
    } else {
      folders.push(fullPath);
    }
  }

  return { files, folders, blocked: false };
}

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

  for (const folder of result.folders) {
    await walkPrefix(folder, depth + 1, acc, blockedFlag, successFlag);
  }
}

async function resolveAssetUrl(path: string): Promise<string | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (!error && data?.signedUrl) return data.signedUrl;

  return getPublicAssetUrl(path);
}

function getPublicAssetUrl(path: string): string | null {
  const supabase = getSupabase();
  const publicResult = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return publicResult.data.publicUrl || null;
}

async function downloadText(path: string, url: string | null): Promise<string | null> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(path);
    if (!error && data) return formatTextContent(path, await data.text());
  } catch {
    // Try the resolved URL below.
  }

  const publicUrl = getPublicAssetUrl(path);
  const urls = uniq([url ?? "", publicUrl ?? ""]);

  for (const candidateUrl of urls) {
    try {
      const response = await fetch(candidateUrl);
      if (!response.ok) continue;
      return formatTextContent(path, await response.text());
    } catch {
      // Try the next URL candidate.
    }
  }

  return null;
}

async function urlResponds(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    if (response.ok) return true;
  } catch {
    // Try a lightweight GET below.
  }

  try {
    const response = await fetch(url, {
      headers: { Range: "bytes=0-0" },
    });
    return response.ok;
  } catch {
    return false;
  }
}

function formatTextContent(path: string, raw: string): string {
  if (!/\.json$/i.test(path)) return raw;

  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function textPriority(name: string): number {
  if (/^caption\.txt$/i.test(name)) return 0;
  if (/caption/i.test(name)) return 1;
  if (/\.txt$/i.test(name)) return 2;
  if (/\.md$/i.test(name)) return 3;
  return 4;
}

function pdfPriority(name: string): number {
  if (/^offer\.pdf$/i.test(name)) return 0;
  if (/offer|source|brochure/i.test(name)) return 1;
  return 2;
}

function addDirectAnchorFiles(input: ResolveInput, files: ListedFile[]): void {
  for (const path of buildAnchors(input.photoUrls).paths) {
    const kind = classify(path);
    if (!kind) continue;
    files.push({
      prefix: dirname(path) ?? "",
      name: basename(path),
      fullPath: path,
    });
  }
}

async function findKnownSiblingTextFiles(
  prefixes: string[],
  existingPaths: Set<string>,
): Promise<Array<{ file: ListedFile; text: string }>> {
  const found: Array<{ file: ListedFile; text: string }> = [];

  for (const rawPrefix of prefixes) {
    const prefix = normalizePrefix(rawPrefix);
    const path = `${prefix}/caption.txt`;
    if (existingPaths.has(path)) continue;

    const url = await resolveAssetUrl(path);
    const text = await downloadText(path, url);
    if (text === null) continue;

    found.push({
      file: {
        prefix,
        name: "caption.txt",
        fullPath: path,
      },
      text,
    });
  }

  return found;
}

function knownPdfSiblingNames(prefix: string): string[] {
  const segment = basename(prefix);
  return uniq([`${segment}.pdf`, "01.pdf", "source.pdf", "document.pdf", "offer.pdf"]);
}

async function findKnownSiblingPdfFiles(
  prefixes: string[],
  existingPaths: Set<string>,
): Promise<Array<{ file: ListedFile; url: string }>> {
  const found: Array<{ file: ListedFile; url: string }> = [];

  for (const rawPrefix of prefixes) {
    const prefix = normalizePrefix(rawPrefix);
    for (const name of knownPdfSiblingNames(prefix)) {
      const path = `${prefix}/${name}`;
      if (existingPaths.has(path)) continue;

      const url = await resolveAssetUrl(path);
      if (!url || !(await urlResponds(url))) continue;

      found.push({
        file: {
          prefix,
          name,
          fullPath: path,
        },
        url,
      });
      existingPaths.add(path);
    }
  }

  return found;
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
    captionError: null,
    textFiles: [],
    probedPrefixes: [],
    hasAny: false,
  };

  const prefixes = buildCandidatePrefixes(input);
  const allFiles: ListedFile[] = [];
  const blocked = { value: false };
  const success = { value: false };

  addDirectAnchorFiles(input, allFiles);

  if (prefixes.length === 0 && allFiles.length === 0) {
    return { ...empty, status: "no-anchor" };
  }

  for (const prefix of prefixes) {
    await walkPrefix(prefix, 0, allFiles, blocked, success);
    if (
      allFiles.some((f) => IMAGE_EXT.test(f.name)) &&
      allFiles.some((f) => PDF_EXT.test(f.name)) &&
      allFiles.some((f) => classify(f.name) === "text")
    ) {
      break;
    }
  }

  const byPath = new Map<string, ListedFile>();
  for (const file of allFiles) {
    if (!byPath.has(file.fullPath)) byPath.set(file.fullPath, file);
  }

  const anchors = buildAnchors(input.photoUrls);
  const textContentByPath = new Map<string, string>();
  const knownSiblingTexts = await findKnownSiblingTextFiles(
    prefixes.length > 0 ? prefixes : anchors.prefixes,
    new Set(byPath.keys()),
  );
  for (const sibling of knownSiblingTexts) {
    if (!byPath.has(sibling.file.fullPath)) {
      byPath.set(sibling.file.fullPath, sibling.file);
    }
    textContentByPath.set(sibling.file.fullPath, sibling.text);
  }

  const pdfUrlByPath = new Map<string, string>();
  const knownSiblingPdfs = await findKnownSiblingPdfFiles(
    prefixes.length > 0 ? prefixes : anchors.prefixes,
    new Set(byPath.keys()),
  );
  for (const sibling of knownSiblingPdfs) {
    if (!byPath.has(sibling.file.fullPath)) {
      byPath.set(sibling.file.fullPath, sibling.file);
    }
    pdfUrlByPath.set(sibling.file.fullPath, sibling.url);
  }

  if (byPath.size === 0) {
    if (blocked.value && !success.value) {
      return {
        ...empty,
        status: "listing-blocked",
        message:
          "Impossible de charger les fichiers sources. Verifiez les politiques Storage ou les chemins des assets.",
        probedPrefixes: prefixes,
      };
    }
    return { ...empty, probedPrefixes: prefixes };
  }

  const images: ListedFile[] = [];
  const pdfs: ListedFile[] = [];
  const texts: ListedFile[] = [];

  for (const file of byPath.values()) {
    const kind = classify(file.name);
    if (kind === "image") images.push(file);
    if (kind === "pdf") pdfs.push(file);
    if (kind === "text") texts.push(file);
  }

  images.sort((a, b) => a.name.localeCompare(b.name));
  texts.sort((a, b) => textPriority(a.name) - textPriority(b.name));
  pdfs.sort((a, b) => pdfPriority(a.name) - pdfPriority(b.name));

  const imageUrls = (
    await Promise.all(images.map((file) => resolveAssetUrl(file.fullPath)))
  ).filter((url): url is string => Boolean(url));

  const preferredPdf = pdfs[0] ?? null;
  const pdfUrl = preferredPdf
    ? (pdfUrlByPath.get(preferredPdf.fullPath) ??
      (await resolveAssetUrl(preferredPdf.fullPath)))
    : null;

  const textFiles: ResolvedAsset[] = [];
  let captionText: string | null = null;
  let captionError: string | null = null;
  for (const textFile of texts) {
    const url = await resolveAssetUrl(textFile.fullPath);
    textFiles.push({
      url: url ?? "",
      path: textFile.fullPath,
      name: textFile.name,
      kind: "text",
    });
    if (!captionText) {
      captionText =
        textContentByPath.get(textFile.fullPath) ??
        (await downloadText(textFile.fullPath, url));
      if (!captionText) {
        captionError = "Impossible de charger le texte source.";
      }
    }
  }

  const hasAny =
    imageUrls.length > 0 ||
    pdfUrl !== null ||
    texts.length > 0 ||
    (captionText?.length ?? 0) > 0;

  if (!hasAny && blocked.value && !success.value) {
    return {
      ...empty,
      status: "listing-blocked",
      message:
        "Impossible de charger les fichiers sources. Verifiez les politiques Storage ou les chemins des assets.",
      probedPrefixes: prefixes,
    };
  }

  return {
    status: hasAny ? "ok" : "no-source",
    imageUrls,
    pdfUrl,
    pdfPath: preferredPdf?.fullPath ?? null,
    pdfName: preferredPdf?.name ?? null,
    captionText,
    captionError: captionText ? null : captionError,
    textFiles,
    probedPrefixes: prefixes,
    hasAny,
  };
}
