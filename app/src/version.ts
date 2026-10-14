// La version du runtime et sa mise en service, là où le chef lit la file : ce
// que `faits` en donne (`version`, `miseEnService` — docs/runtime.md, « Les
// faits, pour un programme »), posé à côté du bloc `attend`. Une version en
// attente se lit avec depuis quand et combien de livraisons ne sont pas en
// service. Ce module dit aussi ce que le geste « mettre en service » offre : il
// ne fait d'abord que montrer ce qu'il interromprait — les cooks en vol, ce que
// chacun a déjà dépensé, et le total — devant deux choix distincts : attendre le
// rail calme, ou couper. C'est la confirmation de la ligne de la bande d'alertes
// qui le montre (confirmation.ts) : rien ne part tant que le chef n'a pas pris
// l'un des deux. Chaque choix est un geste du socle (gestes.ts) : une commande du
// runtime, qui part dans le second. C'est le runtime qui lance le geste de box :
// l'app n'a ni `sudo`, ni chemin vers lui.
// Une mise en service qui a échoué se lit là aussi : l'entrée `version` du bloc
// `attend` la dit (docs/runtime.md, « Une mise en service qui échoue »), et ce
// module en prend la phrase et les dernières lignes du geste, mot pour mot —
// c'est, avec le numéro en tête d'une ligne (attend.ts), la seule chose lue
// dans le bloc. Ce module ne lance rien et n'écrit dans aucun terminal.
import type { BlocLu, Faits } from "./faits.ts";

// Les deux champs, tels que le runtime les fige (runtime/src/etat.ts, `Faits`).
// `enAttente`, `livraisons` : nuls hors d'une version en attente ; `raison` :
// nulle hors d'une version non comparée.
export type Version = { etat: string; depuis: string; branche: string | null; enService: string; enAttente: string | null; livraisons: number | null; raison: string | null };
// `ticket` : nul pour un jugement du manager. `tokens` : nul tant qu'aucun relevé n'en dit rien.
export type EnVol = { ticket: number | null; run: string; station: string | null; tokens: number | null };
// `tokens` : ce que les cooks en vol ont déjà dépensé en tout, compté par la box.
export type MiseEnService = { etat: string; depuis: string | null; coupe: boolean; enVol: EnVol[]; tokens: number };

// Les trois gestes du socle (gestes.ts), par leur nom : demander, couper, renoncer.
export const DEMANDER = "mise-en-service";
export const COUPER = "mise-en-service-couper";
export const ANNULER = "mise-en-service-annuler";

// docs/runtime.md, « Mettre en service » : ce qu'est le geste, mot pour mot.
export const AVERTISSEMENT = "A deploy is a real restart: cooks in flight die with the runtime, and their tickets start over from zero.";

// Un geste offert : son nom dans le socle, ce que son bouton dit, et ce qu'il engage.
export type Offert = { id: string; libelle: string; dit: string };
// Ce que la vue pose de la version d'un projet, prêt à poser : elle n'y calcule rien.
// `ton` : la couleur du mot d'état — absente, le mot n'est pas de la liste fermée.
// `faits` : ce que la box dit de la version ; `exact`, la valeur se recopie — un commit, une branche.
// `lignes` : ce qui s'en dit dessous.
// `demande` : la mise en service demandée, son mot d'état et où elle en est.
// `enVol` : les cooks en vol à la lecture — posés avec une demande, et avant d'en faire une.
// Un cook sans `ticket` : un jugement du manager.
// `echec` : ce que le dernier geste de box a donné, d'après le bloc `attend` lu à `a`.
// `suite` : ce qui s'en dit quand le geste se redemande là — absente, il n'est pas offert.
// `mettre` : le geste « mettre en service » — il ne fait que montrer `enVol` et ses deux `choix`.
// `gestes` : ceux d'une demande qui vit — ne plus attendre, y renoncer.
export type Vu = {
  etat: string;
  ton?: string;
  faits: { libelle: string; valeur: string; exact?: true }[];
  lignes: string[];
  demande?: { etat: string; ton?: string; dit: string };
  enVol?: { titre: string; cooks: { ticket?: string; titre: string; station: string; tokens: string }[] };
  echec?: { dit: string; fin: string[]; suite?: string; a: string };
  mettre?: { libelle: string; avertissement: string; choix: [Offert, Offert]; renoncer: string };
  gestes: Offert[];
};

