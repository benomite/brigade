// Le tableau de la cuisine publié dans le dépôt du projet : une issue « Kitchen
// board », épinglée, dont le corps est le tableau rendu (tableau/rendu/). À
// chaque tick du runtime — une fois par minute —, le tableau se relit du
// journal, et le corps de l'issue se réécrit si ce qu'il dit a changé ; sinon,
// rien ne s'écrit sur GitHub.
//
// L'issue se retrouve par son label et par le marqueur de son bloc machine,
// jamais par un numéro gardé : le numéro n'est qu'un cache du process. Fermée,
// elle se rouvre ; supprimée ou transférée ailleurs, elle se recrée — chaque
// fois en une ligne au journal du service. Elle porte aussi `hors-cuisine` : le
// rail ne la prend pas, et le manager l'écarte sans la juger.
//
// « Ce qu'il dit » : le tableau à l'heure près. L'heure de lecture, les durées
// qui en découlent (« for 4 min ») et le dernier tick du runtime changent à
// chaque minute sans que rien n'ait bougé dans la cuisine : ils ne suffisent
// pas à réécrire le corps.
// Le corps publié reste vrai à l'heure qu'il dit (« read on … »), et les
// instants du bloc machine laissent une app compter les durées jusqu'à la sienne.
//
// Rien n'y poste de commentaire, et le corps ne mentionne personne (rendre.ts) :
// un rafraîchissement ne notifie aucun compte.
import { cartesDeCorrection } from "../../correctif/cartes.ts";
import { lireEtat } from "../../etat.ts";
import { HORS_CUISINE } from "../../github.ts";
import { masquerIdentifiants } from "../../identifiants.ts";
import { appelsDeLaStation, pauseDeLaStation } from "../../limite-github.ts";
import { refusDuProjet } from "../../mise-a-jour/en-service.ts";
import { cartesDeProfil } from "../../profils/cartes.ts";
import type { Runtime } from "../../runtime.ts";
import { lireLeTableau, OUVERTURE_DU_BLOC, type Tableau } from "../rendu/bloc.ts";
import { tableauDeLaCuisine } from "../rendu/donnees.ts";
import type { GestesDuTableau } from "../gestes/gestes.ts";
import type { MentionsDuTableau } from "../mention/mention.ts";
import { rendreLeTableau, TITRE_DU_TABLEAU } from "../rendu/rendre.ts";
import type { ClientDuTableau, IssueDuTableau } from "./client.ts";

// Le label par lequel le tableau se retrouve dans son dépôt.
export const LABEL_DU_TABLEAU = "kitchen-board";
export const LABELS_DU_TABLEAU = [LABEL_DU_TABLEAU, HORS_CUISINE];
// L'épinglage se vérifie au premier rafraîchissement, à chaque issue créée ou
// rouverte, puis à cet intervalle : le chef a pu la désépingler. Un échec se
// retente au même intervalle.
export const VERIFIER_L_EPINGLE_MS = 3_600_000;

// Une durée telle que `status` l'écrit (etat.ts, `dureeEn`) : « 42 s », « 4 min », « 2 h 04 », « 3 d ».
const DUREE = /\b\d+ (?:s|min|h \d{2}|d)\b/g;

// La ligne du tick dans la rubrique « runtime » de `status` (etat.ts, `decrireRuntime`).
const LIGNE_DU_TICK = /^(?:last tick .* ago \(cadence: .*\)|no tick since startup)$/;

// Ce qui part vers GitHub est masqué (identifiants.ts) : le corps se compare tel qu'il y est.
const masquer = (corps: string) => masquerIdentifiants(corps).texte;

// Les rubriques de `status` qui comptent les appels de la box à GitHub (etat.ts) : le compteur est celui de
// la station, tous projets confondus, et le tableau s'y compte lui-même — ses lectures et ses écritures
// le font bouger, d'un projet à l'autre, sans que rien n'ait changé dans la cuisine. Elles ne suffisent
// pas à réécrire le corps ; `status`, lui, les dit toujours.
const RUBRIQUES_DU_COMPTEUR = new Set(["gh calls", "board cost"]);

