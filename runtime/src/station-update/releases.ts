// Où la station de l'ordinateur trouve ses versions publiées : la même source
// que la mise à jour de la box (`BRIGADE_MISE_A_JOUR_SOURCE`,
// `mise-a-jour/publications.ts`) — les releases `station-<version>` du dépôt de
// brigade, ni brouillon ni pré-version —, mais pas le même fichier : la box
// prend le paquet Debian, l'ordinateur prend le runtime seul, celui que la
// publication range pour sa plateforme (`brigade-station-mac.tar.gz`,
// `brigade-station-windows.zip`, `.github/workflows/publier-station.yml`).
//
// Une installation de test lit les siennes dans un répertoire : un
// sous-répertoire par version, l'archive dedans sous le même nom.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { ETIQUETTE } from "../mise-a-jour/publications.ts";
import { VERSION } from "../mise-a-jour/versions.ts";

// L'archive du runtime que la publication porte pour une plateforme ; nulle
// quand elle n'en porte aucune (Linux : la box prend le paquet).
export function archiveDe(plateforme: NodeJS.Platform): string | null {
  if (plateforme === "darwin") return "brigade-station-mac.tar.gz";
  if (plateforme === "win32") return "brigade-station-windows.zip";
  return null;
}

// Une version publiée. `archive` : l'adresse, ou le chemin, de l'archive de
// la plateforme — nulle si la release n'en porte pas. `empreinte` : son
// sha256, quand la publication le dit.
export type Release = { version: string; archive: string | null; empreinte: string | null };

export type SourceDesVersions = {
  // Où la station regarde, en une ligne.
  nom: string;
  lister(): Promise<Release[]>;
  // Pose l'archive d'une release dans `fichier`, vérifiée contre son empreinte.
  telecharger(release: Release & { archive: string }, fichier: string): Promise<void>;
};

const DELAI_LISTE_MS = 60_000;
const DELAI_ARCHIVE_MS = 10 * 60_000;

type ReleaseGitHub = { tag_name?: unknown; draft?: unknown; prerelease?: unknown; assets?: Array<{ name?: unknown; browser_download_url?: unknown; digest?: unknown }> };

// Les versions que portent les releases d'un dépôt, telles que l'API de GitHub
// les rend. Une release sans l'archive de la plateforme compte quand même :
// la station sait qu'elle est en retard, même sans de quoi se mettre à jour.
export function lireReleasesGitHub(releases: unknown, archive: string | null): Release[] {
  if (!Array.isArray(releases)) throw new Error("GitHub did not return a list of releases");
  return (releases as ReleaseGitHub[]).flatMap((release) => {
    if (typeof release.tag_name !== "string" || !release.tag_name.startsWith(ETIQUETTE) || release.draft === true || release.prerelease === true) return [];
    const version = release.tag_name.slice(ETIQUETTE.length);
    if (!VERSION.test(version)) return [];
    const asset = archive === null ? undefined : release.assets?.find((lu) => lu.name === archive);
    const adresse = typeof asset?.browser_download_url === "string" ? asset.browser_download_url : null;
    const empreinte = adresse !== null && typeof asset?.digest === "string" && /^sha256:[0-9a-f]{64}$/.test(asset.digest) ? asset.digest.slice("sha256:".length) : null;
    return [{ version, archive: adresse, empreinte }];
  });
}

function depuisGitHub(depot: string, archive: string | null): SourceDesVersions {
  const entetes = { accept: "application/vnd.github+json", "user-agent": "brigade-station" };
  return {
    nom: `the releases of ${depot}`,
    async lister() {
      const reponse = await fetch(`https://api.github.com/repos/${depot}/releases?per_page=100`, { headers: entetes, signal: AbortSignal.timeout(DELAI_LISTE_MS) });
      if (!reponse.ok) throw new Error(`GitHub answered ${reponse.status} to the list of releases of ${depot}`);
      return lireReleasesGitHub(await reponse.json(), archive);
    },
    async telecharger(release, fichier) {
      const reponse = await fetch(release.archive, { headers: { "user-agent": entetes["user-agent"] }, signal: AbortSignal.timeout(DELAI_ARCHIVE_MS) });
      if (!reponse.ok) throw new Error(`the archive of ${release.version} does not download (${reponse.status}, ${release.archive})`);
      const contenu = Buffer.from(await reponse.arrayBuffer());
      const lue = createHash("sha256").update(contenu).digest("hex");
      if (release.empreinte !== null && lue !== release.empreinte) throw new Error(`the archive of ${release.version} does not have the published digest (${lue.slice(0, 12)}…, expected ${release.empreinte.slice(0, 12)}…)`);
      writeFileSync(`${fichier}.part`, contenu);
      renameSync(`${fichier}.part`, fichier);
    },
  };
}

function depuisRepertoire(repertoire: string, archive: string | null): SourceDesVersions {
  return {
    nom: `the directory ${repertoire}`,
    async lister() {
      if (!existsSync(repertoire)) throw new Error(`the directory of published versions (${repertoire}) does not exist`);
      return readdirSync(repertoire, { withFileTypes: true }).flatMap((entree) => {
        if (!entree.isDirectory() || !VERSION.test(entree.name)) return [];
        const chemin = archive === null ? null : join(repertoire, entree.name, archive);
        return [{ version: entree.name, archive: chemin !== null && existsSync(chemin) ? chemin : null, empreinte: null }];
      });
    },
    async telecharger(release, fichier) {
      try {
        copyFileSync(release.archive, `${fichier}.part`);
        renameSync(`${fichier}.part`, fichier);
      } catch (erreur) {
        rmSync(`${fichier}.part`, { force: true });
        throw new Error(`the archive of ${release.version} does not copy (${release.archive}): ${(erreur as Error).message}`);
      }
    },
  };
}

// `source` : `github:<owner>/<repo>`, ou le chemin d'un répertoire — ce que
// la box lit dans la même variable.
export function sourceDesVersions(source: string | undefined, archive: string | null): SourceDesVersions {
  if (source === undefined || source === "") throw new Error("BRIGADE_MISE_A_JOUR_SOURCE is not set — say where the published versions are: github:<owner>/<repo>, or the path of a directory");
  if (isAbsolute(source)) return depuisRepertoire(source, archive);
  const depot = /^github:([\w.-]+\/[\w.-]+)$/.exec(source)?.[1];
  if (depot === undefined) throw new Error(`BRIGADE_MISE_A_JOUR_SOURCE=${source.slice(0, 80)} — expected github:<owner>/<repo>, or the path of a directory`);
  return depuisGitHub(depot, archive);
}