// Les deux listes fermées de la forme (docs/runtime.md, « L'état de la version »,
// « L'état de la mise en service »), et la couleur de chaque mot.
const EN_ATTENTE = "en attente";
const TONS_DE_VERSION = new Map([
  ["à jour", "vert"],
  [EN_ATTENTE, "jaune"],
  ["non comparée", "gris"],
]);
const AUCUNE = "aucune";
const DEMANDEE = "demandée";
const LANCEE = "lancée";
const TONS_DE_DEMANDE = new Map([
  [DEMANDEE, "jaune"],
  [LANCEE, "bleu"],
]);

const PAS_LUE = "not read";
const VERSION_PAS_LUE = "this box's runtime does not yet give its version in `faits`. This is not “up to date”";
const RIEN_DE_COMPARE = "nothing compared";
const PAS_COMPAREE = "the running runtime has compared nothing with its origin: it has just started, or is not running a version put in place by the switch. This is not “up to date”";
const A_JOUR = "nothing is waiting to be deployed";
const NON_COMPAREE = "nothing says the version in service is up to date; the runtime resumes the comparison by itself";
const DEMANDE_PAS_LUE = "deploy: not offered — this box's runtime does not yet say in `faits` what is requested, nor what is in flight. This is not “no cook in flight”";
const APRES_ECHEC = "The version is still waiting. Once what the action says is cleared, it can be requested again in the alert band, with “deploy”.";

const court = (commit: string) => commit.slice(0, 12);
const nombre = (valeur: number) => valeur.toLocaleString("fr-FR");
const s = (combien: number) => (combien > 1 ? "s" : "");

// Deux espaces, `version`, deux espaces : la tête qu'écrit `status` pour la
// version, qui n'est à aucun ticket (runtime/src/attend.ts, `nommer`). Ce qui
// précise l'entrée la suit, plus en retrait qu'elle : six espaces.
const TETE_DE_VERSION = /^ {2}version {2}(.*)$/;
const RETRAIT_DE_SUITE = /^ {6}(.*)$/;

// L'entrée `version` du bloc : sa ligne, sans sa tête, et les lignes qui la
// précisent, sans leur retrait. Rien quand le bloc n'en a pas.
export function entreeDeVersion(bloc: string): { ligne: string; suite: string[] } | undefined {
  const lignes = bloc.split("\n");
  const rang = lignes.findIndex((ligne) => TETE_DE_VERSION.test(ligne));
  const [, ligne] = TETE_DE_VERSION.exec(lignes[rang] ?? "") ?? [];
  if (ligne === undefined) return undefined;
  const suite: string[] = [];
  for (const suivante of lignes.slice(rang + 1)) {
    const [, precise] = RETRAIT_DE_SUITE.exec(suivante) ?? [];
    if (precise === undefined) break;
    suite.push(precise);
  }
  return { ligne, suite };
}

// Ce par quoi la ligne dit ce que le dernier geste de box a donné, quand il n'a
// pas mis sa version en service (runtime/src/dire-mise-en-service.ts,
// `direIssue`) : il a échoué, ou il a rendu la main sans rien redémarrer.
const ISSUES = ["MISE EN SERVICE ÉCHOUÉE", "la mise en service lancée le "];
// Et ce par quoi elle finit : le geste à refaire, dit pour un terminal. Ici, il se
// refait d'un bouton — la fin de la phrase n'est pas reprise.
const A_REFAIRE = "à redemander : `";
const TIRET = " — ";