// Ce que dit un corps écrit par la box, à l'heure près : son tableau, sans
// l'heure de sa lecture ni les durées. Null pour un corps qui n'est pas le
// rendu fidèle de son bloc — retouché à la main, ou d'un autre rendu : il est
// à réécrire.
export function contenuDuCorps(corps: string): string | null {
  const lu = lireLeTableau(corps);
  if (!lu.lu || masquer(rendreLeTableau(lu.tableau, new Date(lu.genereLe))) !== corps) return null;
  const { tableau } = lu;
  // Le dernier tick du runtime bat chaque minute : il dit que la box vit, pas que
  // la cuisine a bougé — ni dans le bloc, ni dans la ligne de `status` qui le dit.
  const rubriques = tableau.cuisine.rubriques.map((rubrique) => (rubrique.titre === "runtime" ? { ...rubrique, lignes: rubrique.lignes.map((ligne) => ligne.replace(LIGNE_DU_TICK, "…")) } : RUBRIQUES_DU_COMPTEUR.has(rubrique.titre) ? { ...rubrique, lignes: [] } : rubrique));
  const cuisine = { ...tableau.cuisine, runtime: { ...tableau.cuisine.runtime, dernierTick: null }, rubriques };
  // Les faits portent aussi l'heure de leur lecture, ce dernier tick, et le
  // dernier événement du journal : un événement qui ne change rien d'autre
  // (un garde-fou réglé, une station réannoncée) ne réécrit pas le corps — le
  // prochain changement publie le dernier du moment.
  const faits = tableau.faits === undefined ? {} : { faits: { ...tableau.faits, lu: "", dernierTick: null, dernierEvenement: null } };
  return JSON.stringify({ ...tableau, lu: "", cuisine, ...faits }).replace(DUREE, "…");
}

// Ce qu'un rafraîchissement a fait sur GitHub, dans l'ordre.
export type Geste = "cree" | "recree" | "rouvert" | "ecrit" | "epingle";
export type Rafraichissement = { numero: number; gestes: Geste[] };

export type OptionsPublication = {
  client: ClientDuTableau;
  // `<owner>/<repo>`, pour le dire.
  depot: string;
  // Le tableau de la cuisine, lu à cet instant.
  lire: (maintenant: Date) => Tableau;
  // Une ligne au journal du service : l'issue créée, rouverte, recréée.
  dire?: (ligne: string) => void;
  // Ce qui n'a pas pu se faire sans empêcher le reste : l'épinglage refusé.
  avertir?: (ligne: string) => void;
};

export type Publication = { rafraichir(maintenant: Date): Promise<Rafraichissement> };

// Parmi les issues qui portent le label — que seul qui a la main sur le dépôt
// pose —, celles que la box a écrites : leur bloc, ou à défaut leur titre, s'il
// a été retouché à la main.
const estUnTableau = (issue: IssueDuTableau) => issue.corps.includes(OUVERTURE_DU_BLOC) || issue.titre === TITRE_DU_TABLEAU;

export function publierLeTableau(options: OptionsPublication): Publication {
  const { client, depot, lire } = options;
  const dire = options.dire ?? ((ligne: string) => console.log(ligne));
  const avertir = options.avertir ?? ((ligne: string) => console.error(ligne));
  // Le tableau trouvé ou créé par ce process. Cache, pas état : le perdre coûte une recherche.
  let numero: number | null = null;
  // Le tableau que ce process connaissait, et qui n'est plus dans le dépôt.
  let disparu: number | null = null;
  // Le dernier contrôle de l'épinglage, en millisecondes — réussi ou non.
  let epingleVuLe: number | null = null;

  // Le tableau du dépôt : celui de ce process s'il y est encore, sinon celui que
  // le label et le marqueur désignent — un ouvert d'abord, le plus ancien.
  const retrouver = async (): Promise<IssueDuTableau | null> => {
    if (numero !== null) {
      const connu = await client.issue(numero);
      if (connu !== null) return connu;
      disparu = numero;
      numero = null;
    }
    const trouves = (await client.auLabel(LABEL_DU_TABLEAU)).filter(estUnTableau);
    trouves.sort((a, b) => Number(b.ouverte) - Number(a.ouverte) || a.numero - b.numero);
    return trouves[0] ?? null;
  };

  const epingler = async (cible: number, maintenant: Date, gestes: Geste[]) => {
    if (epingleVuLe !== null && maintenant.getTime() - epingleVuLe < VERIFIER_L_EPINGLE_MS) return;
    epingleVuLe = maintenant.getTime();
    try {
      if (await client.epingler(cible)) gestes.push("epingle");
    } catch (erreur) {
      avertir(`brigade : Kitchen board #${cible} de ${depot} non épinglé, réessayé dans une heure — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  };

  return {
    async rafraichir(maintenant) {
      const corps = masquer(rendreLeTableau(lire(maintenant), maintenant));
      const gestes: Geste[] = [];
      const trouve = await retrouver();
      if (trouve === null) {
        const cree = await client.creer({ titre: TITRE_DU_TABLEAU, corps, labels: LABELS_DU_TABLEAU });
        dire(disparu === null ? `brigade : Kitchen board créé dans ${depot} — #${cree}` : `brigade : Kitchen board #${disparu} disparu de ${depot} — recréé en #${cree}`);
        gestes.push(disparu === null ? "cree" : "recree");
        numero = cree;
        disparu = null;
        epingleVuLe = null;
        await epingler(cree, maintenant, gestes);
        return { numero: cree, gestes };
      }
      numero = trouve.numero;
      disparu = null;
      if (!trouve.ouverte) {
        await client.rouvrir(trouve.numero);
        dire(`brigade : Kitchen board #${trouve.numero} de ${depot} fermé — rouvert`);
        gestes.push("rouvert");
        epingleVuLe = null;
      }
      const contenu = contenuDuCorps(corps);
      if (contenu === null || contenuDuCorps(trouve.corps) !== contenu) {
        await client.ecrireCorps(trouve.numero, corps);
        gestes.push("ecrit");
      }
      await epingler(trouve.numero, maintenant, gestes);
      return { numero: trouve.numero, gestes };
    },
  };
}

