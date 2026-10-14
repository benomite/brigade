// La fermeture qui observe : ce que la branche d'intégration du dépôt cible a
// ajouté et retiré sur ses derniers merges, les doublons et le code mort
// qu'elle porte, et les compteurs de dérive du journal. Elle mesure et
// repère, et ne touche à rien : ni fichier, ni branche, ni PR, ni verrou, ni
// journal — elle peut tourner pendant que les cooks travaillent.
import type { Appel } from "../appel.ts";
import { geste } from "../geste.ts";
import { Sortie } from "../appel.ts";
import { ouvrirJournal, type Journal } from "../journal.ts";
import { journalPasRejoue } from "../journal-pas-rejoue.ts";
import { direJauge, franchis, SANS_SEUIL } from "../mesures.ts";
import { livraisonsMergees, seuilsEnVigueur } from "../projections/mesures.ts";
import { ConfigInvalide } from "../runtime.ts";
import { MODULE, repererCodeMort, type Mort } from "./code-mort.ts";
import { direBilan } from "./bilan.ts";
import { demandeEnAttente, refus, reglagesEnVigueur } from "./condition.ts";
import { colonnes, direDemande, direFin, direRefus, ligne, pluriel } from "./dire.ts";
import { CODE, LIGNES_MIN, repererDoublons, type Doublon } from "./doublons.ts";
import { arbreDe, DepotIllisible, lireDepot, TAILLE_MAX, type Depot } from "./lecture.ts";
import { direRatio, mesurerRatio, type Fenetre } from "./ratio.ts";