// Ce que le bloc dit du dernier geste de box : sa phrase — la version refusée,
// le motif, la version revenue —, mot pour mot, et les dernières lignes du
// geste. Rien quand l'entrée `version` ne dit aucun échec. Une phrase qui ne
// finit pas comme le runtime l'écrit est rendue entière.
export function echecDe(bloc: string): { dit: string; fin: string[] } | undefined {
  const entree = entreeDeVersion(bloc);
  if (entree === undefined) return undefined;
  const debuts = ISSUES.map((issue) => entree.ligne.indexOf(`${TIRET}${issue}`)).filter((debut) => debut !== -1);
  if (debuts.length === 0) return undefined;
  const dit = entree.ligne.slice(Math.min(...debuts) + TIRET.length);
  const refaire = dit.lastIndexOf(A_REFAIRE);
  const coupe = refaire === -1 ? -1 : dit.lastIndexOf(TIRET, refaire);
  return { dit: coupe === -1 ? dit : dit.slice(0, coupe), fin: entree.suite };
}

// Ce que `faits` dit de la version, un fait par ligne. Un champ nul n'est pas posé.
function faitsDe(version: Version, depuis: (instant: string) => string): Vu["faits"] {
  const attend = version.etat === EN_ATTENTE;
  return [
    ...(version.enAttente === null ? [] : [{ libelle: "awaiting", valeur: `${version.branche ?? "its origin"} (${court(version.enAttente)})`, exact: true as const }]),
    { libelle: "in service", valeur: court(version.enService), exact: true as const },
    ...(attend || version.branche === null ? [] : [{ libelle: "compared with", valeur: version.branche, exact: true as const }]),
    // En attente : depuis l'heure de la plus ancienne livraison qui n'est pas en service.
    { libelle: attend ? "behind for" : "for", valeur: depuis(version.depuis) },
    ...(version.livraisons === null ? [] : [{ libelle: `deliver${version.livraisons > 1 ? "ies" : "y"} not in service`, valeur: String(version.livraisons) }]),
  ];
}

// Les cooks en vol, le plus ancien d'abord, sous leur total. Le titre d'un
// ticket est celui du rail : vide s'il n'y est pas. Une confirmation les montre
// aussi, avant d'arrêter la cuisine (confirmation.ts).
export function enVolDe({ enVol, tokens }: MiseEnService, titres: ReadonlyMap<number, string>): NonNullable<Vu["enVol"]> {
  const sansReleve = enVol.filter((cook) => cook.tokens === null).length;
  return {
    titre: enVol.length === 0 ? "no cook in flight — the rail is quiet" : `${enVol.length} cook${s(enVol.length)} in flight — ${nombre(tokens)} tokens already spent in all${sansReleve === 0 ? "" : `, ${sansReleve} not yet measured`}`,
    cooks: enVol.map((cook) => ({
      ...(cook.ticket === null ? {} : { ticket: `#${cook.ticket}` }),
      titre: cook.ticket === null ? "a manager judgement" : (titres.get(cook.ticket) ?? ""),
      station: cook.station ?? "unknown station",
      tokens: cook.tokens === null ? "tokens: not measured yet" : `${nombre(cook.tokens)} tokens already spent`,
    })),
  };
}

// Les deux manières de mettre en service, et ce que chacune engage à cette lecture.
function choixDe({ enVol, tokens }: MiseEnService): [Offert, Offert] {
  return [
    { id: DEMANDER, libelle: "wait for a quiet rail", dit: "no cook is interrupted: those in flight finish, no other goes, and the runtime launches the box action as soon as none is in flight" },
    {
      id: COUPER,
      libelle: "cut without waiting",
      dit:
        enVol.length === 0
          ? "the box action goes without waiting for a quiet rail — at this reading, no cook is in flight"
          : `the box action goes without waiting: ${enVol.length} cook${s(enVol.length)} in flight interrupted by the restart, ${nombre(tokens)} tokens already spent`,
    },
  ];
}

