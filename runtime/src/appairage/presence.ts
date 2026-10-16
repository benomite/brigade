// La présence de la station sur GitHub, et son appairage à l'app du chef.
//
// À son premier démarrage, la station crée son gist (`document.ts`), y publie
// l'empreinte d'un code neuf, et affiche ce code dans son journal de service :
// le chef le tape dans l'app, qui écrit l'appairage dans le même gist. La
// station l'y lit à son signe de vie suivant, et n'affiche plus de code. Un
// code échu en tire un autre, tant qu'elle n'est pas appairée.
//
// Ensuite, chaque minute, elle regarde si son état — version, projets servis,
// pannes, code — a changé depuis sa dernière écriture, sans appeler GitHub ; elle
// n'écrit que sur changement, ou en battement de vie toutes les cinq minutes.
// Deux écritures, forcées (`publier()`) ou non, sont toujours distantes d'au
// moins une minute. Arrêtée proprement, elle écrit l'heure de son arrêt : l'app
// la dit hors ligne dès sa lecture suivante. Éteinte d'un coup, c'est son signe
// de vie qui vieillit, et l'app le voit.
//
// Ce qu'elle garde d'une fois sur l'autre — son gist, son code, son appairage —
// est dans `<BRIGADE_STATION_DIR>/appairage.json`. Un gist supprimé sur GitHub
// la remet à zéro : un gist neuf, un code neuf, un appairage à refaire.
import { readFileSync, writeFileSync } from "node:fs";
import { hostname, release, type } from "node:os";
import { join } from "node:path";
import { empreinteDuCode } from "../code.ts";
import type { Canal } from "./canal.ts";
import { description, DUREE_DU_CODE_MS, ECHUS_GARDES, empreinte, FICHIER_APPAIRAGE, FICHIER_STATION, FORMAT, tirerCode, type DocumentStation, type EtatsPublies } from "./document.ts";

export const FICHIER_LOCAL = "appairage.json";
// Entre deux regards sur son état : aucun appel GitHub, une comparaison.
export const REGARD_MS = 60_000;
// Sans changement, elle écrit quand même à cette fréquence : son signe de vie.
export const BATTEMENT_MS = 300_000;
// Deux écritures dans le gist, quelle qu'en soit la cause, ne se rapprochent pas plus.
export const ECART_MINIMAL_MS = 60_000;
// Ce que l'app lit : elle dit la station hors ligne après 2 × cadenceMs + 30 s,
// et la détection d'un arrêt brutal doit tenir en 10 min au plus. Un battement
// de 5 min tient dans cette fenêtre : 2 × 285 s + 30 s = 600 s.
export const CADENCE_MS = 285_000;

export type Identite = { nom: string; machine: string; version: string };

export type OptionsPresence = {
  // Le répertoire de la station (`BRIGADE_STATION_DIR`).
  racine: string;
  canal: Canal;
  identite: Identite;
  // Les projets que la station sert, à cet instant.
  projets: () => string[];
  // Sa mise à jour et sa connexion Max, à cet instant : ce que l'app dit en
  // panne. Absent, elle n'en publie rien.
  etats?: () => EtatsPublies;
  // Une ligne du journal de service.
  dire: (ligne: string) => void;
  // Un minuteur : appelle `tache` dans `ms`, rend de quoi l'annuler. Sans
  // `retient`, il ne garde pas le process en vie. Les tests y mettent une
  // horloge simulée.
  apres?: (tache: () => void, ms: number, retient?: boolean) => () => void;
  dureeDuCodeMs?: number;
  maintenant?: () => number;
  tirer?: (borne: number) => number;
};

export type Presence = {
  // Un signe de vie, dès que l'écart minimal avec la dernière écriture le
  // permet — il est alors écrit sans que cet appel l'attende.
  publier(): Promise<void>;
  // Le code à taper dans l'app ; null une fois la station appairée, ou tant
  // que son gist n'est pas créé.
  code(): string | null;
  // Plus de signe de vie : la station écrit l'heure de son arrêt.
  arreter(): Promise<void>;
};

type EtatLocal = { gist: string | null; appairee: boolean; code: string | null; expireLe: string | null; echus: string[] };

const AUCUN_ETAT: EtatsPublies = { miseAJour: null, connexionMax: null };

const VIERGE: EtatLocal = { gist: null, appairee: false, code: null, expireLe: null, echus: [] };

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const heure = (instant: number) => new Date(instant).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

