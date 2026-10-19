// La fermeture qui observe : ce que la branche d'intégration du dépôt cible a
// ajouté et retiré sur ses derniers merges, les doublons et le code mort
// qu'elle porte, et les compteurs de dérive du journal. Elle mesure et
// repère, et ne touche à rien : ni fichier, ni branche, ni PR, ni verrou, ni
// journal — elle peut tourner pendant que les cooks travaillent.
import type { Appel } from "../appel.ts";
import { geste } from "../geste.ts";
import { Sortie } from "../appel.ts";
import { openLog, type Log } from "../log.ts";
import { logNotReplayed } from "../log-not-replayed.ts";
import { direJaugeEn, franchis, SANS_SEUIL } from "../measures.ts";
import { mergedDeliveries, seuilsEnVigueur } from "../projections/measures.ts";
import { ConfigInvalide } from "../runtime.ts";
import { MODULE, repererCodeMort, type Mort } from "./dead-code.ts";
import { direBilan } from "./report.ts";
import { queuedRequest, refus, reglagesEnVigueur } from "./condition.ts";
import { colonnes, direDemandeEn, direFinEn, direRefusEn, ligne, pluriel } from "./say.ts";
import { CODE, LIGNES_MIN, repererDoublons, type Doublon } from "./duplicates.ts";
import { arbreDe, DepotIllisible, lireDepot, TAILLE_MAX, type Depot } from "./reading.ts";
import { direRatio, mesurerRatio, type Fenetre } from "./ratio.ts";

const USAGE = [
  "usage: BRIGADE_REPO_DIR=<project clone> BRIGADE_BASE_BRANCH=<integration branch> npm --prefix runtime run closing",
  "        BRIGADE_STATE_DIR=<state directory> npm --prefix runtime run closing -- write     the pass that writes",
].join("\n");

// `fichiers`, `modules` : parmi combien de fichiers les doublons et le code
// mort ont été cherchés.
export type Observation = {
  ref: string;
  sha: string;
  dernierMerge: string | null;
  fenetres: Fenetre[];
  doublons: Doublon[];
  fichiers: number;
  morts: Mort[];
  modules: number;
  ecartes: number;
};

export function observer({ ref, sha, merges, textes, ecartes }: Depot): Observation {
  const parmi = (motif: RegExp) => textes.filter(({ chemin }) => motif.test(chemin)).length;
  return {
    ref,
    sha,
    dernierMerge: merges[0]?.at ?? null,
    fenetres: mesurerRatio(merges),
    doublons: repererDoublons(textes),
    fichiers: parmi(CODE),
    morts: repererCodeMort(textes),
    modules: parmi(MODULE),
    ecartes,
  };
}

const dire = (valeur: number, decimales = 0) => valeur.toLocaleString("en-US", { maximumFractionDigits: decimales });

// L'observation, ligne par ligne.
export function decrire({ ref, sha, dernierMerge, fenetres, doublons, fichiers, morts, modules, ecartes }: Observation): string[] {
  const total = fenetres.reduce((plus, { merges }) => Math.max(plus, merges), 0);
  return [
    ligne("closing", `observation of ${ref} (${sha.slice(0, 7)}, ${dernierMerge === null ? "no merge" : `last merge on ${dernierMerge.slice(0, 10)}`}) — nothing is modified: no file, no branch, no PR`),
    "",
    ...(total === 0
      ? [ligne("ratio", `no merge on ${ref}: nothing to measure`)]
      : [
          ligne("ratio", "added / removed over the latest merges, each counted against its first parent"),
          ...colonnes(
            fenetres.map(({ fenetre, merges, ajoute, retire }) => [
              `${fenetre} merges`,
              `+${dire(ajoute)} / −${dire(retire)}`,
              `${direRatio({ ajoute, retire })}${merges < fenetre ? ` — only ${pluriel(merges, "merge")} on the branch` : ""}`,
            ]),
          ),
        ]),
    "",
    ligne(
      "duplicates",
      fichiers === 0
        ? "none spotted — no code file on the branch"
        : `${doublons.length === 0 ? "none spotted" : `${dire(doublons.length)} spotted, ${pluriel(doublons.reduce((somme, { lignes }) => somme + lignes, 0), "line")}`} — at least ${LIGNES_MIN} identical lines of code in a row, among ${pluriel(fichiers, "code file")}`,
    ),
    ...colonnes(doublons.map(({ lignes, passages }) => [pluriel(lignes, "line"), passages.map(({ chemin, debut, fin }) => `${chemin}:${debut}-${fin}`).join(" = ")])),
    "",
    ligne(
      "dead code",
      modules === 0
        ? "none spotted — no TypeScript or JavaScript file on the branch"
        : `${morts.length === 0 ? "none spotted" : `${dire(morts.length)} export${morts.length > 1 ? "s" : ""} spotted`}, among ${pluriel(modules, "TypeScript or JavaScript file")}`,
    ),
    ...colonnes(morts.map(({ chemin, ligne: numero, nom, tests }) => [`${chemin}:${numero}`, `\`${nom}\` — referenced ${tests.length === 0 ? "nowhere" : `only by tests: ${tests.join(", ")}`}`])),
    ...(ecartes === 0 ? [] : [ligne("", `${pluriel(ecartes, "file")} of more than ${dire(TAILLE_MAX / 1_000_000)} MB on the branch: not read`)]),
  ];
}

