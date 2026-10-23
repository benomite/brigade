// The "a newer version is out" notice of the installed app (Mac, Windows) and of the Android app.
// Logic only: no screen, no install.
//
// It reads the published `app-v<version>` releases of benomite/brigade, takes the newest one above
// the running version whose assets carry a package for this device — `.dmg` on a Mac, `.exe` on
// Windows, `.apk` on Android, chosen by extension — and returns that asset's direct download URL,
// never the releases page. The tags come from `git/matching-refs` rather than the list of releases
// (flux.ts says why); each candidate release is then read by its tag. A release without a package
// for this device is skipped for the next one down.
//
// A version the user dismissed stays hidden, and so does every older one; a newer version is offered
// again. The dismissed version lives in a small JSON file the caller names.
//
// Every failure — network, bad status, malformed data, unwritable file — gives "no update" and never
// throws.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { comparerVersions, DEPOT, estUneVersion, ETIQUETTE } from "./flux.ts";

export type Poste = "mac" | "windows" | "android";

export const EXTENSIONS: Record<Poste, string> = { mac: ".dmg", windows: ".exe", android: ".apk" };

// The first-open hint: what to do the first time the unsigned app is opened. Android has none.
export type Indice = "mac-right-click-open" | "windows-more-info-run-anyway";

export const indiceDe = (poste: Poste): Indice | undefined =>
  poste === "mac" ? "mac-right-click-open" : poste === "windows" ? "windows-more-info-run-anyway" : undefined;

// The device an app runs on, from `process.platform`; Android is told by its caller, not read here.
export const posteDe = (plateforme: string): Poste | undefined => (plateforme === "darwin" ? "mac" : plateforme === "win32" ? "windows" : undefined);

export type Avis = { version: string; url: string; indice?: Indice };

export type OptionsAvis = {
  // The version of the running app.
  version: string;
  poste: Poste;
  // The JSON file holding the dismissed version. Without one, nothing is dismissed.
  fichier?: string;
  depot?: string;
  api?: string;
  // How long each read may take.
  delaiMs?: number;
  fetch?: typeof fetch;
};

// At most this many tags tried, highest first, before saying there is nothing.
const ESSAIS = 3;

export function versionRefusee(fichier: string): string | undefined {
  try {
    const { version } = JSON.parse(readFileSync(fichier, "utf8")) as { version?: unknown };
    return typeof version === "string" && estUneVersion(version) ? version : undefined;
  } catch {
    return undefined;
  }
}

// Remembers that `version` was dismissed. A newer dismissal never gives way to an older one.
export function refuser(fichier: string, version: string): boolean {
  if (!estUneVersion(version)) return false;
  try {
    const deja = versionRefusee(fichier);
    if (deja !== undefined && comparerVersions(deja, version) >= 0) return true;
    mkdirSync(dirname(fichier), { recursive: true });
    writeFileSync(fichier, `${JSON.stringify({ version })}\n`);
    return true;
  } catch {
    return false;
  }
}

// The download URL of the package of a release for this device, among its assets.
export function lienDuPaquet(release: unknown, poste: Poste): string | undefined {
  const assets = (release as { assets?: unknown } | null)?.assets;
  if (!Array.isArray(assets)) return undefined;
  for (const asset of assets as Array<{ name?: unknown; browser_download_url?: unknown } | null>) {
    const { name, browser_download_url: url } = asset ?? {};
    if (typeof name === "string" && name.toLowerCase().endsWith(EXTENSIONS[poste]) && typeof url === "string" && /^https:\/\/\S+$/.test(url)) return url;
  }
  return undefined;
}

export async function chercherUneMiseAJour(options: OptionsAvis): Promise<Avis | undefined> {
  try {
    if (!estUneVersion(options.version)) return undefined;
    const depot = options.depot ?? DEPOT;
    const api = options.api ?? "https://api.github.com";
    const lire = async (url: string) => {
      const reponse = await (options.fetch ?? fetch)(url, { headers: { accept: "application/vnd.github+json", "user-agent": "brigade-app" }, signal: AbortSignal.timeout(options.delaiMs ?? 30_000) });
      return reponse.ok ? ((await reponse.json()) as unknown) : undefined;
    };
    const refs = await lire(`${api}/repos/${depot}/git/matching-refs/tags/${ETIQUETTE}`);
    if (!Array.isArray(refs)) return undefined;
    const refusee = options.fichier === undefined ? undefined : versionRefusee(options.fichier);
    const prefixe = `refs/tags/${ETIQUETTE}`;
    const candidates = refs
      .flatMap((r) => (typeof (r as { ref?: unknown })?.ref === "string" && (r as { ref: string }).ref.startsWith(prefixe) ? [(r as { ref: string }).ref.slice(prefixe.length)] : []))
      .filter((version) => estUneVersion(version) && comparerVersions(version, options.version) > 0 && (refusee === undefined || comparerVersions(version, refusee) > 0))
      .sort((a, b) => comparerVersions(b, a))
      .slice(0, ESSAIS);
    for (const version of candidates) {
      const url = lienDuPaquet(await lire(`${api}/repos/${depot}/releases/tags/${encodeURIComponent(`${ETIQUETTE}${version}`)}`), options.poste);
      if (url === undefined) continue;
      const indice = indiceDe(options.poste);
      return indice === undefined ? { version, url } : { version, url, indice };
    }
    return undefined;
  } catch {
    return undefined;
  }
}