// Ce que la station dit d'elle : son nom, celui de sa machine — ou celui que
// sa configuration lui donne —, ce qu'est la machine, et sa version.
export function identiteDeLaStation(env: Record<string, string | undefined>): Identite {
  const nom = env.BRIGADE_STATION_NOM || hostname().split(".")[0]?.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "station";
  const systeme = type() === "Darwin" ? "macOS" : type() === "Windows_NT" ? "Windows" : type();
  return { nom, machine: `${systeme} ${release()}`, version: env.BRIGADE_STATION_VERSION || `code ${empreinteDuCode().slice(0, 12)}` };
}

// Lit l'état gardé. Illisible, la station repart de zéro : un gist neuf, un
// code neuf — rien de pire qu'un appairage à refaire.
function lireEtat(fichier: string): EtatLocal {
  try {
    const lu = JSON.parse(readFileSync(fichier, "utf8")) as Partial<EtatLocal>;
    return {
      gist: typeof lu.gist === "string" && lu.gist !== "" ? lu.gist : null,
      appairee: lu.appairee === true,
      code: typeof lu.code === "string" ? lu.code : null,
      expireLe: typeof lu.expireLe === "string" ? lu.expireLe : null,
      echus: Array.isArray(lu.echus) ? lu.echus.filter((echu): echu is string => typeof echu === "string") : [],
    };
  } catch {
    return { ...VIERGE };
  }
}

// Le code que la station affiche à cet instant, tel qu'elle le garde : pour
// qui l'affiche hors de son journal (l'installation). Null une fois appairée.
export function codeAffiche(racine: string): string | null {
  const etat = lireEtat(join(racine, FICHIER_LOCAL));
  return etat.appairee || etat.gist === null ? null : etat.code;
}

