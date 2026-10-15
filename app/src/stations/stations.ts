// Les stations du chef sur la home : celles qu'il a appairées, lues sur GitHub
// toutes les trente secondes, chacune en une ligne — « online · version X · no
// project », ou « offline for 4 min · … ». Le gist d'une station reste quand
// elle s'éteint : elle passe hors ligne, elle ne quitte pas la liste. Une
// lecture ratée garde la liste d'avant, et dit pourquoi elle n'est pas fraîche.
//
// L'appairage : le chef tape le code que la station affiche. L'app cherche,
// parmi les gists de station du compte, celui qui publie l'empreinte de ce
// code, et y écrit l'appairage — la station le lit à son signe de vie suivant.
// Un code mal formé, inconnu ou échu est refusé en une ligne, et rien n'est écrit.
import { empreinte, FICHIER_APPAIRAGE, FICHIER_STATION, lireDocument, normaliser, type DocumentStation } from "./document.ts";
import type { GistDeStation, GitHubDesStations } from "./github.ts";

export type EtatDeStation = "en-ligne" | "hors-ligne" | "illisible";
// Une station telle que la home la montre. `id` : son gist.
export type StationVue = { id: string; nom: string; machine: string; etat: EtatDeStation; ligne: string };
// `sans` : pourquoi la dernière lecture n'a pas abouti — la liste est alors celle d'avant.
export type VuDesStations = { a: string; stations: StationVue[]; sans?: string };
export type Appairage = { appairee: string } | { refus: string };

// Entre deux lectures de GitHub.
export const CADENCE_MS = 30_000;

// La station est dite hors ligne quand elle a manqué deux signes de vie : à
// la minute près, sans qu'un signe en retard de quelques secondes ne la fasse
// clignoter.
export const horsLigneApres = (cadenceMs: number) => 2 * cadenceMs + 30_000;

// Une durée, telle que la ligne la dit.
export function duree(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "less than a minute";
  if (minutes < 60) return `${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 48) return minutes % 60 === 0 ? `${heures} h` : `${heures} h ${String(minutes % 60).padStart(2, "0")}`;
  return `${Math.floor(heures / 24)} days`;
}

export const projetsDe = (projets: readonly string[]) => (projets.length === 0 ? "no project" : `${projets.length} project${projets.length > 1 ? "s" : ""}: ${projets.join(", ")}`);

// La ligne d'une station, à cet instant.
export function ligneDe(document: DocumentStation, maintenant: number): { etat: EtatDeStation; ligne: string } {
  const suite = `version ${document.version} · ${projetsDe(document.projets)}`;
  const signe = Date.parse(document.signeDeVie);
  const arretee = document.arreteeLe === null ? null : Date.parse(document.arreteeLe);
  const depuis = arretee !== null && arretee >= signe ? arretee : maintenant - signe > horsLigneApres(document.cadenceMs) ? signe : null;
  return depuis === null ? { etat: "en-ligne", ligne: `online · ${suite}` } : { etat: "hors-ligne", ligne: `offline for ${duree(maintenant - depuis)} · ${suite}` };
}

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

export type OptionsStations = {
  github: GitHubDesStations;
  surLecture: (vu: VuDesStations) => void;
  cadenceMs?: number;
  maintenant?: () => number;
};

export type Stations = {
  vu(): VuDesStations | undefined;
  relire(): Promise<VuDesStations>;
  appairer(tape: unknown): Promise<Appairage>;
  fermer(): void;
};

export function tenirStations(options: OptionsStations): Stations {
  const { github } = options;
  const maintenant = options.maintenant ?? Date.now;
  // Ce que chaque gist appairé disait à sa dernière lecture, et quand GitHub l'a changé.
  const lus = new Map<string, { misAJour: string; document: DocumentStation | { illisible: string } }>();
  let vu: VuDesStations | undefined;
  let enCours: Promise<VuDesStations> | undefined;

  const montrer = (sans?: string): VuDesStations => {
    const instant = maintenant();
    const stations = [...lus].map(([id, { document }]): StationVue =>
      "illisible" in document ? { id, nom: id, machine: "", etat: "illisible", ligne: `unreadable: ${document.illisible}` } : { id, nom: document.nom, machine: document.machine, ...ligneDe(document, instant) },
    );
    stations.sort((a, b) => a.nom.localeCompare(b.nom) || a.id.localeCompare(b.id));
    vu = { a: new Date(instant).toISOString(), stations, ...(sans === undefined ? {} : { sans }) };
    options.surLecture(vu);
    return vu;
  };

  const lireGist = async (gist: GistDeStation) => {
    const avant = lus.get(gist.id);
    if (avant !== undefined && avant.misAJour === gist.misAJour && gist.misAJour !== "") return avant;
    const fichiers = await github.lire(gist.id);
    if (fichiers === null) return undefined;
    const brut = fichiers[FICHIER_STATION];
    return { misAJour: gist.misAJour, document: brut === undefined ? { illisible: "its gist no longer holds its state" } : lireDocument(brut) };
  };

  const lire = async (): Promise<VuDesStations> => {
    try {
      const appairees = (await github.lister()).filter(({ appairee }) => appairee);
      const relus = await Promise.all(appairees.map(async (gist) => [gist.id, await lireGist(gist)] as const));
      lus.clear();
      for (const [id, lu] of relus) if (lu !== undefined) lus.set(id, lu);
      return montrer();
    } catch (erreur) {
      return montrer(`your stations could not be read on GitHub — ${message(erreur)}`);
    }
  };

  const relire = () => {
    enCours ??= lire().finally(() => (enCours = undefined));
    return enCours;
  };

  const appairer = async (tape: unknown): Promise<Appairage> => {
    const dit = typeof tape === "string" ? tape.trim() : "";
    const code = normaliser(dit);
    if (code === null) return { refus: `“${dit.slice(0, 20)}” is not a pairing code: the station shows 8 letters and digits, like 7KQ2-M9XD` };
    const cherchee = empreinte(code);
    let nom: string;
    try {
      const candidats = (await github.lister()).filter(({ appairee }) => !appairee);
      const documents = await Promise.all(
        candidats.map(async ({ id }) => {
          const brut = (await github.lire(id))?.[FICHIER_STATION];
          const document = brut === undefined ? undefined : lireDocument(brut);
          return document === undefined || "illisible" in document ? undefined : { id, document };
        }),
      );
      const instant = maintenant();
      const trouvee = documents.find((lu) => lu?.document.appairage?.empreinte === cherchee || lu?.document.echus.includes(cherchee) === true);
      if (trouvee === undefined) return { refus: "no station shows this code: check it on the station, it is 8 letters and digits" };
      const { appairage } = trouvee.document;
      nom = trouvee.document.nom;
      if (appairage?.empreinte !== cherchee || Date.parse(appairage.expireLe) <= instant) return { refus: `this code has expired: station ${nom} shows a new one in its log — type that one` };
      await github.ecrire(trouvee.id, { [FICHIER_APPAIRAGE]: `${JSON.stringify({ appaireeLe: new Date(instant).toISOString(), empreinte: cherchee }, null, 2)}\n` });
    } catch (erreur) {
      return { refus: `nothing was paired: GitHub could not be read or written — ${message(erreur)}` };
    }
    // La home la montre tout de suite : une lecture partie avant l'écriture ne la verrait pas.
    await enCours;
    await relire();
    return { appairee: nom };
  };

  void relire();
  const veille = setInterval(() => void relire(), options.cadenceMs ?? CADENCE_MS);

  return {
    vu: () => vu,
    relire,
    appairer,
    fermer: () => clearInterval(veille),
  };
}
