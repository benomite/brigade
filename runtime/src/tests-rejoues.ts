// Les tests verts seulement au rejeu (#2091) : la pass relance une fois une CI
// rouge avant de juger, et un test qui passe alors est instable — la livraison
// n'y était pour rien. `measures` les montre, avec le nombre de fois où c'est
// arrivé sur les derniers merges, pour que les tests instables se voient.
//
// Une relance verte (`pass.ci-rerun-passed`) compte pour un merge si elle est
// sur son ticket, après le merge précédent de ce ticket et avant le sien. Un
// job dont le journal ne nommait aucun test compte sous son nom de job.
import type { Base } from "./base.ts";

// Le nombre de merges sur lesquels les rejeux se comptent, faute d'option.
export const MERGES_PAR_DEFAUT = 10;

export type Ligne = { seq: number; ticket: number; type: string; payload: string };

// `fois` : le nombre de relances vertes où il était en échec ; `tickets` :
// leurs tickets, une fois chacun, dans l'ordre des merges.
export type TestRejoue = { test: string; fois: number; tickets: number[] };
export type Rejeux = { n: number; merges: number; rejeux: number; tests: TestRejoue[] };

export function lireRejeux(base: Base): Ligne[] {
  return base.lire<Ligne>("SELECT seq, ticket, type, payload FROM events WHERE ticket IS NOT NULL AND type IN ('merge.done', 'pass.ci-rerun-passed') ORDER BY seq");
}

const texte = (valeur: unknown): valeur is string => typeof valeur === "string" && valeur !== "";

// Ce qu'une relance verte compte : ses tests, ou ses jobs s'il n'en nomme aucun.
function rejouesDe(payload: string): string[] {
  const p = JSON.parse(payload) as { tests?: unknown; before?: unknown };
  const tests = Array.isArray(p.tests) ? p.tests.filter(texte) : [];
  if (tests.length > 0) return [...new Set(tests.map((test) => `“${test}”`))];
  const jobs = Array.isArray(p.before) ? p.before.map((check: { name?: unknown }) => check?.name).filter(texte) : [];
  return [...new Set(jobs.map((nom) => `job “${nom}” (no test named)`))];
}

export function mesurerRejeux(lignes: readonly Ligne[], n = MERGES_PAR_DEFAUT): Rejeux {
  // Par ticket, les relances vertes depuis son dernier merge.
  const enCours = new Map<number, string[][]>();
  const merges: Array<{ ticket: number; rejeux: string[][] }> = [];
  for (const { ticket, type, payload } of lignes) {
    if (type === "pass.ci-rerun-passed") {
      enCours.set(ticket, [...(enCours.get(ticket) ?? []), rejouesDe(payload)]);
    } else {
      merges.push({ ticket, rejeux: enCours.get(ticket) ?? [] });
      enCours.delete(ticket);
    }
  }
  const derniers = merges.slice(-n);
  const comptes = new Map<string, TestRejoue>();
  for (const { ticket, rejeux } of derniers) {
    for (const tests of rejeux) {
      for (const test of tests) {
        const compte = comptes.get(test) ?? { test, fois: 0, tickets: [] };
        compte.fois += 1;
        if (!compte.tickets.includes(ticket)) compte.tickets.push(ticket);
        comptes.set(test, compte);
      }
    }
  }
  return {
    n,
    merges: derniers.length,
    rejeux: derniers.reduce((somme, { rejeux }) => somme + rejeux.length, 0),
    // Les plus fréquents d'abord ; à égalité, le premier vu.
    tests: [...comptes.values()].sort((a, b) => b.fois - a.fois),
  };
}

const ligne = (titre: string, valeur: string) => `${titre.padEnd(11)}${valeur}`.trimEnd();

// La mesure des rejeux, ligne par ligne.
export function decrireRejeux({ n, merges, rejeux, tests }: Rejeux): string[] {
  if (merges === 0) return [ligne("flaky", `no merge in the log: nothing to count (N = ${n})`)];
  const sur = `over the last ${merges} merge${merges > 1 ? "s" : ""}`;
  if (rejeux === 0) return [ligne("flaky", `no test green only on the CI rerun ${sur}`)];
  return [
    ligne("flaky", `tests green only on the CI rerun ${sur}: ${rejeux} rerun${rejeux > 1 ? "s" : ""} passed — each test, how many times, and its tickets`),
    ...tests.map(({ test, fois, tickets }) => ligne("", `${test}: ${fois} time${fois > 1 ? "s" : ""} — ${tickets.map((ticket) => `#${ticket}`).join(", ")}`)),
  ];
}