// La dernière passe qui écrit, telle que le journal la porte : celle qui
// range, la demande qui attend et ce qui la retient, ou comment la dernière a fini — c'est ici qu'une passe arrêtée par un
// garde-fou se lit —, puis le bilan de la dernière qui a fini. Rien, tant
// qu'aucune n'a été demandée.
function direPasse(log: Log, arbre: (commit: string) => string | null): string[] {
  const dernier = <T extends "closing.requested" | "closing.refused" | "closing.cancelled" | "closing.started" | "closing.ended">(type: T) => log.duType(type, 1)[0];
  const [demandee, refusee, retiree, partie, finie] = [dernier("closing.requested"), dernier("closing.refused"), dernier("closing.cancelled"), dernier("closing.started"), dernier("closing.ended")];
  const recent = [demandee, refusee, retiree, partie, finie].reduce((plus, fait) => Math.max(plus, fait?.seq ?? 0), 0);
  if (recent === 0) return [];
  const le = (at: string) => at.slice(0, 16).replace("T", " ");
  const awaiting = queuedRequest(log.base);
  const dit =
    finie?.seq === recent
      ? `${finie.payload.run}, on ${le(finie.at)} — ${direFinEn(finie.payload)}`
      : partie?.seq === recent
        ? `${partie.payload.run} has been tidying up since ${le(partie.at)} — it holds ${pluriel(partie.payload.zone.length, "file")}, no cook starts on them`
        : refusee?.seq === recent
          ? `refused on ${le(refusee.at)} — ${direRefusEn(refusee.payload)}`
          : retiree?.seq === recent
            ? `requested then withdrawn by the chef on ${le(retiree.at)} — nothing has left`
            : awaiting !== null
              ? direDemandeEn(awaiting, refus(log.base, reglagesEnVigueur(log), false))
              : `requested on ${le(demandee?.at ?? "")} — the runtime has not taken it yet`;
  return [
    ligne("pass", dit),
    // Une demande venue depuis ne l'efface pas : le bilan dit alors de quelle passe il est.
    ...(finie === undefined ? [] : [...(finie.seq === recent ? [] : [ligne("", `the last finished pass: ${finie.payload.run}, on ${le(finie.at)} — ${direFinEn(finie.payload)}`)]), ...direBilan(log, finie.payload, arbre)]),
  ];
}

// Les compteurs de la dérive, tels que le relevé des mesures les tient : rien
// n'est recompté ici. `arbre` : l'arbre d'un commit du clone, pour le bilan. Le journal est lu sans être ouvert en écriture, et son
// absence n'empêche pas d'observer le dépôt.
function sayLog(repertoireEtat: string | undefined, arbre: (commit: string) => string | null): string[] {
  const nonLu = (pourquoi: string) => [ligne("log", `not read: ${pourquoi} — the drift counters are read with \`${geste(`measures`)}\``)];
  if (!repertoireEtat) return nonLu("BRIGADE_STATE_DIR is not set");
  let log;
  try {
    log = openLog(repertoireEtat, { lectureSeule: true });
  } catch (erreur) {
    return nonLu(erreur instanceof Error ? erreur.message : String(erreur));
  }
  try {
    const deliveries = mergedDeliveries(log.base);
    const seuils = seuilsEnVigueur(log.base);
    const passes = franchis(deliveries, seuils ?? SANS_SEUIL);
    const constat = seuils === null ? "no threshold declared" : passes.length === 0 ? "no threshold crossed" : `${pluriel(passes.length, "threshold")} crossed, details with \`${geste(`measures`)}\``;
    return [ligne("log", `${pluriel(deliveries.length, "merge")} since the last closing (none in the log) — ${constat}`), ...passes.map((franchi) => ligne("", direJaugeEn(franchi))), ...direPasse(log, arbre)];
  } catch (erreur) {
    if (logNotReplayed(erreur)) return nonLu("it does not yet have the measures record, restart the runtime to recompute it");
    throw erreur;
  } finally {
    log.fermer();
  }
}

export function principal({ args, env, dire: sortir, redire }: Appel): void {
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }
  const exiger = (variable: string): string => env[variable] || echouer(2, `${variable} is not set\n${USAGE}`);
  if (args.length !== 0) echouer(2, USAGE);
  let depot: Depot;
  const clone = exiger("BRIGADE_REPO_DIR");
  try {
    depot = lireDepot(clone, exiger("BRIGADE_BASE_BRANCH"), env);
  } catch (erreur) {
    if (erreur instanceof ConfigInvalide) echouer(2, erreur.message);
    if (erreur instanceof DepotIllisible) echouer(1, erreur.message);
    throw erreur;
  }
  for (const texte of [...decrire(observer(depot)), "", ...sayLog(env.BRIGADE_STATE_DIR, (commit) => arbreDe(clone, env, commit))]) sortir(texte);
}
