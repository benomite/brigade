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

export const DEPOT = "benomite/brigade";
export const ETIQUETTE = "app-v";

// Ce qu'une release porte pour un poste : le fichier de ses métadonnées, et l'extension de
// l'installeur qu'elles nomment.
export type Format = { metadonnees: string; extension: string };
export const MAC: Format = { metadonnees: "latest-mac.yml", extension: ".dmg" };
export const WINDOWS: Format = { metadonnees: "latest.yml", extension: ".exe" };
// Le format du poste où l'app tourne. Seuls le Mac et Windows ont une app installée : ailleurs,
// l'app est lancée depuis le dépôt et ne lit pas le flux.
export const formatDe = (plateforme: string): Format => (plateforme === "win32" ? WINDOWS : MAC);

// Une version publiée : son numéro, et l'installeur qui la porte — son nom, son adresse, son sha512
// (base64, comme ses métadonnées le disent) et sa taille en octets.
export type Publiee = { version: string; nom: string; url: string; sha512: string; taille: number };

export type Flux = {
  // Où l'app regarde, en une ligne.
  nom: string;
  // La plus haute version publiée au-dessus de `courante` — rien, si l'app est à jour.
  nouvelle(courante: string, signal?: AbortSignal): Promise<Publiee | undefined>;
};

// Des entiers séparés de points, puis, éventuellement, `+` et l'empreinte d'un commit : la forme
// qu'écrit app/packaging/construire.ts.
const VERSION = /^\d+(\.\d+){0,3}(\+[0-9A-Za-z.-]+)?$/;

export const estUneVersion = (version: string) => VERSION.test(version);

// Compare deux versions par leurs nombres ; ce qui suit `+` ne compte pas. Négatif : `a` est plus
// ancienne.
export function comparerVersions(a: string, b: string): number {
  const nombres = (version: string) => (version.split("+")[0] ?? "").split(".").map(Number);
  const [na, nb] = [nombres(a), nombres(b)];
  for (let i = 0; i < Math.max(na.length, nb.length); i++) {
    const ecart = (na[i] ?? 0) - (nb[i] ?? 0);
    if (ecart !== 0) return ecart;
  }
  return 0;
}

// Ce que disent les métadonnées d'un poste (construire.ts, `metadonneesDeMiseAJour`, qui écrit
// aussi celles de Windows) — ou pourquoi elles ne se lisent pas. Le nom de l'installeur n'est qu'un
// nom de fichier, de l'extension du poste : rien d'autre ne s'ajoute à l'adresse.
export function lireMetadonnees(texte: string, format: Format = MAC): { version: string; nom: string; sha512: string; taille: number } {
  const { metadonnees, extension } = format;
  const valeur = (cle: string) =>
    new RegExp(`^${cle}:[ \\t]*(.+?)[ \\t]*$`, "m")
      .exec(texte)?.[1]
      ?.replace(/^'(.*)'$/, "$1")
      .replace(/^"(.*)"$/, "$1");
  const version = valeur("version");
  const nom = valeur("path");
  const sha512 = valeur("sha512");
  const taille = Number(/^[ \t]+size:[ \t]*(\d+)[ \t]*$/m.exec(texte)?.[1]);
  if (version === undefined || !estUneVersion(version)) throw new Error(`${metadonnees} gives no valid version`);
  if (nom === undefined || !/^[\w.+-]+$/.test(nom) || !nom.endsWith(extension) || nom === extension) throw new Error(`${metadonnees} names no ${extension}`);
  if (sha512 === undefined || !/^[A-Za-z0-9+/]{86}==$/.test(sha512)) throw new Error(`${metadonnees} gives no sha512`);
  if (!Number.isSafeInteger(taille) || taille <= 0) throw new Error(`${metadonnees} gives no size`);
  return { version, nom, sha512, taille };
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
const ESSAIS = 3;

export function fluxGitHub(options: OptionsFlux = {}): Flux {
  const depot = options.depot ?? DEPOT;
  const api = options.api ?? "https://api.github.com";
  const telechargements = options.telechargements ?? "https://github.com";
  const delaiMs = options.delaiMs ?? 30_000;
  const format = options.format ?? MAC;
  const lire = async (url: string, signal: AbortSignal | undefined) => {
    const garde = AbortSignal.timeout(delaiMs);
    return fetch(url, { headers: { accept: "application/vnd.github+json", "user-agent": "brigade-app" }, signal: signal === undefined ? garde : AbortSignal.any([signal, garde]) });
  };
  return {
    nom: `the releases of ${depot}`,
    async nouvelle(courante, signal) {
      const etiquettes = await lire(`${api}/repos/${depot}/git/matching-refs/tags/${ETIQUETTE}`, signal);
      if (!etiquettes.ok) throw new Error(`GitHub answered ${etiquettes.status} to the list of tags of ${depot}`);
      const refs: unknown = await etiquettes.json();
      if (!Array.isArray(refs)) throw new Error(`GitHub did not answer a list of tags for ${depot}`);
      const candidates = refs
        .flatMap(({ ref }: { ref?: unknown }) => (typeof ref === "string" && ref.startsWith(`refs/tags/${ETIQUETTE}`) ? [ref.slice(`refs/tags/${ETIQUETTE}`.length)] : []))
        .filter((version) => estUneVersion(version) && comparerVersions(version, courante) > 0)
        .sort((a, b) => comparerVersions(b, a))
        .slice(0, ESSAIS);
      for (const version of candidates) {
        const release = `${telechargements}/${depot}/releases/download/${encodeURIComponent(`${ETIQUETTE}${version}`)}`;
        const reponse = await lire(`${release}/${format.metadonnees}`, signal);
        // Étiquetée, mais pas (encore) publiée : la suivante.
        if (reponse.status === 404) continue;
        if (!reponse.ok) throw new Error(`GitHub answered ${reponse.status} to ${format.metadonnees} of ${ETIQUETTE}${version}`);
        const lue = lireMetadonnees(await reponse.text(), format);
        if (comparerVersions(lue.version, courante) <= 0) continue;
        return { version: lue.version, nom: lue.nom, url: `${release}/${encodeURIComponent(lue.nom)}`, sha512: lue.sha512, taille: lue.taille };
      }
      return undefined;
    },
  };
}

// `source` : rien pour GitHub, ou l'adresse d'un serveur d'essai qui répond comme lui. Une source
// mal écrite n'empêche pas l'app de s'ouvrir : chaque lecture du flux dit l'erreur. `format` : celui
// du poste où l'app tourne.
export function fluxDe(source: string | undefined, format: Format = MAC): Flux {
  if (source === undefined || source === "") return fluxGitHub({ format });
  if (!/^https?:\/\/[^\s]+$/.test(source)) {
    const raison = `BRIGADE_APP_MISE_A_JOUR_SOURCE=${source.slice(0, 80)} — expected an http(s) address`;
    return { nom: source.slice(0, 80), nouvelle: () => Promise.reject(new Error(raison)) };
  }
  const base = source.replace(/\/+$/, "");
  return fluxGitHub({ api: base, telechargements: base, format });
}