export function tenirPresence(options: OptionsPresence): Presence {
  const { canal, identite, dire } = options;
  const apres = options.apres ?? ((tache: () => void, ms: number, retient = true) => {
    const minuteur = setTimeout(tache, ms);
    if (!retient) minuteur.unref();
    return () => clearTimeout(minuteur);
  });
  const dureeDuCodeMs = options.dureeDuCodeMs ?? DUREE_DU_CODE_MS;
  const maintenant = options.maintenant ?? Date.now;
  const fichier = join(options.racine, FICHIER_LOCAL);
  let etat = lireEtat(fichier);
  // Le code déjà dit au journal : chacun ne l'est qu'une fois par démarrage.
  let annonce: string | null = null;
  // La dernière panne dite : la même ne se répète pas à chaque minute.
  let panne: string | null = null;
  let arretee = false;
  // Le contenu de la dernière écriture réussie (sans ses heures), l'instant de
  // la dernière tentative, et un signe de vie demandé que l'écart a retenu.
  let publie: string | null = null;
  let dernierEcrit = Number.NEGATIVE_INFINITY;
  let demandee = false;
  let reportee: (() => void) | null = null;
  let regard: (() => void) | null = null;

  // Une lecture qui lève ne prive pas la station de son signe de vie.
  const etatsPublies = (): EtatsPublies => {
    try {
      return options.etats?.() ?? AUCUN_ETAT;
    } catch {
      return AUCUN_ETAT;
    }
  };

  const sauver = () => writeFileSync(fichier, `${JSON.stringify(etat, null, 2)}\n`, { mode: 0o600 });

  const renouvelerCode = (instant: number) => {
    if (etat.appairee || (etat.code !== null && etat.expireLe !== null && Date.parse(etat.expireLe) > instant)) return;
    const echus = etat.code === null ? etat.echus : [empreinte(etat.code), ...etat.echus];
    etat = { ...etat, code: tirerCode(options.tirer), expireLe: new Date(instant + dureeDuCodeMs).toISOString(), echus: echus.slice(0, ECHUS_GARDES) };
    sauver();
  };

  const document = (instant: number, arret: boolean): DocumentStation => ({
    brigade: "station",
    format: FORMAT,
    ...identite,
    projets: options.projets(),
    signeDeVie: new Date(instant).toISOString(),
    cadenceMs: CADENCE_MS,
    arreteeLe: arret ? new Date(instant).toISOString() : null,
    appairage: etat.appairee || etat.code === null || etat.expireLe === null ? null : { empreinte: empreinte(etat.code), expireLe: etat.expireLe },
    echus: etat.appairee ? [] : etat.echus,
    ...etatsPublies(),
  });
  // Ce qui s'écrit, et ce par quoi on reconnaît qu'il a changé : le document
  // sans ses heures, qui bougent à chaque écriture.
  const preparer = (instant: number, arret: boolean) => {
    const doc = document(instant, arret);
    return { cle: JSON.stringify({ ...doc, signeDeVie: null, arreteeLe: arret }), fichiers: { [FICHIER_STATION]: `${JSON.stringify(doc, null, 2)}\n` } };
  };

  const repartirDeZero = (pourquoi: string) => {
    etat = { ...VIERGE };
    annonce = null;
    sauver();
    dire(`brigade : station — ${pourquoi} : elle en crée un autre, et se fait appairer de nouveau`);
  };

  // L'appairage que l'app a écrit dans le gist, pour un code que la station a tiré.
  const lireAppairage = async (gist: string) => {
    const lus = await canal.lire(gist);
    if (lus === null) return repartirDeZero("son gist a disparu de GitHub");
    const brut = lus[FICHIER_APPAIRAGE];
    if (brut === undefined) return;
    let ecrit: { appaireeLe?: unknown; empreinte?: unknown };
    try {
      ecrit = JSON.parse(brut) as typeof ecrit;
    } catch {
      return;
    }
    const tires = [...(etat.code === null ? [] : [empreinte(etat.code)]), ...etat.echus];
    if (typeof ecrit.empreinte !== "string" || !tires.includes(ecrit.empreinte)) return;
    etat = { ...etat, appairee: true, code: null, expireLe: null, echus: [] };
    sauver();
    const le = typeof ecrit.appaireeLe === "string" && !Number.isNaN(Date.parse(ecrit.appaireeLe)) ? ` à ${heure(Date.parse(ecrit.appaireeLe))}` : "";
    dire(`brigade : station appairée à l'app${le} — elle n'affiche plus de code`);
  };

  const cycle = async (arret: boolean) => {
    let instant = maintenant();
    let appele = false;
    if (etat.gist !== null && !etat.appairee && !arret) {
      await lireAppairage(etat.gist);
      appele = true;
    }
    if (!arret) renouvelerCode(instant);
    // Une station qui s'arrête avant d'avoir publié quoi que ce soit n'a rien à dire.
    if (arret && etat.gist === null) return;
    if (arret) {
      // L'arrêt aussi respecte l'écart : il attend le reste. Il ne retient pas le
      // process : une station qu'on arrête n'attend pas une minute pour le dire,
      // et l'app la dit hors ligne à son signe de vie manqué.
      const reste = dernierEcrit + ECART_MINIMAL_MS - instant;
      if (reste > 0) await new Promise<void>((fin) => apres(fin, reste, false));
      instant = maintenant();
    }
    let ecriture = preparer(instant, arret);
    const ecart = instant - dernierEcrit;
    const aEcrire = arret || demandee || etat.gist === null || ecriture.cle !== publie || ecart >= BATTEMENT_MS;
    if (aEcrire && !arret && ecart < ECART_MINIMAL_MS) {
      // Trop tôt : le regard suivant, ou ce minuteur, l'écrira.
      reportee ??= apres(() => {
        reportee = null;
        void enchainer(false);
      }, ECART_MINIMAL_MS - ecart);
      return;
    }
    if (aEcrire) {
      demandee = false;
      dernierEcrit = instant;
      appele = true;
      if (etat.gist === null) {
        etat = { ...etat, gist: await canal.creer(description(identite.nom), ecriture.fichiers) };
        sauver();
      } else if ((await canal.ecrire(etat.gist, ecriture.fichiers)) === "absent") {
        repartirDeZero("son gist a disparu de GitHub");
        if (arret) return;
        renouvelerCode(instant);
        ecriture = preparer(instant, false);
        etat = { ...etat, gist: await canal.creer(description(identite.nom), ecriture.fichiers) };
        sauver();
      }
      publie = ecriture.cle;
    }
    if (appele && panne !== null) dire("brigade : station — GitHub répond de nouveau : son état y est publié");
    if (appele) panne = null;
    if (aEcrire && !etat.appairee && etat.code !== null && etat.code !== annonce && etat.expireLe !== null) {
      annonce = etat.code;
      dire(`brigade : station à appairer — tape ce code dans l'app : ${etat.code} (valable jusqu'à ${heure(Date.parse(etat.expireLe))})`);
    }
  };

  let fil: Promise<void> = Promise.resolve();
  const enchainer = (arret: boolean) => {
    fil = fil.then(() =>
      cycle(arret).catch((erreur: unknown) => {
        const dit = message(erreur);
        if (dit !== panne) dire(`brigade : station — son état n'est pas publié sur GitHub, elle réessaie à chaque minute : ${dit}`);
        panne = dit;
      }),
    );
    return fil;
  };

  const armer = () => {
    regard = apres(() => {
      void enchainer(false);
      armer();
    }, REGARD_MS);
  };
  void enchainer(false);
  armer();

  return {
    publier() {
      if (arretee) return fil;
      demandee = true;
      return enchainer(false);
    },
    code: () => (etat.appairee || etat.gist === null ? null : etat.code),
    arreter() {
      if (arretee) return fil;
      arretee = true;
      regard?.();
      reportee?.();
      reportee = null;
      return enchainer(true);
    },
  };
}
