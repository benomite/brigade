// Une PR de cook rouge, sur laquelle aucun cook ne travaille, repart à un cook
// — jamais au chef (épique #2967, ticket #2970). Le 2026-11-08, la CI de la PR
// #2908 était rouge — deux tests de la vue lisaient encore les anciennes
// maquettes — et personne ne l'a réparée : elle a fini en demande « merge it »
// au chef. Le pass ne renvoie que le rouge d'un ticket `in-pass`, et la relance
// (`guerison/relance.ts`) celui d'un ticket `served-elsewhere` ; un ticket tenu
// pour le chef (`blocked-on-human`, `chef-todo`) gardait sa PR rouge.
//
// À chaque tour, pour chaque PR ouverte sur une branche `cook/<n>-github` :
// - le ticket `n` n'est pas sur le rail (fermé, sans `fire`), ou c'est une
//   épique : rien ;
// - un cook y travaille — en cuisson ici, `taken`, ou `in-pass`, où le pass
//   renvoie lui-même le rouge — : rien ;
// - `served-elsewhere` est à la relance, `waiting` attend son ticket `fix` : rien ;
// - rien ne le tient pour le chef : libre, un cook le prendra, et le pass
//   renverra le rouge de sa PR approuvée : rien ;
// - la CI de sa tête n'a aucun check rouge (verte, en cours, absente) : rien ;
// - sinon, la PR repart à un cook : un renvoi sur l'issue, qui dit les checks
//   rouges, et ce qui la tenait pour le chef tombe — `blocked-on-human`,
//   `chef-todo`. Le ticket redevient libre ; la station qui le prend reprend sa
//   branche, sous sa PR.
//
// Une tête ne repart qu'une fois par ce chemin : son renvoi porte sa marque
// (` sha=<sha> ci-rouge `), relue à chaque tour — même si le pass l'avait déjà
// renvoyée, puis que le cook est revenu tenu pour le chef sans rien pousser.
// Le renvoi porte la marque des renvois du pass : il compte parmi ceux du
// ticket (`RENVOIS_MAX`), et le pass ne renvoie pas une seconde fois la même tête.
//
// Rien n'est tenu ici : tout se relit de GitHub, à chaque appel.
import { DE_CONFIANCE } from "../alimenter.ts";
import { A_LA_MAIN } from "../brigade-github.ts";
import type { Check } from "../events/pass.ts";
import { LABEL_IN_PASS, LABEL_TAKEN, LABEL_WAITING } from "../github-etat/etats.ts";
import { CHEF_TODO } from "../github-seul/carte-todo/carte-todo.ts";
import { HORS_CUISINE } from "../github.ts";
import { MARQUE_DE_RENVOI, RAISONS_DE_RENVOI } from "../qualite-github.ts";

// La branche d'un cook de la station : `cook/<n>-github` (`brancheDuTicket`).
const BRANCHE_DE_COOK = /^cook\/(\d+)-github$/;

// Le ticket que livre la branche, ou null si ce n'est pas celle d'un cook.
export function ticketDeLaBranche(branche: string): number | null {
  const lu = BRANCHE_DE_COOK.exec(branche)?.[1];
  return lu === undefined ? null : Number(lu);
}

// La marque d'un renvoi de ce module, dans le commentaire de renvoi.
const marque = (sha: string) => ` sha=${sha} ci-rouge `;

// Une PR ouverte telle que la liste le tour. `number` et `sha` manquants, elle
// ne se lit pas : elle est laissée.
export type PROuverte = { branche: string; number?: number; sha?: string };

// Un ticket du tour : son numéro, ses labels.
export type TicketDuRail = { number: number; labels: readonly string[]; epique?: boolean };

// Ce que le renvoi demande au client GitHub de la station, et rien de plus.
export type GitHubDeLaCiRouge = {
  ci(sha: string): Promise<Pick<Check, "name" | "outcome">[]>;
  commentaires(numero: number): Promise<{ body: string; association?: string }[]>;
  commenter(numero: number, corps: string): Promise<void>;
  delabelliser(numero: number, label: string): Promise<void>;
};

