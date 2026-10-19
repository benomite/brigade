// Le bilan d'une passe qui écrit, relu dans le journal seul : ce qu'elle a
// retiré et pourquoi, ce qu'elle a laissé faute d'être sûre, ce que la pente
// y gagne — et, pour que ce gain ne soit pas une tricherie, trois garde-fous :
// la couverture de tests n'a pas baissé, les gates vérifient toujours autant
// de choses, le produit marche. Un closer qui se trompe efface du bon code et
// les gates restent vertes : des gates vertes ne tiennent donc aucun des deux
// premiers, et un garde-fou que rien n'a mesuré n'est jamais dit tenu.
//
// Rien n'est rejoué ici. La pente vient de la fin de la passe ; les
// garde-fous, des gates que la pass a jouées : sur la PR de la passe
// fusionnée avec la base (« après »), et sur l'arbre même de cette base
// (« avant ») — le contrôle de la base seule, ou le jugement de la livraison
// dont le merge l'a faite. Les deux mesures ne diffèrent donc que de ce que
// la passe a écrit.
import type { FaitFermeture, Laisse, Pente } from "../evenements/fermeture.ts";
import type { Gates } from "../evenements/pass.ts";
import type { Journal } from "../journal.ts";
import { SANS_MOTIF } from "./consigne.ts";
import { colonnes, ligne, nombre, pluriel } from "./dire.ts";
import { direRatio } from "./ratio.ts";

type Fin = Extract<FaitFermeture, { type: "closing.ended" }>["payload"];

// Ce que les gates du projet déclarent pour le bilan, par leurs lignes
// `MESURE  <nom>=<nombre>` : la couverture de tests, en pourcentage, et le
// nombre de vérifications qu'elles exécutent.
export const COUVERTURE = "couverture";
export const VERIFICATIONS = "verifications";

// `inconnu` : rien ne dit qu'il tient — ce n'est pas « tenu ».
export type GardeFou = { nom: string; avant: string; apres: string; verdict: "tenu" | "echec" | "inconnu"; detail: string | null };

const ABSENT = "—";
const ETATS: Record<Gates["outcome"], string> = { green: "gates green", red: "gates red", timeout: "gates stopped at their duration cap", skipped: "gates not run" };

// Les trois garde-fous, de ce que les gates ont dit avant et après la passe.
// `sansApres`, `sansAvant` : pourquoi l'une ou l'autre manque.
export function gardeFous(avant: Gates | null, apres: Gates | null, sansAvant: string, sansApres: string): GardeFou[] {
  // Une mesure déclarée par les gates, qui ne doit pas baisser.
  const mesure = (nom: string, cle: string, unite: string): GardeFou => {
    const [a, b] = [avant?.measures?.[cle], apres?.measures?.[cle]];
    const dire = (valeur: number | undefined) => (valeur === undefined ? ABSENT : `${valeur.toLocaleString("en-US", { maximumFractionDigits: 2 })}${unite}`);
    const dites = { nom, avant: dire(a), apres: dire(b) };
    if (apres === null) return { ...dites, verdict: "inconnu", detail: sansApres };
    if (b === undefined) return { ...dites, verdict: "inconnu", detail: `the gates run on the PR do not declare \`MESURE ${cle}\`` };
    if (avant === null) return { ...dites, verdict: "inconnu", detail: sansAvant };
    if (a === undefined) return { ...dites, verdict: "inconnu", detail: `the gates run on the base did not declare \`MESURE ${cle}\`` };
    return b < a ? { ...dites, verdict: "echec", detail: "down" } : { ...dites, verdict: "tenu", detail: null };
  };
  const produit: GardeFou = {
    nom: "product state",
    avant: avant === null ? ABSENT : ETATS[avant.outcome],
    apres: apres === null ? ABSENT : ETATS[apres.outcome],
    ...(apres === null
      ? { verdict: "inconnu", detail: sansApres }
      : apres.outcome === "green"
        ? { verdict: "tenu", detail: null }
        : apres.outcome === "skipped"
          ? { verdict: "inconnu", detail: "the PR did not merge with the base: its gates were not run" }
          : { verdict: "echec", detail: "the test suite is not green" }),
  };
  return [mesure("test coverage", COUVERTURE, " %"), mesure("gate checks", VERIFICATIONS, ""), produit];
}

