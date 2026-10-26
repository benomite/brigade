// Le contrat de l'enregistrement d'une station sous le compte GitHub de sa
// machine (#1705) : ce qu'elle publie, où, et la règle qui la dit disponible.
// Le détail, champ par champ, est dans le README de ce répertoire — ce fichier
// en est la source pour le code : la station l'écrit (`enregistrer.ts`), et
// qui lit les stations du compte le lit (`stations-du-compte.ts`).
//
// Une station enregistrée est un gist secret du compte qui porte
// `brigade-enregistrement.json`. Le gist appartient au compte du `gh` de la
// machine : c'est ce qui la met « sous » ce compte, sans code ni appairage.
// L'app connectée au même compte liste ses gists et les y trouve.

export const FICHIER_ENREGISTREMENT = "brigade-enregistrement.json";
// Écrit par l'app seule, jamais par la station : les projets que le chef lui
// choisit (#1706 l'écrit, #1707 le lit).
export const FICHIER_SELECTION = "brigade-selection.json";
export const FORMAT = 1;
// La description du gist, pour qui le voit dans la liste des gists du compte.
export const description = (nom: string) => `brigade — station ${nom} (registration)`;

// Entre deux écritures de la station : son signe de vie.
export const RAFRAICHI_MS = 120_000;
// Une écriture ratée — GitHub muet, `gh` pas encore connecté — se retente à ce pas.
export const NOUVEL_ESSAI_MS = 60_000;
// La marge, au-delà de deux signes de vie manqués, avant de la dire indisponible.
export const MARGE_MS = 30_000;
// Indisponible après 2 × refreshMs + 30 s sans signe de vie : 270 s au pas publié.
export const indisponibleApres = (refreshMs: number) => 2 * refreshMs + MARGE_MS;

export type Plateforme = "linux" | "macos" | "windows";

export type Enregistrement = {
  brigade: "station-registration";
  format: number;
  name: string;
  // `linux`, `macos`, `windows` — ou le `process.platform` brut d'un autre système.
  platform: Plateforme | string;
  // Le système et sa version, tels que la liste les affiche : `Linux 6.1.0`.
  machine: string;
  version: string;
  // Sa première écriture : elle ne bouge plus tant que la station garde son gist.
  registeredAt: string;
  // Sa dernière écriture.
  lastSeen: string;
  refreshMs: number;
  // L'heure de son arrêt propre, null tant qu'elle tourne.
  stoppedAt: string | null;
};

export type Selection = { brigade: "station-selection"; format: number; repositories: string[]; updatedAt: string };

// `process.platform` tel que le contrat le dit.
export const plateformeDe = (plateforme: string): Plateforme | string => (plateforme === "darwin" ? "macos" : plateforme === "win32" ? "windows" : plateforme);

const texte = (valeur: unknown): valeur is string => typeof valeur === "string" && valeur !== "";
const date = (valeur: unknown): valeur is string => texte(valeur) && !Number.isNaN(Date.parse(valeur));

// L'enregistrement tel qu'un gist le porte — ou pourquoi il ne se lit pas.
export function enregistrementLu(brut: string): Enregistrement | { illisible: string } {
  let lu: Record<string, unknown>;
  try {
    lu = JSON.parse(brut) as Record<string, unknown>;
  } catch {
    return { illisible: "its registration is not JSON" };
  }
  if (lu === null || typeof lu !== "object" || lu.brigade !== "station-registration") return { illisible: "its registration is not a brigade station's" };
  const { format, name, platform, machine, version, registeredAt, lastSeen, refreshMs, stoppedAt } = lu;
  if (typeof format !== "number" || format > FORMAT) return { illisible: `its registration has a format this brigade does not read (${String(format)})` };
  if (!texte(name) || !texte(platform) || !texte(version) || !date(registeredAt) || !date(lastSeen)) return { illisible: "its registration lacks its name, platform, version or last sign of life" };
  if (typeof refreshMs !== "number" || !(refreshMs > 0)) return { illisible: "its registration lacks its refresh period" };
  return {
    brigade: "station-registration",
    format,
    name,
    platform,
    machine: typeof machine === "string" ? machine : "",
    version,
    registeredAt,
    lastSeen,
    refreshMs,
    stoppedAt: date(stoppedAt) ? stoppedAt : null,
  };
}

// La règle de fraîcheur : disponible tant qu'elle ne s'est pas arrêtée depuis
// son dernier signe de vie, et qu'elle n'en a pas manqué deux.
export function disponible(enregistrement: Pick<Enregistrement, "lastSeen" | "stoppedAt" | "refreshMs">, instant: number): boolean {
  const vue = Date.parse(enregistrement.lastSeen);
  if (enregistrement.stoppedAt !== null && Date.parse(enregistrement.stoppedAt) >= vue) return false;
  return instant - vue <= indisponibleApres(enregistrement.refreshMs);
}

// La sélection que l'app a écrite, ou null si elle ne se lit pas.
export function selectionLue(brut: string): Selection | null {
  let lu: Record<string, unknown>;
  try {
    lu = JSON.parse(brut) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (lu === null || typeof lu !== "object" || lu.brigade !== "station-selection" || typeof lu.format !== "number" || lu.format > FORMAT) return null;
  const { repositories, updatedAt } = lu;
  if (!Array.isArray(repositories) || !repositories.every((depot) => typeof depot === "string" && /^[\w.-]+\/[\w.-]+$/.test(depot)) || !date(updatedAt)) return null;
  return { brigade: "station-selection", format: lu.format, repositories: [...new Set(repositories as string[])], updatedAt };
}
