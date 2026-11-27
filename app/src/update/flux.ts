// Où l'app installée trouve ses nouvelles versions : les releases GitHub du dépôt de brigade
// dont l'étiquette est `app-v<version>`, que publie le workflow publier-app
// (app/packaging/README.md). Chacune porte l'installeur de chaque poste et ses métadonnées — sa
// version, le nom de l'installeur, son sha512 (base64) et sa taille : le .dmg et `latest-mac.yml`
// pour le Mac, le setup .exe et `latest.yml` pour Windows (app/packaging/WINDOWS.md). Une app lit
// celles de son poste, et rien d'autre ne change de l'un à l'autre.
//
// Les étiquettes se lisent par l'API de GitHub (`git/matching-refs/tags/app-v`), pas dans la
// liste des releases : celles de la station s'y publient par dizaines chaque jour et
// repousseraient celles de l'app hors de la première page. La nouvelle version est la plus
// haute au-dessus de la sienne dont les métadonnées de son poste sont publiées : une étiquette
// posée dont la release ne les porte pas encore (le workflow tourne, ou a échoué, ou ne publie que
// l'autre poste) n'en est pas une.
//
// Une installation d'essai lit les siennes ailleurs (`BRIGADE_APP_MISE_A_JOUR_SOURCE`) : un
// serveur qui répond comme GitHub, l'API et les téléchargements sous la même adresse.

export const REPOSITORY = "benomite/brigade";
export const LABEL = "app-v";

// Ce qu'une release porte pour un poste : le fichier de ses métadonnées, et l'extension de
// l'installeur qu'elles nomment.
export type Format = { metadonnees: string; extension: string };
export const MAC: Format = { metadonnees: "latest-mac.yml", extension: ".dmg" };
export const WINDOWS: Format = { metadonnees: "latest.yml", extension: ".exe" };
// Le format du poste où l'app tourne. Seuls le Mac et Windows ont une app installée : ailleurs,
// l'app est lancée depuis le dépôt et ne lit pas le flux.
export const formatOf = (platform: string): Format => (platform === "win32" ? WINDOWS : MAC);

// Une version publiée : son numéro, et l'installeur qui la porte — son nom, son adresse, son sha512
// (base64, comme ses métadonnées le disent) et sa taille en octets.
export type Published = { version: string; nom: string; url: string; sha512: string; taille: number };

export type Flux = {
  // Où l'app regarde, en une ligne.
  nom: string;
  // La plus haute version publiée au-dessus de `courante` — rien, si l'app est à jour.
  nouvelle(current: string, signal?: AbortSignal): Promise<Published | undefined>;
};

// Des entiers séparés de points, puis, éventuellement, `+` et l'empreinte d'un commit : la forme
// qu'écrit app/packaging/construire.ts.
const VERSION = /^\d+(\.\d+){0,3}(\+[0-9A-Za-z.-]+)?$/;

export const isOneVersion = (version: string) => VERSION.test(version);

// Compare deux versions par leurs nombres ; ce qui suit `+` ne compte pas. Négatif : `a` est plus
// ancienne.
export function compareVersions(a: string, b: string): number {
  const numbers = (version: string) => (version.split("+")[0] ?? "").split(".").map(Number);
  const [na, nb] = [numbers(a), numbers(b)];
  for (let i = 0; i < Math.max(na.length, nb.length); i++) {
    const gap = (na[i] ?? 0) - (nb[i] ?? 0);
    if (gap !== 0) return gap;
  }
  return 0;
}

// Ce que disent les métadonnées d'un poste (construire.ts, `metadonneesDeMiseAJour`, qui écrit
// aussi celles de Windows) — ou pourquoi elles ne se lisent pas. Le nom de l'installeur n'est qu'un
// nom de fichier, de l'extension du poste : rien d'autre ne s'ajoute à l'adresse.
export function readMetadonnees(text: string, format: Format = MAC): { version: string; nom: string; sha512: string; taille: number } {
  const { metadonnees, extension } = format;
  const value = (key: string) =>
    new RegExp(`^${key}:[ \\t]*(.+?)[ \\t]*$`, "m")
      .exec(text)?.[1]
      ?.replace(/^'(.*)'$/, "$1")
      .replace(/^"(.*)"$/, "$1");
  const version = value("version");
  const name = value("path");
  const sha512 = value("sha512");
  const size = Number(/^[ \t]+size:[ \t]*(\d+)[ \t]*$/m.exec(text)?.[1]);
  if (version === undefined || !isOneVersion(version)) throw new Error(`${metadonnees} gives no valid version`);
  if (name === undefined || !/^[\w.+-]+$/.test(name) || !name.endsWith(extension) || name === extension) throw new Error(`${metadonnees} names no ${extension}`);
  if (sha512 === undefined || !/^[A-Za-z0-9+/]{86}==$/.test(sha512)) throw new Error(`${metadonnees} gives no sha512`);
  if (!Number.isSafeInteger(size) || size <= 0) throw new Error(`${metadonnees} gives no size`);
  return { version, nom: name, sha512, taille: size };
}