// Une fenêtre de la pente, avant la passe et avec ce qu'elle retire — sur les
// mêmes merges : ce qui bouge ne tient qu'à elle. `sens` nul : la fenêtre n'a
// aucun merge, il n'y a rien à mesurer.
type Lignes = { ajoute: number; retire: number };
type Mouvement = { fenetre: number; merges: number; avant: Lignes; apres: Lignes; sens: "descend" | "monte" | "immobile" | null };

function mouvements(pente: Pente[], ajoutees: number, retirees: number): Mouvement[] {
  return pente.map(({ window: fenetre, merges, added, removed }) => {
    const [avant, apres] = [
      { ajoute: added, retire: removed },
      { ajoute: added + ajoutees, retire: removed + retirees },
    ];
    // Sans rien de retiré, il n'y a pas de ratio : tout ratio est en dessous.
    const ratio = ({ ajoute, retire }: Lignes) => (retire === 0 ? Infinity : ajoute / retire);
    // Ce qui se lit pareil n'a pas bougé : c'est le chiffre que le chef suit.
    const sens = merges === 0 ? null : direRatio(avant) === direRatio(apres) ? "immobile" : ratio(apres) < ratio(avant) ? "descend" : "monte";
    return { fenetre, merges, avant, apres, sens };
  });
}

// La pente de la passe, d'une phrase : celle de sa fenêtre la plus courte, le
// chiffre que le chef suit. Immobile, la passe n'a pas servi, et c'est dit.
function direPente([courte]: Mouvement[]): string {
  if (courte === undefined) return "the slope was not recorded by this pass";
  if (courte.sens === null) return "no merge on the base: the slope cannot be measured";
  const sur = `over ${pluriel(courte.fenetre, "merge")}`;
  if (courte.sens === "immobile") return `the slope did not move (${direRatio(courte.avant)} ${sur}): the pass was of no use`;
  const mouvement = `${direRatio(courte.avant)} → ${direRatio(courte.apres)} ${sur}`;
  return courte.sens === "monte" ? `the slope rises (${mouvement}): the pass was of no use` : `the slope falls (${mouvement})`;
}

// Ce que la pass a fait de la PR d'une passe livrée : le dernier jugement
// qu'elle en a rendu, et son merge.
function suivre(journal: Journal, run: string) {
  const entree = journal.duType("pass.entered", 20).find(({ payload }) => payload.run === run);
  if (entree === undefined) return null;
  const faits = journal.duTicket(entree.payload.number).filter(({ seq }) => seq > entree.seq);
  return {
    numero: entree.payload.number,
    jugement: faits.findLast((fait) => fait.type === "pass.judged") ?? null,
    merge: faits.findLast((fait) => fait.type === "merge.done") ?? null,
  };
}

// Les gates que la pass a jouées sur l'arbre même de ce commit de la base : son
// contrôle seule, ou le jugement d'une livraison dont la fusion a donné cet
// arbre. Les dernières l'emportent.
function gatesDeLaBase(journal: Journal, commit: string, arbre: string | null): Gates | null {
  const jouees = [
    ...journal.duType("base.checked", 50).filter(({ payload }) => payload.sha === commit && payload.outcome !== "skipped"),
    ...(arbre === null ? [] : journal.duType("pass.judged", 200).filter(({ payload }) => payload.merged === arbre && payload.gates.outcome !== "skipped")),
  ];
  return jouees.sort((un, autre) => un.seq - autre.seq).at(-1)?.payload.gates ?? null;
}

const le = (at: string) => at.slice(0, 16).replace("T", " ");
const court = (sha: string) => sha.slice(0, 7);
const laisse = ({ id, what, reason }: Laisse) => [id, what, reason ?? SANS_MOTIF];