export type OptionsDuBranchement = Omit<OptionsPublication, "lire"> & {
  lire?: (maintenant: Date) => Tableau;
  maintenant?: () => Date;
  // Le répertoire de la station, dont `status` lit la pause et les appels à GitHub.
  station?: string;
  // Les gestes du chef postés sous le tableau (tableau/gestes/) : lus après
  // chaque rafraîchissement, et portés par le bloc machine.
  gestes?: GestesDuTableau;
  // La mention du chef sous le tableau (tableau/mention/), pour chaque décision
  // qui entre dans sa file : après chaque rafraîchissement, jamais à sa place.
  mentions?: MentionsDuTableau;
};

// Branche le tableau au runtime : un rafraîchissement d'emblée, puis à chaque
// tick. Un rafraîchissement ne part pas tant que le précédent n'a pas fini, et
// ce qui l'arrête — GitHub injoignable, son quota retenu — se dit une fois,
// jusqu'à ce qu'il passe ou qu'autre chose l'arrête : il se retente au tick suivant.
// Après lui, les gestes du chef se lisent sous le tableau qu'il a trouvé ; un
// geste lu le rafraîchit aussitôt, pour que le bloc dise son état.
export function brancherLeTableau<R extends Runtime>(runtime: R, options: OptionsDuBranchement): R {
  const maintenant = options.maintenant ?? (() => new Date());
  const { station } = options;
  const { gestes, mentions } = options;
  // Le tableau lu par défaut : l'état du journal, comme `status` le lit, et les
  // faits comme `facts` les rend — l'adresse des issues par le dépôt du tableau,
  // le refus de la station de cette machine, les corrections et les profils proposés.
  const lire =
    options.lire ??
    ((instant: Date) => {
      const tableau = tableauDeLaCuisine(lireEtat(runtime.journal, instant), instant, {
        limiteGithub: pauseDeLaStation(station, instant.getTime()),
        appels: appelsDeLaStation(station, instant.getTime()),
        depot: options.depot,
        refus: refusDuProjet(station, runtime.projet),
        corrections: cartesDeCorrection(runtime.journal, options.depot),
        profils: cartesDeProfil(runtime.journal, options.depot),
      });
      return gestes === undefined ? tableau : { ...tableau, gestes: gestes.lus() };
    });
  const avertir = options.avertir ?? ((ligne: string) => console.error(ligne));
  const publication = publierLeTableau({ ...options, lire, avertir });
  let enCours = false;
  let dernierEchec: string | null = null;
  let dernierEchecDesGestes: string | null = null;
  let dernierEchecDesMentions: string | null = null;
  const passer = async () => {
    if (enCours) return;
    enCours = true;
    try {
      const { numero } = await publication.rafraichir(maintenant());
      dernierEchec = null;
      if (gestes !== undefined) await lireLesGestes(numero);
      if (mentions !== undefined) await mentionnerLeChef(numero);
    } catch (erreur) {
      const motif = erreur instanceof Error ? erreur.message : String(erreur);
      if (motif !== dernierEchec) avertir(`brigade : Kitchen board de ${options.depot} non rafraîchi — ${motif}`);
      dernierEchec = motif;
    } finally {
      enCours = false;
    }
  };
  // Ce qui arrête la lecture des gestes se dit à part, une fois : le tableau,
  // lui, reste rafraîchi.
  const lireLesGestes = async (numero: number) => {
    let lu: boolean;
    try {
      lu = (await gestes?.traiter(numero)) === true;
      dernierEchecDesGestes = null;
    } catch (erreur) {
      const motif = erreur instanceof Error ? erreur.message : String(erreur);
      if (motif !== dernierEchecDesGestes) avertir(`brigade : gestes du Kitchen board de ${options.depot} non lus — ${motif}`);
      dernierEchecDesGestes = motif;
      return;
    }
    if (lu) await publication.rafraichir(maintenant());
  };
  // Les décisions entrées dans la file depuis le dernier passage ; ce qui
  // l'arrête se dit une fois, comme pour les gestes.
  const mentionnerLeChef = async (numero: number) => {
    try {
      await mentions?.traiter(numero, lire(maintenant()).file);
      dernierEchecDesMentions = null;
    } catch (erreur) {
      const motif = erreur instanceof Error ? erreur.message : String(erreur);
      if (motif !== dernierEchecDesMentions) avertir(`brigade : chef non mentionné sous le Kitchen board de ${options.depot} — ${motif}`);
      dernierEchecDesMentions = motif;
    }
  };
  void passer();
  runtime.surReveil((cause) => void (cause === "tick" && passer()));
  return runtime;
}