export type OptionsDeLaCiRouge = {
  github: GitHubDeLaCiRouge;
  // La station qui renvoie, telle que ses commentaires la nomment.
  station: string;
  prs: readonly PROuverte[];
  // Les tickets du tour (`fire`, ouverts).
  tickets: readonly TicketDuRail[];
  // Les tickets qu'un cook de cette station cuisine en ce moment.
  enCuisine: ReadonlySet<number>;
};

// Ce que le passage a fait : les tickets renvoyés, les labels retirés de
// chacun, et les PR qu'il n'a pas pu examiner, avec pourquoi — une n'en
// retient aucune autre.
export type BilanDeLaCiRouge = {
  renvoyes: { ticket: number; pr: number; leves: string[] }[];
  echecs: { ticket: number; pr: number | null; message: string }[];
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Les labels qui disent qu'un cook, le pass, la relance ou un ticket `fix` s'en occupe déjà.
const PRIS_AILLEURS = [LABEL_TAKEN, LABEL_IN_PASS, HORS_CUISINE, LABEL_WAITING];

// Les labels qui tiennent un ticket pour le chef, et que le renvoi lève. Une
// fonction : `brigade-github.ts` importe ce module par la guérison.
export const tenuesDuChef = (): string[] => [A_LA_MAIN, CHEF_TODO];

// Le ticket est à examiner : sur le rail, tenu pour le chef, sans cook ni rien
// qui s'en occupe déjà. Sans un tel ticket, les PR ouvertes ne se lisent pas (#2188).
export const aExaminer = (ticket: TicketDuRail, enCuisine: ReadonlySet<number>): boolean =>
  ticket.epique !== true && !enCuisine.has(ticket.number) && !PRIS_AILLEURS.some((label) => ticket.labels.includes(label)) && tenuesDuChef().some((label) => ticket.labels.includes(label));

export async function renvoyerLesCiRouges({ github, station, prs, tickets, enCuisine }: OptionsDeLaCiRouge): Promise<BilanDeLaCiRouge> {
  const bilan: BilanDeLaCiRouge = { renvoyes: [], echecs: [] };
  for (const pr of prs) {
    const numero = ticketDeLaBranche(pr.branche);
    if (numero === null) continue;
    const ticket = tickets.find((t) => t.number === numero);
    if (ticket === undefined || !aExaminer(ticket, enCuisine)) continue;
    if (pr.number === undefined || pr.sha === undefined) {
      bilan.echecs.push({ ticket: numero, pr: pr.number ?? null, message: `the head of the open PR on \`${pr.branche}\` is not known: its CI is not read` });
      continue;
    }
    const { sha } = pr;
    try {
      const rouges = (await github.ci(sha)).filter((check) => check.outcome === "red");
      if (rouges.length === 0) continue;
      const siens = (await github.commentaires(numero)).filter((c) => c.association === undefined || DE_CONFIANCE.includes(c.association)).filter((c) => c.body.startsWith(MARQUE_DE_RENVOI));
      if (siens.some((c) => c.body.includes(marque(sha)))) continue;
      const leves = tenuesDuChef().filter((label) => ticket.labels.includes(label));
      // Les labels d'abord : un commentaire perdu laisse le ticket libre, à un
      // cook, sans sa raison — et l'échec est dit ; un label resté, lui, le
      // tiendrait pour le chef.
      for (const label of leves) await github.delabelliser(numero, label);
      const tenu = ` It was held for the chef (${leves.map((l) => `\`${l}\``).join(", ")}): a red CI is fixed by a cook, never merged by the chef, so the hold is lifted. If a product or design decision is still missing once the CI is green, say so again.`;
      await github.commenter(
        numero,
        `${MARQUE_DE_RENVOI} n=${siens.length + 1}${marque(sha)}-->\nStation \`${station}\`: sent back to a cook — ${RAISONS_DE_RENVOI.ci} \`${sha.slice(0, 7)}\`: ${rouges.map((c) => c.name).join(", ")}\n\nNo cook was working on PR #${pr.number}.${tenu} Fix the red checks on the branch, run the gates, and commit.`,
      );
      bilan.renvoyes.push({ ticket: numero, pr: pr.number, leves });
    } catch (erreur) {
      bilan.echecs.push({ ticket: numero, pr: pr.number, message: message(erreur) });
    }
  }
  return bilan;
}