// Le bilan de la passe finie par `fin`, ligne par ligne : son verdict en tête,
// puis de quoi le vérifier. `arbreDe` : l'arbre d'un commit du clone du projet.
export function direBilan(journal: Journal, fin: Fin, arbreDe: (commit: string) => string | null): string[] {
  const gardes = (fin.kept ?? []).filter(({ before }) => !before);
  const ecartes = (fin.kept ?? []).filter(({ before }) => before);
  const restes = [
    ...(gardes.length === 0 ? [] : [ligne("left", `${nombre(gardes.length)}, for lack of certainty`), ...colonnes(gardes.map(laisse))]),
    ...(ecartes.length === 0 ? [] : [ligne("set aside", `${nombre(ecartes.length)}, before the pass`), ...colonnes(ecartes.map(laisse))]),
  ];
  if (fin.outcome !== "delivered") return [ligne("summary", `${fin.outcome === "nothing" ? "nothing was removed" : "nothing is delivered"}: the slope did not move, the pass was of no use`), ...restes];

  const suivi = suivre(journal, fin.run);
  const jugement = suivi?.jugement ?? null;
  const sur = jugement?.payload.base ?? null;
  const apres = jugement?.payload.gates ?? null;
  const avant = sur === null ? null : gatesDeLaBase(journal, sur, arbreDe(sur));
  const gardeFousDeLaPasse = gardeFous(
    avant,
    apres,
    sur === null ? "the pass did not say on which base it judged the PR" : `no gate in the log was run on the base \`${court(sur)}\` alone`,
    suivi === null ? "the log does not say that the PR entered the pass" : "the pass has not judged the PR yet",
  );
  const [retirees, ajoutees] = [fin.removedLines ?? 0, fin.addedLines ?? 0];
  const pente = mouvements(fin.slope ?? [], ajoutees, retirees);
  const mergee = suivi?.merge ?? null;

  // En tête : un garde-fou qui a cédé, avant tout le reste — des gates vertes
  // n'y changent rien.
  const echecs = gardeFousDeLaPasse.filter(({ verdict }) => verdict === "echec");
  const inconnus = gardeFousDeLaPasse.filter(({ verdict }) => verdict === "inconnu");
  const tete = [
    echecs.length === 0
      ? null
      : `FAILURE — ${echecs.map(({ nom, avant: debut, apres: suite, detail }) => `${nom} : ${detail} (${debut} → ${suite})`).join(", ")}${apres?.outcome === "green" ? ", even if the gates are green" : ""} — the pass may have removed live code`,
    inconnus.length === 0 ? null : `${pluriel(inconnus.length, "guardrail")} not established (${inconnus.map(({ nom }) => nom).join(", ")}): nothing says ${inconnus.length > 1 ? "they hold" : "it holds"}`,
    direPente(pente),
    echecs.length + inconnus.length === 0 ? "the three guardrails hold" : null,
  ].filter((dit) => dit !== null);
  const lignes = ({ ajoute, retire }: Lignes) => `+${nombre(ajoute)} / −${nombre(retire)}  ${direRatio({ ajoute, retire })}`;

  const retires = fin.removed;
  return [
    ligne("summary", tete.join(" · ")),
    ligne(
      "",
      `${suivi === null ? fin.pr : `PR #${suivi.numero}`} — ${jugement === null ? "not yet judged by the pass" : `judged ${jugement.payload.verdict === "green" ? "green" : "red"} by the pass`}, ${mergee === null ? "not merged: the base's slope only moves at its merge" : `merged on ${le(mergee.at)}`}`,
    ),
    ligne(
      "removed",
      `${retires === undefined ? "" : `${nombre(retires.length)} of ${pluriel(retires.length + gardes.length, "candidate")} · `}${pluriel(retirees, "line")} removed${fin.addedLines === undefined ? "" : `, ${ajoutees === 0 ? "none" : nombre(ajoutees)} added`}, in ${(fin.files ?? []).map((fichier) => `\`${fichier}\``).join(", ")}`,
    ),
    ...(retires === undefined ? [ligne("", "the log does not say which: this pass finished before the summary existed")] : colonnes(retires.map(({ id, what }) => [id, what]))),
    ...restes,
    ...(pente.length === 0
      ? []
      : [
          ligne("slope", `added / removed over the same merges: before the pass → with what it removes${mergee === null ? ", once its PR is merged" : ""}`),
          ...colonnes(
            pente.map(({ fenetre, merges, avant: debut, apres: suite, sens }) => [
              `${fenetre} merges`,
              ...(sens === null ? ["no merge: nothing to measure"] : [`${lignes(debut)}  →  ${lignes(suite)}`, `${sens === "immobile" ? "did not move" : sens === "descend" ? "falls" : "rises"}${merges < fenetre ? ` — only ${pluriel(merges, "merge")} on the branch` : ""}`]),
            ]),
          ),
        ]),
    ligne("guardrails", `before the pass → after, by the gates the pass ran: on the base${sur === null ? "" : ` \`${court(sur)}\``}, then on the PR merged with it`),
    ...colonnes(gardeFousDeLaPasse.map(({ nom, avant: debut, apres: suite, verdict, detail }) => [nom, `${debut} → ${suite}`, verdict === "tenu" ? "holds" : `${verdict === "echec" ? "FAILURE" : "not established"} — ${detail}`])),
  ];
}
