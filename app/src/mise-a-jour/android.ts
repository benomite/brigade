// The launch-time update check of the installed Android app. Logic only: no screen, no install.
//
// Each Android release publishes a small JSON manifest as an asset named `latest-android.json` of
// the latest GitHub release of benomite/brigade. The app fetches it once at launch.
//
// Manifest format (what the tests use):
//
//   {
//     "version": "1.4.0",                                  // required, dotted numbers, "1.4" or "1.4.0.2"
//     "versionCode": 14,                                   // required, the Android integer build number
//     "apkUrl": "https://github.com/benomite/brigade/releases/download/android-v1.4.0/brigade.apk",
//                                                          // required, an https address
//     "notes": "What changed, in a few lines."             // optional, a string
//   }
//
// The result is `{ kind: "none" }` or `{ kind: "offer", version, notes, apkUrl }`. A network
// failure, a timeout, a bad HTTP status or a manifest that does not match the format above all give
// `{ kind: "none" }`: the check never throws and never waits past `delayMs`.
//
// Call site: at launch, `checkAtLaunch(...)` returns at once and calls `onResult` later, only with
// an offer. Launch never waits for it.
//
// The desktop reads the same manifest for its phone offer (#3303): `apkLink(...)` gives the latest
// `apkUrl`, whatever version runs, or the releases page when the manifest cannot be read.
import { comparerVersions, estUneVersion } from "./flux.ts";

export const MANIFEST_URL = "https://github.com/benomite/brigade/releases/latest/download/latest-android.json";
export const DEFAULT_DELAY_MS = 5_000;
// Where the Android app is found when its manifest cannot be read.
export const RELEASES_URL = "https://github.com/benomite/brigade/releases";

export type UpdateOffer = { kind: "offer"; version: string; notes: string; apkUrl: string };
export type UpdateResult = { kind: "none" } | UpdateOffer;

export type CheckOptions = {
  // The version of the running build.
  currentVersion: string;
  url?: string;
  // How long the whole check may take.
  delayMs?: number;
  fetch?: typeof fetch;
};

const NONE: UpdateResult = { kind: "none" };

// The offer a manifest makes, or `none` if it is malformed or not newer than `currentVersion`.
export function readManifest(raw: unknown, currentVersion: string): UpdateResult {
  if (typeof raw !== "object" || raw === null) return NONE;
  const { version, versionCode, apkUrl, notes } = raw as Record<string, unknown>;
  if (typeof version !== "string" || !estUneVersion(version)) return NONE;
  if (typeof versionCode !== "number" || !Number.isSafeInteger(versionCode) || versionCode <= 0) return NONE;
  if (typeof apkUrl !== "string" || !/^https:\/\/\S+$/.test(apkUrl)) return NONE;
  if (notes !== undefined && typeof notes !== "string") return NONE;
  if (!estUneVersion(currentVersion) || comparerVersions(version, currentVersion) <= 0) return NONE;
  return { kind: "offer", version, notes: notes ?? "", apkUrl };
}

export async function checkForUpdate(options: CheckOptions): Promise<UpdateResult> {
  const signal = AbortSignal.timeout(options.delayMs ?? DEFAULT_DELAY_MS);
  try {
    const response = await (options.fetch ?? fetch)(options.url ?? MANIFEST_URL, { signal, redirect: "follow" });
    if (!response.ok) return NONE;
    // The timeout also bounds the body: a server that stalls after its headers gives up here.
    const text = await new Promise<string>((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      response.text().then(resolve, reject);
    });
    return readManifest(JSON.parse(text), options.currentVersion);
  } catch {
    return NONE;
  }
}

// Starts the check and returns at once. `onResult` hears only of an offer, whenever it comes.
export function checkAtLaunch(options: CheckOptions, onResult: (offer: UpdateOffer) => void): void {
  void checkForUpdate(options).then((result) => {
    if (result.kind === "offer") onResult(result);
  });
}

// The link to the latest Android app, for the desktop's phone offer (#3303): the manifest's
// `apkUrl` — read against the lowest version, so any published one is an offer —, or
// `RELEASES_URL` on any failure. Never throws.
export async function apkLink(options: Omit<CheckOptions, "currentVersion"> = {}): Promise<string> {
  const result = await checkForUpdate({ ...options, currentVersion: "0" });
  return result.kind === "offer" ? result.apkUrl : RELEASES_URL;
}
