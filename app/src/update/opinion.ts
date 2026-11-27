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
// Nothing dismisses it (#2431): the notice stands as long as the app does not run the newest version.
//
// Every failure — network, bad status, malformed data — gives "no update" and never throws.
import { isOneMac } from "../platform.ts";
import { compareVersions, REPOSITORY, isOneVersion, LABEL } from "./flux.ts";

export type Workstation = "mac" | "windows" | "android";

export const EXTENSIONS: Record<Workstation, string> = { mac: ".dmg", windows: ".exe", android: ".apk" };

// The first-open hint: what to do the first time the unsigned app is opened. Android has none.
export type Hint = "mac-right-click-open" | "windows-more-info-run-anyway";

export const hintOf = (workstation: Workstation): Hint | undefined =>
  workstation === "mac" ? "mac-right-click-open" : workstation === "windows" ? "windows-more-info-run-anyway" : undefined;

// The device an app runs on, from `process.platform`; Android is told by its caller, not read here.
export const workstationOf = (platform: string): Workstation | undefined => (isOneMac(platform) ? "mac" : platform === "win32" ? "windows" : undefined);

// `version`: the newest published; `courante`: the running one, which the notice says beside it.
export type Opinion = { version: string; courante: string; url: string; indice?: Hint };

export type OptionsOpinion = {
  // The version of the running app.
  version: string;
  poste: Workstation;
  depot?: string;
  api?: string;
  // How long each read may take.
  delaiMs?: number;
  fetch?: typeof fetch;
};

// At most this many tags tried, highest first, before saying there is nothing.
const TRIALS = 3;

// The download URL of the package of a release for this device, among its assets.
export function linkOfPackage(release: unknown, workstation: Workstation): string | undefined {
  const assets = (release as { assets?: unknown } | null)?.assets;
  if (!Array.isArray(assets)) return undefined;
  for (const asset of assets as Array<{ name?: unknown; browser_download_url?: unknown } | null>) {
    const { name, browser_download_url: url } = asset ?? {};
    if (typeof name === "string" && name.toLowerCase().endsWith(EXTENSIONS[workstation]) && typeof url === "string" && /^https:\/\/\S+$/.test(url)) return url;
  }
  return undefined;
}

export async function searchOneUpdate(options: OptionsOpinion): Promise<Opinion | undefined> {
  try {
    if (!isOneVersion(options.version)) return undefined;
    const repository = options.depot ?? REPOSITORY;
    const api = options.api ?? "https://api.github.com";
    const read = async (url: string) => {
      const answer = await (options.fetch ?? fetch)(url, { headers: { accept: "application/vnd.github+json", "user-agent": "brigade-app" }, signal: AbortSignal.timeout(options.delaiMs ?? 30_000) });
      return answer.ok ? ((await answer.json()) as unknown) : undefined;
    };
    const refs = await read(`${api}/repos/${repository}/git/matching-refs/tags/${LABEL}`);
    if (!Array.isArray(refs)) return undefined;
    const prefix = `refs/tags/${LABEL}`;
    const candidates = refs
      .flatMap((r) => (typeof (r as { ref?: unknown })?.ref === "string" && (r as { ref: string }).ref.startsWith(prefix) ? [(r as { ref: string }).ref.slice(prefix.length)] : []))
      .filter((version) => isOneVersion(version) && compareVersions(version, options.version) > 0)
      .sort((a, b) => compareVersions(b, a))
      .slice(0, TRIALS);
    for (const version of candidates) {
      const url = linkOfPackage(await read(`${api}/repos/${repository}/releases/tags/${encodeURIComponent(`${LABEL}${version}`)}`), options.poste);
      if (url === undefined) continue;
      const hint = hintOf(options.poste);
      return hint === undefined ? { version, courante: options.version, url } : { version, courante: options.version, url, indice: hint };
    }
    return undefined;
  } catch {
    return undefined;
  }
}
