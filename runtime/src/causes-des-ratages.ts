// Les essais ratés, rangés chacun dans une cause : ce qui a empêché un essai
// d'aboutir au merge. Des fonctions sans effet, qui ne lisent rien : les signaux
// de chaque essai leur viennent de `parcours-des-tickets.ts`.
//
// Une cause par essai, la première qui se lit, dans l'ordre de `CAUSES` pour
// les verdicts de la pass. Ce qu'aucun signal ne tranche — un cook mort sans
// motif, deux gates rouges d'une cause qu'on ne sait pas dire, un verdict rouge
// sans constat bloquant — va dans « autre » : aucune heuristique n'y est
// inventée, et aucun essai ne reste non classé.
import type { Parcours } from "./renvois.ts";

// Ce que le journal dit d'un essai, hors son issue et son verdict : de quoi
// le ranger. Absent d'un essai qu'on construit sans journal.
// `arret` : le plafond qui a arrêté le cook (`guard.tripped`). `fin` : la fin
// que le cook a rapportée (`cook.reported`). `panne` : le cook est mort avec le
// runtime, ou sa connexion a expiré. `textes` : ce que le cook ou le manager a
// écrit sur ce ticket (motif, résumé, livrable, raison du jugement). `jugement` :
// ce que la pass a vu de sa livraison — le dernier jugement.
export type Jugement = {
  noDiff: boolean;
  // La fusion avec la base ne s'est pas faite : la pass n'a rien pu jouer.
  conflit: boolean;
  gates: { outcome: string; failures: string[] };
  review: { outcome: string; blocking: number };
};
export type Signaux = { arret: string | null; fin: string | null; panne: boolean; textes: string[]; jugement: Jugement | null };

export const SANS_SIGNAUX: Signaux = { arret: null, fin: null, panne: false, textes: [], jugement: null };

export const CAUSES = [
  { cle: "relecture", titre: "blocking review" },
  { cle: "gates-runtime", titre: "red gates: runtime tests" },
  { cle: "gates-app", titre: "red gates: app tests" },
  { cle: "gates-types", titre: "red gates: type check" },
  { cle: "conflit", titre: "conflict with the base" },
  { cle: "plafond", titre: "cap on turns or duration" },
  { cle: "panne", titre: "station outage" },
  { cle: "criteres", titre: "contradictory criteria or incomplete ticket" },
  { cle: "autre", titre: "other" },
] as const;
export type Cause = (typeof CAUSES)[number]["cle"];

// Seule une phrase explicite du cook ou du manager retient cette cause.
const CRITERES = /crit[èe]res? contradictoires?|ticket incomplet|contradictory criteria|incomplete ticket/i;

// Les lignes FAIL des gates (`gates.sh`), par étape.
function causeDesGates(failures: string[]): Cause {
  for (const ligne of failures) {
    if (/^FAIL\s+tests du runtime en échec/.test(ligne)) return "gates-runtime";
    if (/^FAIL\s+tests de l'app en échec/.test(ligne)) return "gates-app";
    if (/^FAIL\s+contrôle de types (du runtime|de l'app) en échec/.test(ligne)) return "gates-types";
  }
  return "autre";
}

export function classerEssai(signaux: Signaux): Cause {
  if (signaux.textes.some((texte) => CRITERES.test(texte))) return "criteres";
  const { jugement } = signaux;
  if (jugement !== null && !jugement.noDiff) {
    if (jugement.conflit) return "conflit";
    if (jugement.gates.outcome === "red" || jugement.gates.outcome === "timeout") return causeDesGates(jugement.gates.failures);
    if (jugement.review.outcome === "red" && jugement.review.blocking > 0) return "relecture";
  }
  if (signaux.arret === "turns" || signaux.arret === "duration") return "plafond";
  if (signaux.panne || signaux.fin === "disconnected") return "panne";
  return "autre";
}

// Un essai est raté quand il n'a pas abouti au merge : tout essai d'un parcours
// mergé ou servi sans diff sauf le dernier, qui a abouti ; et, d'un parcours
// ouvert, tout essai fini sauf celui que la pass attend (vert) ou qui tourne.
export function essaisRates(parcours: readonly Parcours[]): Array<{ ticket: number; cause: Cause }> {
  return parcours.flatMap(({ ticket, end, attempts }) =>
    attempts.flatMap((essai, i) => {
      if (i === attempts.length - 1) {
        if (end !== null) return [];
        if (essai.outcome === null || (essai.outcome === "ok" && essai.verdict === "green")) return [];
      }
      return [{ ticket, cause: classerEssai(essai.signaux ?? SANS_SIGNAUX) }];
    }),
  );
}

export type LigneDeCause = { cause: Cause; titre: string; essais: number; part: number; pourcent: number; tickets: number[] };
export type CausesDesRatages = { rates: number; lignes: LigneDeCause[] };

const DERNIERS_TICKETS = 3;

// Le nombre, la part (entre 0 et 1) et les 3 derniers tickets de chaque cause.
// `pourcent` : la part en pourcents entiers, arrondie au plus fort reste pour
// que la somme vaille 100.
export function mesurerCauses(parcours: readonly Parcours[]): CausesDesRatages {
  const rates = essaisRates(parcours);
  const lignes: LigneDeCause[] = CAUSES.map(({ cle, titre }) => {
    const siennes = rates.filter((essai) => essai.cause === cle);
    // Les plus récents d'abord, chaque ticket une fois.
    const tickets = [...new Set(siennes.map((essai) => essai.ticket).reverse())].slice(0, DERNIERS_TICKETS);
    return { cause: cle, titre, essais: siennes.length, part: rates.length === 0 ? 0 : siennes.length / rates.length, pourcent: 0, tickets };
  });
  if (rates.length > 0) {
    const entiers = lignes.map((l) => Math.floor(l.part * 100 + 1e-9));
    let reste = 100 - entiers.reduce((a, b) => a + b, 0);
    const parReste = lignes.map((l, i) => i).sort((x, y) => (lignes[y]!.part * 100 - entiers[y]!) - (lignes[x]!.part * 100 - entiers[x]!) || x - y);
    for (const i of parReste) {
      if (reste <= 0) break;
      if (lignes[i]!.essais > 0) { entiers[i]!++; reste--; }
    }
    lignes.forEach((l, i) => (l.pourcent = entiers[i]!));
  }
  return { rates: rates.length, lignes };
}

const ligne = (titre: string, valeur: string) => `${titre.padEnd(11)}${valeur}`.trimEnd();

export function decrireCauses({ rates, lignes }: CausesDesRatages): string[] {
  if (rates === 0) return [ligne("failures", "no failed attempt: nothing to sort")];
  return [
    ligne("failures", `${rates} failed attempt${rates > 1 ? "s" : ""} (not ending in a merge), each under one cause`),
    ...lignes.map((l) => ligne("", `${l.titre}: ${l.essais} (${l.pourcent}%)${l.tickets.length > 0 ? ` — ${l.tickets.map((t) => `#${t}`).join(", ")}` : ""}`)),
  ];
}
