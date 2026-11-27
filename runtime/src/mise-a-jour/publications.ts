// Où la station trouve les versions publiées : les releases GitHub du dépôt
// de brigade que l'installation désigne (`BRIGADE_MISE_A_JOUR_SOURCE`, posée
// par l'installation — aucun dépôt n'est supposé), celles dont l'étiquette est
// `station-<version>` et qui portent l'archive de sa plateforme, `brigade-station-<version>-<os>-<arch>.tar.gz`. Ni brouillon,
// ni pré-version.
//
// Une installation de test lit les siennes dans un répertoire
// (`BRIGADE_MISE_A_JOUR_SOURCE=/chemin`) : un sous-répertoire par version,
// l'archive dedans sous le même nom. Publier une version, c'est l'y poser.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { VERSION } from "./versions.ts";

export const ETIQUETTE = "station-";
// La plateforme d'une station : `<os>-<arch>`, `linux-x64` ou `darwin-arm64`.
export type Platform = { os: string; arch: string };
export const archiveName = (version: string, { os, arch }: Platform) => `brigade-station-${version}-${os}-${arch}.tar.gz`;

// `archive` : son adresse, ou son chemin. `empreinte` : son sha256, quand la
// publication le dit.
export type Publication = { version: string; archive: string; empreinte: string | null };

export type Publications = {
  // Ce qui le dit en une ligne : où la station regarde.
  nom: string;
  lister(): Promise<Publication[]>;
  // Pose l'archive d'une publication dans `fichier`, vérifié.
  telecharger(publication: Publication, fichier: string): Promise<void>;
};

const DELAI_LISTE_MS = 60_000;
const DELAI_PAQUET_MS = 10 * 60_000;

type Release = { tag_name?: unknown; draft?: unknown; prerelease?: unknown; body?: unknown; assets?: Array<{ name?: unknown; browser_download_url?: unknown; digest?: unknown }> };

// Les versions que portent les releases d'un dépôt, telles que l'API de GitHub
// les rend.
export function lirePublicationsGitHub(releases: unknown, plateforme: Platform): Publication[] {
  if (!Array.isArray(releases)) throw new Error("GitHub n'a pas rendu une liste de releases");
  return (releases as Release[]).flatMap((release) => {
    if (typeof release.tag_name !== "string" || !release.tag_name.startsWith(ETIQUETTE) || release.draft === true || release.prerelease === true) return [];
    const version = release.tag_name.slice(ETIQUETTE.length);
    const archive = release.assets?.find((asset) => asset.name === archiveName(version, plateforme));
    if (!VERSION.test(version) || typeof archive?.browser_download_url !== "string") return [];
    const empreinte = typeof archive.digest === "string" && /^sha256:[0-9a-f]{64}$/.test(archive.digest) ? archive.digest.slice("sha256:".length) : null;
    return [{ version, archive: archive.browser_download_url, empreinte }];
  });
}

function depuisGitHub(depot: string, plateforme: Platform): Publications {
  const entetes = { accept: "application/vnd.github+json", "user-agent": "brigade-station" };
  return {
    nom: `les releases de ${depot}`,
    async lister() {
      const reponse = await fetch(`https://api.github.com/repos/${depot}/releases?per_page=100`, { headers: entetes, signal: AbortSignal.timeout(DELAI_LISTE_MS) });
      if (!reponse.ok) throw new Error(`GitHub a répondu ${reponse.status} à la liste des releases de ${depot}`);
      return lirePublicationsGitHub(await reponse.json(), plateforme);
    },
    async telecharger(publication, fichier) {
      const reponse = await fetch(publication.archive, { headers: { "user-agent": entetes["user-agent"] }, signal: AbortSignal.timeout(DELAI_PAQUET_MS) });
      if (!reponse.ok) throw new Error(`l'archive de ${publication.version} ne se télécharge pas (${reponse.status}, ${publication.archive})`);
      const contenu = Buffer.from(await reponse.arrayBuffer());
      const lue = createHash("sha256").update(contenu).digest("hex");
      if (publication.empreinte !== null && lue !== publication.empreinte) throw new Error(`l'archive de ${publication.version} n'a pas l'empreinte publiée (${lue.slice(0, 12)}…, attendu ${publication.empreinte.slice(0, 12)}…)`);
      writeFileSync(`${fichier}.part`, contenu);
      renameSync(`${fichier}.part`, fichier);
    },
  };
}

function depuisRepertoire(repertoire: string, plateforme: Platform): Publications {
  return {
    nom: `le répertoire ${repertoire}`,
    async lister() {
      if (!existsSync(repertoire)) throw new Error(`le répertoire des versions publiées (${repertoire}) n'existe pas`);
      return readdirSync(repertoire, { withFileTypes: true }).flatMap((entree) => {
        const archive = join(repertoire, entree.name, archiveName(entree.name, plateforme));
        if (!entree.isDirectory() || !VERSION.test(entree.name) || !existsSync(archive)) return [];
        return [{ version: entree.name, archive, empreinte: null }];
      });
    },
    async telecharger(publication, fichier) {
      try {
        copyFileSync(publication.archive, `${fichier}.part`);
        renameSync(`${fichier}.part`, fichier);
      } catch (erreur) {
        rmSync(`${fichier}.part`, { force: true });
        throw new Error(`l'archive de ${publication.version} ne se copie pas (${publication.archive}) : ${(erreur as Error).message}`);
      }
    },
  };
}

// `source` : `github:<owner>/<repo>`, ou le chemin d'un répertoire.
export function publications(source: string | undefined, plateforme: Platform): Publications {
  if (source === undefined || source === "") throw new Error("BRIGADE_MISE_A_JOUR_SOURCE is not set — say where the published versions are: github:<owner>/<repo> (the GitHub account and repository that publish brigade), or the path of a directory");
  if (isAbsolute(source)) return depuisRepertoire(source, plateforme);
  const depot = /^github:([\w.-]+\/[\w.-]+)$/.exec(source)?.[1];
  if (depot === undefined) throw new Error(`BRIGADE_MISE_A_JOUR_SOURCE=${source.slice(0, 80)} — attendu github:<owner>/<repo>, ou le chemin d'un répertoire`);
  return depuisGitHub(depot, plateforme);
}
