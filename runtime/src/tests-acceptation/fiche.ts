// Les critères d'un ticket et la fiche de chacun (#3725) : le test qui le
// juge, puis ce que d'autres tickets de l'épique #3724 mesurent — rouge sur la
// base, vert sur la branche, mutations prises. Ce ticket n'en remplit que
// `testPath` ; les autres champs restent nuls jusqu'à ce qu'on les mesure.
//
// Les fiches se lisent des données du ticket : un commentaire marqué de
// l'issue, que la station poste quand les tests sont poussés.
import { DE_CONFIANCE } from "../alimenter.ts";
import { criteresDuCorps } from "../manager/verdict-incomplet.ts";

// `class` (#3740) : `testable`, le critère a son test gelé à `testPath` ;
// `not-testable`, aucun test écrit avant la livraison ne le juge, `testPath`
// est vide et `proof` nomme la preuve que la livraison doit à sa place.
export type FicheDeCritere = {
  criterion: string;
  class: "testable" | "not-testable";
  proof?: string;
  testPath: string;
  redOnMain: boolean | null;
  greenOnBranch: boolean | null;
  mutationsCaught: number | null;
  mutationsTotal: number | null;
  survivingLines: string[];
};

// Les critères d'acceptation d'un corps d'issue : une puce de sa section, un
// critère ; une ligne qui suit sa puce, indentée, la continue.
export function criteresDuTicket(corps: string): string[] {
  const section = criteresDuCorps(corps);
  if (section === null) return [];
  const criteres: string[] = [];
  for (const ligne of section.split("\n")) {
    const puce = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*\S)\s*$/.exec(ligne);
    if (puce !== null && !/^\s{2,}/.test(ligne)) criteres.push(puce[1] as string);
    else if (ligne.trim() !== "" && criteres.length > 0) criteres[criteres.length - 1] += ` ${ligne.trim()}`;
  }
  return criteres;
}

export const ficheNeuve = (criterion: string, testPath: string): FicheDeCritere => ({ criterion, class: "testable", testPath, redOnMain: null, greenOnBranch: null, mutationsCaught: null, mutationsTotal: null, survivingLines: [] });

export const ficheSansTest = (criterion: string, proof: string): FicheDeCritere => ({ criterion, class: "not-testable", proof, testPath: "", redOnMain: null, greenOnBranch: null, mutationsCaught: null, mutationsTotal: null, survivingLines: [] });

// La ligne d'une fiche sans critère testable : pourquoi l'étape des tests est
// sautée, et par quelles preuves, chacune une fois, dans leur ordre. Null dès
// qu'un critère est testable.
export function ligneSansCritereTestable(fiches: readonly FicheDeCritere[]): string | null {
  if (fiches.length === 0 || fiches.some((fiche) => fiche.class === "testable")) return null;
  return `no testable criterion: proof by ${[...new Set(fiches.map(({ proof }) => proof ?? ""))].join(" / ")}`;
}

export const MARQUE_DES_FICHES = "<!-- brigade:tests-acceptation -->";
const DEBUT_DES_DONNEES = "<!-- brigade:fiches ";
const FIN_DES_DONNEES = " -->";

