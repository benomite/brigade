// La présence de la station sur GitHub, et son appairage à l'app du chef.
//
// À son premier démarrage, la station crée son gist (`document.ts`), y publie
// l'empreinte d'un code neuf, et affiche ce code dans son journal de service :
// le chef le tape dans l'app, qui écrit l'appairage dans le même gist. La
// station l'y lit à son signe de vie suivant, et n'affiche plus de code. Un
// code échu en tire un autre, tant qu'elle n'est pas appairée.
//
// Ensuite, elle réécrit son état — version, projets servis, signe de vie —
// seulement quand il change, et assez souvent pour tenir sa cadence (moins de cinq minutes) : c'est ce
// battement qui dit à l'app qu'elle vit, et chaque écriture coûte un appel à la
// limite du compte. Elle regarde à chaque minute si quelque chose a changé ;
// cela ne coûte rien. Si GitHub dit sa limite atteinte, elle se tait jusqu'à
// la fin de la fenêtre. Arrêtée proprement, elle écrit l'heure de son arrêt : l'app la
// dit hors ligne dès sa lecture suivante. Éteinte d'un coup, c'est son signe
// de vie qui vieillit, et l'app le voit.
//
// Ce qu'elle garde d'une fois sur l'autre — son gist, son code, son appairage —
// est dans `<BRIGADE_STATION_DIR>/appairage.json`. Un gist supprimé sur GitHub
// la remet à zéro : un gist neuf, un code neuf, un appairage à refaire.
import { readFileSync, writeFileSync } from "node:fs";
import { hostname, release, type } from "node:os";
import { join } from "node:path";
import { empreinteDuCode } from "../code.ts";
import { LimiteAtteinte } from "../limite-github.ts";
import type { Canal } from "./canal.ts";
import { description, DUREE_DU_CODE_MS, ECHUS_GARDES, empreinte, FICHIER_APPAIRAGE, FICHIER_STATION, FORMAT, tirerCode, type DocumentStation, type EtatsPublies } from "./document.ts";

export const FICHIER_LOCAL = "appairage.json";
// La cadence que la station publie : l'app la dit hors ligne passé
// 2 × cadence + 30 s, soit 570 s (moins de dix minutes) à 270 s. Le battement
// réel (écrire avant que le regard suivant dépasse la cadence) reste dessous.
export const CADENCE_MS = 270_000;
// Entre deux regards sur ce qui a changé.
export const REGARD_MS = 60_000;
const ESPACEMENT_MIN_MS = 60_000;

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
  // Le battement maximal entre deux publications.
  cadenceMs?: number;
  regardMs?: number;
  dureeDuCodeMs?: number;
  maintenant?: () => number;
  tirer?: (borne: number) => number;
};

export type Presence = {
  // Un signe de vie, tout de suite — après celui qui est en cours.
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
  const cadenceMs = options.cadenceMs ?? CADENCE_MS;
  const regardMs = options.regardMs ?? REGARD_MS;
  const dureeDuCodeMs = options.dureeDuCodeMs ?? DUREE_DU_CODE_MS;
  const maintenant = options.maintenant ?? Date.now;
  const fichier = join(options.racine, FICHIER_LOCAL);
  let etat = lireEtat(fichier);
  // Le code déjà dit au journal : chacun ne l'est qu'une fois par démarrage.
  let annonce: string | null = null;
  // La dernière panne dite : la même ne se répète pas à chaque minute.
  let panne: string | null = null;
  let arretee = false;

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
    cadenceMs,
    arreteeLe: arret ? new Date(instant).toISOString() : null,
    appairage: etat.appairee || etat.code === null || etat.expireLe === null ? null : { empreinte: empreinte(etat.code), expireLe: etat.expireLe },
    echus: etat.appairee ? [] : etat.echus,
    ...etatsPublies(),
  });
  const fichiers = (instant: number, arret: boolean) => ({ [FICHIER_STATION]: `${JSON.stringify(document(instant, arret), null, 2)}\n` });
  // Ce qui est publié, hors signe de vie : si cela n'a pas bougé, écrire n'apprend rien à l'app.
  const contenu = (arret: boolean) => JSON.stringify({ ...document(0, arret), signeDeVie: null, arreteeLe: null, arret });
  let publie: { contenu: string; instant: number } | null = null;
  // Un geste demandé trop tôt après la dernière écriture : le regard suivant l'écrit.
  let demandee = false;

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

  // Jamais deux écritures à moins d'une minute l'une de l'autre, geste compris : l'arrêt seul passe.
  const tropTot = (instant: number) => publie !== null && instant - publie.instant < ESPACEMENT_MIN_MS;

  // `force` : un geste demande la publication, changement ou non.
  const cycle = async (arret: boolean, force: boolean) => {
    const instant = maintenant();
    if (etat.gist !== null && !etat.appairee && !arret) await lireAppairage(etat.gist);
    if (!arret) renouvelerCode(instant);
    if (etat.gist === null) {
      // Une station qui s'arrête avant d'avoir publié quoi que ce soit n'a rien à dire.
      if (arret) return;
      etat = { ...etat, gist: await canal.creer(description(identite.nom), fichiers(instant, false)) };
      sauver();
      publie = { contenu: contenu(false), instant };
    } else if (arret || (!tropTot(instant) && (force || demandee || publie === null || contenu(false) !== publie.contenu || instant - publie.instant + regardMs > cadenceMs))) {
      demandee = false;
      const dit = contenu(arret);
      if ((await canal.ecrire(etat.gist, fichiers(instant, arret))) === "absent") {
        repartirDeZero("son gist a disparu de GitHub");
        if (arret) return;
        renouvelerCode(instant);
        etat = { ...etat, gist: await canal.creer(description(identite.nom), fichiers(instant, false)) };
        sauver();
        publie = { contenu: contenu(false), instant };
      } else publie = { contenu: dit, instant };
    }
    if (force && tropTot(instant)) demandee = true;
    if (panne !== null) dire("brigade : station — GitHub répond de nouveau : son état y est publié");
    panne = null;
    if (!etat.appairee && etat.code !== null && etat.code !== annonce && etat.expireLe !== null) {
      annonce = etat.code;
      dire(`brigade : station à appairer — tape ce code dans l'app : ${etat.code} (valable jusqu'à ${heure(Date.parse(etat.expireLe))})`);
    }
  };

  let fil: Promise<void> = Promise.resolve();
  const enchainer = (arret: boolean, force = false) => {
    fil = fil.then(() =>
      cycle(arret, force).catch((erreur: unknown) => {
        const limite = erreur instanceof LimiteAtteinte;
        // Une limite dite par GitHub ne se redit pas à chaque minute : sa reprise est dans le message.
        const dit = limite ? "limite" : message(erreur);
        if (dit !== panne) dire(limite ? `brigade : station — ${message(erreur)} : son état n'est pas publié d'ici là` : `brigade : station — son état n'est pas publié sur GitHub, elle réessaie à chaque minute : ${dit}`);
        panne = dit;
      }),
    );
    return fil;
  };

  void enchainer(false);
  const veille = setInterval(() => void enchainer(false), regardMs);

  return {
    publier: () => (arretee ? fil : enchainer(false, true)),
    code: () => (etat.appairee || etat.gist === null ? null : etat.code),
    arreter() {
      if (arretee) return fil;
      arretee = true;
      clearInterval(veille);
      return enchainer(true);
    },
  };
}