const USAGE = [
  "usage : BRIGADE_REPO_DIR=<clone du projet> BRIGADE_BASE_BRANCH=<branche d'intégration> npm --prefix runtime run fermeture",
  "        BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run fermeture -- ecrire    la passe qui écrit",
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

const dire = (valeur: number, decimales = 0) => valeur.toLocaleString("fr-FR", { maximumFractionDigits: decimales });

// L'observation, ligne par ligne.
export function decrire({ ref, sha, dernierMerge, fenetres, doublons, fichiers, morts, modules, ecartes }: Observation): string[] {
  const total = fenetres.reduce((plus, { merges }) => Math.max(plus, merges), 0);
  return [
    ligne("fermeture", `observation de ${ref} (${sha.slice(0, 7)}, ${dernierMerge === null ? "aucun merge" : `dernier merge le ${dernierMerge.slice(0, 10)}`}) — rien n'est modifié : ni fichier, ni branche, ni PR`),
    "",
    ...(total === 0
      ? [ligne("ratio", `aucun merge sur ${ref} : rien à mesurer`)]
      : [
          ligne("ratio", "ajouté / retiré sur les derniers merges, chacun compté contre son premier parent"),
          ...colonnes(
            fenetres.map(({ fenetre, merges, ajoute, retire }) => [
              `${fenetre} merges`,
              `+${dire(ajoute)} / −${dire(retire)}`,
              `${direRatio({ ajoute, retire })}${merges < fenetre ? ` — ${pluriel(merges, "merge")} seulement sur la branche` : ""}`,
            ]),
          ),
        ]),
    "",
    ligne(
      "doublons",
      fichiers === 0
        ? "aucun repéré — aucun fichier de code sur la branche"
        : `${doublons.length === 0 ? "aucun repéré" : `${dire(doublons.length)} repéré${doublons.length > 1 ? "s" : ""}, ${pluriel(doublons.reduce((somme, { lignes }) => somme + lignes, 0), "ligne")}`} — au moins ${LIGNES_MIN} lignes de code identiques de suite, parmi ${pluriel(fichiers, "fichier")} de code`,
    ),
    ...colonnes(doublons.map(({ lignes, passages }) => [pluriel(lignes, "ligne"), passages.map(({ chemin, debut, fin }) => `${chemin}:${debut}-${fin}`).join(" = ")])),
    "",
    ligne(
      "code mort",
      modules === 0
        ? "aucun repéré — aucun fichier TypeScript ou JavaScript sur la branche"
        : `${morts.length === 0 ? "aucun repéré" : `${dire(morts.length)} export${morts.length > 1 ? "s" : ""} repéré${morts.length > 1 ? "s" : ""}`}, parmi ${pluriel(modules, "fichier")} TypeScript ou JavaScript`,
    ),
    ...colonnes(morts.map(({ chemin, ligne: numero, nom, tests }) => [`${chemin}:${numero}`, `\`${nom}\` — référencé ${tests.length === 0 ? "nulle part" : `seulement par des tests : ${tests.join(", ")}`}`])),
    ...(ecartes === 0 ? [] : [ligne("", `${pluriel(ecartes, "fichier")} de plus de ${dire(TAILLE_MAX / 1_000_000)} Mo sur la branche : non lu${ecartes > 1 ? "s" : ""}`)]),
  ];
}

// La dernière passe qui écrit, telle que le journal la porte : celle qui
// range, la demande qui attend et ce qui la retient, ou comment la dernière a fini — c'est ici qu'une passe arrêtée par un
// garde-fou se lit —, puis le bilan de la dernière qui a fini. Rien, tant
// qu'aucune n'a été demandée.
function direPasse(journal: Journal, arbre: (commit: string) => string | null): string[] {
  const dernier = <T extends "closing.requested" | "closing.refused" | "closing.cancelled" | "closing.started" | "closing.ended">(type: T) => journal.duType(type, 1)[0];
  const [demandee, refusee, retiree, partie, finie] = [dernier("closing.requested"), dernier("closing.refused"), dernier("closing.cancelled"), dernier("closing.started"), dernier("closing.ended")];
  const recent = [demandee, refusee, retiree, partie, finie].reduce((plus, fait) => Math.max(plus, fait?.seq ?? 0), 0);
  if (recent === 0) return [];
  const le = (at: string) => at.slice(0, 16).replace("T", " ");
  const attend = demandeEnAttente(journal.base);
  const dit =
    finie?.seq === recent
      ? `${finie.payload.run}, le ${le(finie.at)} — ${direFin(finie.payload)}`
      : partie?.seq === recent
        ? `${partie.payload.run} range depuis le ${le(partie.at)} — elle tient ${pluriel(partie.payload.zone.length, "fichier")}, aucun cook ne démarre dessus`
        : refusee?.seq === recent
          ? `refusée le ${le(refusee.at)} — ${direRefus(refusee.payload)}`
          : retiree?.seq === recent
            ? `demandée puis retirée par le chef le ${le(retiree.at)} — rien n'est parti`
            : attend !== null
              ? direDemande(attend, refus(journal.base, reglagesEnVigueur(journal), false))
              : `demandée le ${le(demandee?.at ?? "")} — le runtime ne l'a pas encore prise`;
  return [
    ligne("passe", dit),
    // Une demande venue depuis ne l'efface pas : le bilan dit alors de quelle passe il est.
    ...(finie === undefined ? [] : [...(finie.seq === recent ? [] : [ligne("", `la dernière passe finie : ${finie.payload.run}, le ${le(finie.at)} — ${direFin(finie.payload)}`)]), ...direBilan(journal, finie.payload, arbre)]),
  ];
}

// Les compteurs de la dérive, tels que le relevé des mesures les tient : rien
// n'est recompté ici. `arbre` : l'arbre d'un commit du clone, pour le bilan. Le journal est lu sans être ouvert en écriture, et son
// absence n'empêche pas d'observer le dépôt.
function direJournal(repertoireEtat: string | undefined, arbre: (commit: string) => string | null): string[] {
  const nonLu = (pourquoi: string) => [ligne("journal", `non lu : ${pourquoi} — les compteurs de la dérive se lisent par \`${geste(`mesures`)}\``)];
  if (!repertoireEtat) return nonLu("BRIGADE_STATE_DIR n'est pas défini");
  let journal;
  try {
    journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
  } catch (erreur) {
    return nonLu(erreur instanceof Error ? erreur.message : String(erreur));
  }
  try {
    const livraisons = livraisonsMergees(journal.base);
    const seuils = seuilsEnVigueur(journal.base);
    const passes = franchis(livraisons, seuils ?? SANS_SEUIL);
    const constat = seuils === null ? "aucun seuil déclaré" : passes.length === 0 ? "aucun seuil franchi" : `${pluriel(passes.length, "seuil")} franchi${passes.length > 1 ? "s" : ""}, le détail par \`${geste(`mesures`)}\``;
    return [ligne("journal", `${pluriel(livraisons.length, "merge")} depuis la dernière fermeture (aucune au journal) — ${constat}`), ...passes.map((franchi) => ligne("", direJauge(franchi))), ...direPasse(journal, arbre)];
  } catch (erreur) {
    if (journalPasRejoue(erreur)) return nonLu("il n'a pas encore le relevé des mesures, redémarrer le runtime le recalcule");
    throw erreur;
  } finally {
    journal.fermer();
  }
}

export function principal({ args, env, dire: sortir, redire }: Appel): void {
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }
  const exiger = (variable: string): string => env[variable] || echouer(2, `${variable} n'est pas défini\n${USAGE}`);
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
  for (const texte of [...decrire(observer(depot)), "", ...direJournal(env.BRIGADE_STATE_DIR, (commit) => arbreDe(clone, env, commit))]) sortir(texte);
}