const RENONCER: Offert = { id: ANNULER, libelle: "withdraw the request", dit: "nothing was launched, no cook is interrupted, and the kitchen takes its tickets again" };

// Où en est la demande, et les gestes qui lui restent. Un mot d'état inconnu
// s'affiche tel quel, sans couleur ni geste.
function demandeDe(mise: MiseEnService, depuis: (instant: string) => string): { demande: NonNullable<Vu["demande"]>; gestes: Offert[] } {
  const ton = TONS_DE_DEMANDE.get(mise.etat);
  const quand = mise.depuis === null ? "" : `for ${depuis(mise.depuis)}`;
  const dire = (dit: string): NonNullable<Vu["demande"]> => ({ etat: mise.etat, ...(ton === undefined ? {} : { ton }), dit: [quand, dit].filter((mot) => mot !== "").join(" — ") });
  if (mise.etat === LANCEE) return { demande: dire("the box action has gone, and cannot be recalled: the runtime is about to restart, no cook goes any more"), gestes: [] };
  if (mise.etat !== DEMANDEE) return { demande: dire(""), gestes: [] };
  if (mise.coupe) return { demande: dire("without waiting for a quiet rail: the box action goes at the runtime's next wake-up"), gestes: [RENONCER] };
  if (mise.enVol.length === 0) return { demande: dire("the rail is quiet: the box action goes at the runtime's next wake-up"), gestes: [RENONCER] };
  return { demande: dire("it is waiting for a quiet rail: no cook is interrupted, no other goes, and the box action goes by itself as soon as none is in flight"), gestes: [choixDe(mise)[1], RENONCER] };
}

// La version d'un projet, telle que la vue la pose. `attend` : le dernier bloc
// `attend` pris pour lui — l'échec du dernier geste n'est dit que là. `depuis` :
// une durée jusqu'à l'heure de la lecture des faits.
// Le geste « mettre en service » n'est offert que sur une version que la box dit
// en attente, sans demande : le runtime refuserait les autres.
export function voir({ version, miseEnService, rail }: Pick<Faits, "version" | "miseEnService" | "rail">, attend: BlocLu | undefined, depuis: (instant: string) => string): Vu {
  const dit = attend === undefined ? undefined : echecDe(attend.bloc);
  const lu = dit === undefined || attend === undefined ? undefined : { ...dit, a: attend.a };
  const echec = lu === undefined ? {} : { echec: lu };
  if (version === undefined) return { etat: PAS_LUE, faits: [], lignes: [VERSION_PAS_LUE], ...echec, gestes: [] };
  if (version === null) return { etat: RIEN_DE_COMPARE, faits: [], lignes: [PAS_COMPAREE], ...echec, gestes: [] };
  const ton = TONS_DE_VERSION.get(version.etat);
  const attendUneVersion = version.etat === EN_ATTENTE;
  const commun = {
    etat: version.etat,
    ...(ton === undefined ? {} : { ton }),
    faits: faitsDe(version, depuis),
    lignes: [...(version.raison === null ? [] : [`${version.raison} — ${NON_COMPAREE}`]), ...(version.etat === "à jour" ? [A_JOUR] : [])],
  };
  if (miseEnService === undefined) return { ...commun, lignes: [...commun.lignes, ...(attendUneVersion ? [DEMANDE_PAS_LUE] : [])], ...echec, gestes: [] };
  const enVol = enVolDe(miseEnService, new Map(rail.map(({ ticket, titre }) => [ticket, titre])));
  if (miseEnService.etat !== AUCUNE) return { ...commun, ...demandeDe(miseEnService, depuis), enVol, ...echec };
  if (!attendUneVersion) return { ...commun, ...echec, gestes: [] };
  return { ...commun, enVol, ...(lu === undefined ? {} : { echec: { ...lu, suite: APRES_ECHEC } }), mettre: { libelle: "deploy…", avertissement: AVERTISSEMENT, choix: choixDe(miseEnService), renoncer: "request nothing" }, gestes: [] };
}
