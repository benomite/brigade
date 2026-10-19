// Ce qu'une correction acceptée des consignes du projet a fait de sa cause (épique #994, #1001) : la part
// des tickets que la cause a fait rater avant le merge de sa PR, et après. `facts` la porte dans `reculs`
// (runtime/src/correctif/recul.ts) ; la page Reliability du projet la pose sous la fiabilité des cooks.
// L'app n'en juge rien : « recule » est le mot du runtime, la part est la sienne.
//
// Ce module tient ce que la vue ne calcule pas :
//   - la lecture du champ `reculs` de `facts`, champ pour champ (`reculsLus`) ;
//   - la section, prête à poser (`reculDe`) : chaque côté en pourcents entiers, ses derniers tickets
//     atteints, et le numéro de la PR de la correction.
// Ce que la cause a fait sur un côté du merge (runtime/src/correctif/recul.ts, `Releve`).
export type ReleveLu = { tickets: number; atteints: number[]; essais: number; part: number };
type Commun = { proposition: number; cause: string; titre: string; pr: string | null };
// Ce que `facts` dit d'une correction acceptée (runtime/src/correctif/recul.ts, `ReculDeCorrection`).
export type ReculLu =
  | (Commun & { etat: "en-cours" | "non-mergee" })
  | (Commun & { etat: "rien-a-comparer"; mergee: string; avant: ReleveLu | null })
  | (Commun & { etat: "mesuree"; mergee: string; avant: ReleveLu; apres: ReleveLu; recule: boolean });

// Un côté, tel que la vue le pose : `atteints` sur `tickets`, `pourcent` sa part arrondie, et `derniers`
// — les tickets atteints les plus récents d'abord, trois au plus, chacun ouvre sa fiche.
export type Cote = { tickets: number; atteints: number; pourcent: number; derniers: number[] };
// La section d'une correction, telle que la vue la pose : elle n'y calcule rien. `pr` : le numéro de la
// PR de la correction, nul quand elle n'en a pas, ou que son adresse ne le dit pas. `mergee` : l'heure
// du merge, à l'horloge de la box.
export type Recul = { proposition: number; titre: string; pr: number | null } & (
  | { etat: "en-cours" | "non-mergee" }
  | { etat: "rien-a-comparer"; mergee: string; avant: Cote | null }
  | { etat: "mesuree"; mergee: string; avant: Cote; apres: Cote; recule: boolean }
);

// Les tickets atteints d'un côté qui s'ouvrent : les plus récents, comme les causes de la page.
export const DERNIERS = 3;

class Informe extends Error {}
const refuser = (champ: string, attendu: string): never => {
  throw new Informe(`${champ}: expected ${attendu}`);
};
const objet = (valeur: unknown, champ: string): Record<string, unknown> =>
  typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : refuser(champ, "an object");
const texte = (valeur: unknown, champ: string): string => (typeof valeur === "string" ? valeur : refuser(champ, "a string"));
const entier = (valeur: unknown, champ: string): number => (typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur >= 0 ? valeur : refuser(champ, "a non-negative integer"));
const liste = (valeur: unknown, champ: string): unknown[] => (Array.isArray(valeur) ? valeur : refuser(champ, "a list"));
const heure = (valeur: unknown, champ: string): string => {
  const lue = texte(valeur, champ);
  return Number.isNaN(Date.parse(lue)) ? refuser(champ, "a time") : lue;
};

function releveLu(brut: unknown, champ: string): ReleveLu {
  const lu = objet(brut, champ);
  const tickets = entier(lu.tickets, `${champ}.tickets`);
  if (tickets === 0) refuser(`${champ}.tickets`, "at least one ticket");
  const part = lu.part;
  if (typeof part !== "number" || !(part >= 0 && part <= 1)) refuser(`${champ}.part`, "a share between 0 and 1");
  return {
    tickets,
    atteints: liste(lu.atteints, `${champ}.atteints`).map((ticket, n) => entier(ticket, `${champ}.atteints[${n}]`)),
    essais: entier(lu.essais, `${champ}.essais`),
    part: part as number,
  };
}

// Le champ `reculs` de `facts`, champ pour champ. Un champ qui manque ou qui n'a pas sa forme refuse la
// forme entière, comme le reste de `facts` (faits.ts) : l'erreur dit lequel. Un état que l'app ne connaît
// pas aussi : elle ne devine pas ce qu'il mesure.
export function reculsLus(brut: unknown): ReculLu[] {
  return liste(brut, "reculs").map((un, rang): ReculLu => {
    const lequel = `reculs[${rang}]`;
    const lu = objet(un, lequel);
    const commun: Commun = {
      proposition: entier(lu.proposition, `${lequel}.proposition`),
      cause: texte(lu.cause, `${lequel}.cause`),
      titre: texte(lu.titre, `${lequel}.titre`),
      pr: lu.pr === null ? null : texte(lu.pr, `${lequel}.pr`),
    };
    switch (lu.etat) {
      case "en-cours":
      case "non-mergee":
        return { ...commun, etat: lu.etat };
      case "rien-a-comparer":
        return { ...commun, etat: lu.etat, mergee: heure(lu.mergee, `${lequel}.mergee`), avant: lu.avant === null ? null : releveLu(lu.avant, `${lequel}.avant`) };
      case "mesuree":
        if (typeof lu.recule !== "boolean") refuser(`${lequel}.recule`, "a boolean");
        return { ...commun, etat: lu.etat, mergee: heure(lu.mergee, `${lequel}.mergee`), avant: releveLu(lu.avant, `${lequel}.avant`), apres: releveLu(lu.apres, `${lequel}.apres`), recule: lu.recule as boolean };
      default:
        return refuser(`${lequel}.etat`, "en-cours, non-mergee, rien-a-comparer or mesuree");
    }
  });
}

// L'erreur que `reculsLus` lève sur une forme qui n'est pas la sienne : faits.ts la rend comme les siennes.
export const reculInforme = (erreur: unknown): erreur is Error => erreur instanceof Informe;

const cote = ({ tickets, atteints, part }: ReleveLu): Cote => ({ tickets, atteints: atteints.length, pourcent: Math.round(part * 100), derniers: atteints.slice(-DERNIERS).reverse() });
// Le numéro d'une PR, lu dans son adresse (`…/pull/41`).
const numeroDe = (pr: string | null) => {
  const [, numero] = /\/pull\/(\d+)\/?$/.exec(pr ?? "") ?? [];
  return numero === undefined ? null : Number(numero);
};

// La section d'une correction, prête à poser.
export function reculDe(lu: ReculLu): Recul {
  const commun = { proposition: lu.proposition, titre: lu.titre, pr: numeroDe(lu.pr) };
  switch (lu.etat) {
    case "en-cours":
    case "non-mergee":
      return { ...commun, etat: lu.etat };
    case "rien-a-comparer":
      return { ...commun, etat: lu.etat, mergee: lu.mergee, avant: lu.avant === null ? null : cote(lu.avant) };
    case "mesuree":
      return { ...commun, etat: lu.etat, mergee: lu.mergee, avant: cote(lu.avant), apres: cote(lu.apres), recule: lu.recule };
  }
}
