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
const ETATS: Record<Gates["outcome"], string> = { green: "gates vertes", red: "gates rouges", timeout: "gates arrêtées à leur plafond de durée", skipped: "gates non jouées" };

// Les trois garde-fous, de ce que les gates ont dit avant et après la passe.
// `sansApres`, `sansAvant` : pourquoi l'une ou l'autre manque.
export function gardeFous(avant: Gates | null, apres: Gates | null, sansAvant: string, sansApres: string): GardeFou[] {
  // Une mesure déclarée par les gates, qui ne doit pas baisser.
  const mesure = (nom: string, cle: string, unite: string): GardeFou => {
    const [a, b] = [avant?.measures?.[cle], apres?.measures?.[cle]];
    const dire = (valeur: number | undefined) => (valeur === undefined ? ABSENT : `${valeur.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}${unite}`);
    const dites = { nom, avant: dire(a), apres: dire(b) };
    if (apres === null) return { ...dites, verdict: "inconnu", detail: sansApres };
    if (b === undefined) return { ...dites, verdict: "inconnu", detail: `les gates jouées sur la PR ne déclarent pas \`MESURE ${cle}\`` };
    if (avant === null) return { ...dites, verdict: "inconnu", detail: sansAvant };
    if (a === undefined) return { ...dites, verdict: "inconnu", detail: `les gates jouées sur la base ne déclaraient pas \`MESURE ${cle}\`` };
    return b < a ? { ...dites, verdict: "echec", detail: "en baisse" } : { ...dites, verdict: "tenu", detail: null };
  };
  const produit: GardeFou = {
    nom: "état du produit",
    avant: avant === null ? ABSENT : ETATS[avant.outcome],
    apres: apres === null ? ABSENT : ETATS[apres.outcome],
    ...(apres === null
      ? { verdict: "inconnu", detail: sansApres }
      : apres.outcome === "green"
        ? { verdict: "tenu", detail: null }
        : apres.outcome === "skipped"
          ? { verdict: "inconnu", detail: "la PR ne s'est pas fusionnée avec la base : ses gates n'ont pas été jouées" }
          : { verdict: "echec", detail: "la suite de tests n'est pas verte" }),
  };
  return [mesure("couverture de tests", COUVERTURE, " %"), mesure("vérifications des gates", VERIFICATIONS, ""), produit];
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
  if (courte === undefined) return "la pente n'a pas été relevée par cette passe";
  if (courte.sens === null) return "aucun merge sur la base : la pente ne se mesure pas";
  const sur = `sur ${pluriel(courte.fenetre, "merge")}`;
  if (courte.sens === "immobile") return `la pente n'a pas bougé (${direRatio(courte.avant)} ${sur}) : la passe n'a pas servi`;
  const mouvement = `${direRatio(courte.avant)} → ${direRatio(courte.apres)} ${sur}`;
  return courte.sens === "monte" ? `la pente monte (${mouvement}) : la passe n'a pas servi` : `la pente descend (${mouvement})`;
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
    ...(gardes.length === 0 ? [] : [ligne("laissé", `${nombre(gardes.length)}, faute d'être sûr`), ...colonnes(gardes.map(laisse))]),
    ...(ecartes.length === 0 ? [] : [ligne("écarté", `${nombre(ecartes.length)}, avant la passe`), ...colonnes(ecartes.map(laisse))]),
  ];
  if (fin.outcome !== "delivered") return [ligne("bilan", `${fin.outcome === "nothing" ? "rien n'a été retiré" : "rien n'est livré"} : la pente n'a pas bougé, la passe n'a pas servi`), ...restes];

  const suivi = suivre(journal, fin.run);
  const jugement = suivi?.jugement ?? null;
  const sur = jugement?.payload.base ?? null;
  const apres = jugement?.payload.gates ?? null;
  const avant = sur === null ? null : gatesDeLaBase(journal, sur, arbreDe(sur));
  const gardeFousDeLaPasse = gardeFous(
    avant,
    apres,
    sur === null ? "la pass n'a pas dit sur quelle base elle a jugé la PR" : `aucune gate au journal n'a été jouée sur la base \`${court(sur)}\` seule`,
    suivi === null ? "le journal ne dit pas que la PR est entrée en pass" : "la pass n'a pas encore jugé la PR",
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
      : `ÉCHEC — ${echecs.map(({ nom, avant: debut, apres: suite, detail }) => `${nom} : ${detail} (${debut} → ${suite})`).join(", ")}${apres?.outcome === "green" ? ", même si les gates sont vertes" : ""} — la passe a pu retirer du vivant`,
    inconnus.length === 0 ? null : `${pluriel(inconnus.length, "garde-fou")} non établi${inconnus.length > 1 ? "s" : ""} (${inconnus.map(({ nom }) => nom).join(", ")}) : rien ne dit qu'il${inconnus.length > 1 ? "s tiennent" : " tient"}`,
    direPente(pente),
    echecs.length + inconnus.length === 0 ? "les trois garde-fous tiennent" : null,
  ].filter((dit) => dit !== null);
  const lignes = ({ ajoute, retire }: Lignes) => `+${nombre(ajoute)} / −${nombre(retire)}  ${direRatio({ ajoute, retire })}`;

  const retires = fin.removed;
  return [
    ligne("bilan", tete.join(" · ")),
    ligne(
      "",
      `${suivi === null ? fin.pr : `PR #${suivi.numero}`} — ${jugement === null ? "pas encore jugée par la pass" : `jugée ${jugement.payload.verdict === "green" ? "verte" : "rouge"} par la pass`}, ${mergee === null ? "pas mergée : la pente de la base ne bouge qu'à son merge" : `mergée le ${le(mergee.at)}`}`,
    ),
    ligne(
      "retiré",
      `${retires === undefined ? "" : `${nombre(retires.length)} sur ${pluriel(retires.length + gardes.length, "candidat")} · `}${pluriel(retirees, "ligne")} retirée${retirees > 1 ? "s" : ""}${fin.addedLines === undefined ? "" : `, ${ajoutees === 0 ? "aucune" : nombre(ajoutees)} ajoutée${ajoutees > 1 ? "s" : ""}`}, dans ${(fin.files ?? []).map((fichier) => `\`${fichier}\``).join(", ")}`,
    ),
    ...(retires === undefined ? [ligne("", "le journal ne dit pas lesquels : cette passe a fini avant que le bilan n'existe")] : colonnes(retires.map(({ id, what }) => [id, what]))),
    ...restes,
    ...(pente.length === 0
      ? []
      : [
          ligne("pente", `ajouté / retiré sur les mêmes merges : avant la passe → avec ce qu'elle retire${mergee === null ? ", une fois sa PR mergée" : ""}`),
          ...colonnes(
            pente.map(({ fenetre, merges, avant: debut, apres: suite, sens }) => [
              `${fenetre} merges`,
              ...(sens === null ? ["aucun merge : rien à mesurer"] : [`${lignes(debut)}  →  ${lignes(suite)}`, `${sens === "immobile" ? "n'a pas bougé" : sens}${merges < fenetre ? ` — ${pluriel(merges, "merge")} seulement sur la branche` : ""}`]),
            ]),
          ),
        ]),
    ligne("garde-fous", `avant la passe → après, par les gates que la pass a jouées : sur la base${sur === null ? "" : ` \`${court(sur)}\``}, puis sur la PR fusionnée avec elle`),
    ...colonnes(gardeFousDeLaPasse.map(({ nom, avant: debut, apres: suite, verdict, detail }) => [nom, `${debut} → ${suite}`, verdict === "tenu" ? "tenu" : `${verdict === "echec" ? "ÉCHEC" : "non établi"} — ${detail}`])),
  ];
}