export type OptionsFlux = {
  depot?: string;
  // Le poste dont l'app lit les métadonnées : le Mac, sans rien.
  format?: Format;
  // L'API de GitHub, et l'adresse sous laquelle se téléchargent les fichiers des releases.
  api?: string;
  telechargements?: string;
  // Combien de temps une lecture a pour répondre.
  delaiMs?: number;
};

// Au plus tant d'étiquettes essayées, de la plus haute à la plus basse, avant de dire l'app à jour.
const TRIALS = 3;

export function fluxGitHub(options: OptionsFlux = {}): Flux {
  const repository = options.depot ?? REPOSITORY;
  const api = options.api ?? "https://api.github.com";
  const downloads = options.telechargements ?? "https://github.com";
  const delayMs = options.delaiMs ?? 30_000;
  const format = options.format ?? MAC;
  const read = async (url: string, signal: AbortSignal | undefined) => {
    const guard = AbortSignal.timeout(delayMs);
    return fetch(url, { headers: { accept: "application/vnd.github+json", "user-agent": "brigade-app" }, signal: signal === undefined ? guard : AbortSignal.any([signal, guard]) });
  };
  return {
    nom: `the releases of ${repository}`,
    async nouvelle(current, signal) {
      const labels = await read(`${api}/repos/${repository}/git/matching-refs/tags/${LABEL}`, signal);
      if (!labels.ok) throw new Error(`GitHub answered ${labels.status} to the list of tags of ${repository}`);
      const refs: unknown = await labels.json();
      if (!Array.isArray(refs)) throw new Error(`GitHub did not answer a list of tags for ${repository}`);
      const candidates = refs
        .flatMap(({ ref }: { ref?: unknown }) => (typeof ref === "string" && ref.startsWith(`refs/tags/${LABEL}`) ? [ref.slice(`refs/tags/${LABEL}`.length)] : []))
        .filter((version) => isOneVersion(version) && compareVersions(version, current) > 0)
        .sort((a, b) => compareVersions(b, a))
        .slice(0, TRIALS);
      for (const version of candidates) {
        const release = `${downloads}/${repository}/releases/download/${encodeURIComponent(`${LABEL}${version}`)}`;
        const answer = await read(`${release}/${format.metadonnees}`, signal);
        // Étiquetée, mais pas (encore) publiée : la suivante.
        if (answer.status === 404) continue;
        if (!answer.ok) throw new Error(`GitHub answered ${answer.status} to ${format.metadonnees} of ${LABEL}${version}`);
        const readEntry = readMetadonnees(await answer.text(), format);
        if (compareVersions(readEntry.version, current) <= 0) continue;
        return { version: readEntry.version, nom: readEntry.nom, url: `${release}/${encodeURIComponent(readEntry.nom)}`, sha512: readEntry.sha512, taille: readEntry.taille };
      }
      return undefined;
    },
  };
}

// `source` : rien pour GitHub, ou l'adresse d'un serveur d'essai qui répond comme lui. Une source
// mal écrite n'empêche pas l'app de s'ouvrir : chaque lecture du flux dit l'erreur. `format` : celui
// du poste où l'app tourne.
export function fluxOf(source: string | undefined, format: Format = MAC): Flux {
  if (source === undefined || source === "") return fluxGitHub({ format });
  if (!/^https?:\/\/[^\s]+$/.test(source)) {
    const reason = `BRIGADE_APP_MISE_A_JOUR_SOURCE=${source.slice(0, 80)} — expected an http(s) address`;
    return { nom: source.slice(0, 80), nouvelle: () => Promise.reject(new Error(reason)) };
  }
  const base = source.replace(/\/+$/, "");
  return fluxGitHub({ api: base, telechargements: base, format });
}