// Le commentaire des fiches : un tableau pour qui lit l'issue, puis les fiches
// en JSON, dans un commentaire HTML — `>` y est échappé, pour qu'aucun critère
// ne le ferme.
export function corpsDesFiches(ticket: number, branche: string, fiches: readonly FicheDeCritere[]): string {
  const cellule = (texte: string) => texte.replaceAll("|", "\\|").replace(/\s+/g, " ");
  const testes = fiches.filter((fiche) => fiche.class === "testable").length;
  const sansTest = ligneSansCritereTestable(fiches);
  return [
    MARQUE_DES_FICHES,
    sansTest !== null
      ? `**No acceptance test written** — ${sansTest}. The tests step is skipped for #${ticket}: its delivery owes the proof of each criterion instead.`
      : testes === fiches.length
        ? `**Acceptance tests written** — ${fiches.length} test${fiches.length === 1 ? "" : "s"}, one per criterion, frozen in the first commit of \`${branche}\` (\`Acceptance-Tests: frozen\`). The cook of #${ticket} starts from that commit.`
        : `**Acceptance tests written** — ${testes} test${testes === 1 ? "" : "s"}, one per testable criterion, frozen in the first commit of \`${branche}\` (\`Acceptance-Tests: frozen\`); ${fiches.length - testes} not testable in advance, each with the proof its delivery owes. The cook of #${ticket} starts from that commit.`,
    "",
    "| Criterion | Class | Test or proof |",
    "|---|---|---|",
    ...fiches.map(({ criterion, class: classe, testPath, proof }) => `| ${cellule(criterion)} | ${classe} | ${classe === "testable" ? `\`${cellule(testPath)}\`` : `proof: ${cellule(proof ?? "")}`} |`),
    "",
    `${DEBUT_DES_DONNEES}${JSON.stringify(fiches).replaceAll(">", "\\u003e")}${FIN_DES_DONNEES}`,
  ].join("\n");
}

const estUneFiche = (valeur: unknown): valeur is FicheDeCritere => {
  if (typeof valeur !== "object" || valeur === null) return false;
  const f = valeur as Record<string, unknown>;
  const nombreOuNul = (v: unknown) => v === null || typeof v === "number";
  const boolOuNul = (v: unknown) => v === null || typeof v === "boolean";
  const classe = f.class === "testable" ? f.testPath !== "" : f.class === "not-testable" && typeof f.proof === "string" && f.proof.trim() !== "";
  return typeof f.criterion === "string" && typeof f.testPath === "string" && classe && boolOuNul(f.redOnMain) && boolOuNul(f.greenOnBranch) && nombreOuNul(f.mutationsCaught) && nombreOuNul(f.mutationsTotal) && Array.isArray(f.survivingLines) && f.survivingLines.every((l) => typeof l === "string");
};

// Les fiches du ticket, lues de ses commentaires : le dernier commentaire
// marqué du dépôt. Aucun : null. Un commentaire marqué qu'on ne lit pas le dit,
// sans fiche inventée.
export function lireLesFiches(commentaires: readonly { body: string; association: string }[]): { fiches: FicheDeCritere[] } | { illisible: string } | null {
  const dernier = commentaires.filter((c) => DE_CONFIANCE.includes(c.association) && c.body.startsWith(MARQUE_DES_FICHES)).at(-1);
  if (dernier === undefined) return null;
  const debut = dernier.body.lastIndexOf(DEBUT_DES_DONNEES);
  const fin = dernier.body.lastIndexOf(FIN_DES_DONNEES);
  if (debut === -1 || fin < debut + DEBUT_DES_DONNEES.length) return { illisible: "the comment of the acceptance tests carries no records" };
  let lu: unknown;
  try {
    lu = JSON.parse(dernier.body.slice(debut + DEBUT_DES_DONNEES.length, fin));
  } catch (erreur) {
    return { illisible: `the records of the acceptance tests are not JSON: ${erreur instanceof Error ? erreur.message : String(erreur)}` };
  }
  if (!Array.isArray(lu) || lu.length === 0 || !lu.every(estUneFiche)) return { illisible: "the records of the acceptance tests do not have the expected fields" };
  return { fiches: lu };
}

// Ce que la consigne du cook dit de ses tests gelés : le commit qui les porte,
// et, quand les fiches se lisent, chaque test et son critère, puis la preuve
// que la livraison doit pour chaque critère non testable (#3740).
export function consigneDesTestsGeles(lues: ReturnType<typeof lireLesFiches>): string {
  const fiches = lues !== null && "fiches" in lues ? lues.fiches : [];
  const testes = fiches.filter((fiche) => fiche.class === "testable");
  const liste = testes.length > 0 ? ["", ...testes.map(({ criterion, testPath }) => `- \`${testPath}\` — ${criterion}`)] : [];
  return [
    "## Frozen acceptance tests",
    "",
    "The first commit of your branch (trailer `Acceptance-Tests: frozen`) holds the acceptance tests of this ticket, one per testable criterion, written by the manager before you took it. They judge your work: make them pass. Do not modify, move or delete them, and do not rewrite that commit: the review reads any change to them as a blocking finding. If a criterion looks wrong to you, leave its test as it is and say why in `<bloque>`: the manager answers, or puts it to the chef as a card when it changes the product.",
    ...liste,
    ...consigneDesPreuves(fiches),
  ].join("\n");
}

// Les preuves que la livraison doit à la place d'un test, une par critère non
// testable ; rien quand tous le sont.
export function consigneDesPreuves(fiches: readonly FicheDeCritere[]): string[] {
  const dues = fiches.filter((fiche) => fiche.class === "not-testable");
  if (dues.length === 0) return [];
  return ["", "## Proofs your delivery owes", "", "These criteria are not testable in advance: no frozen test judges them. Your delivery brings, for each, the proof named here.", "", ...dues.map(({ criterion, proof }) => `- ${criterion} — proof: ${proof}`)];
}
