// Le ticket qu'ouvre le choix `setup-brings-it` (#1534) : le chef laisse au
// projet le soin d'apporter ce qui manque à la station, et la station pose sur
// le projet le ticket qui demande à son setup de worktree de l'apporter
// lui-même — pour une base de données, démarrer la sienne —, sans rien
// installer sur la station.
//
// Un seul par choix. Sa création est annoncée au journal avant l'appel à
// GitHub (`need.ticket-opening`) : la réponse perdue, ou la station arrêtée
// entre les deux, l'issue se retrouve par sa marque au lieu d'être ouverte deux
// fois (comme le ticket de budget, `budget-des-gates.ts`). Ouverte, elle est
// notée (`need.ticket-opened`) ; le choix l'oublie quand il est abandonné.
import { mkdirSync } from "node:fs";
import { DE_CONFIANCE } from "../../alimenter.ts";
import { SCRIPT_SETUP } from "../../gates.ts";
import { LABEL, type GitHub } from "../../github.ts";
import { ouvrirJournal, type Journal } from "../../journal.ts";
import type { Auteur } from "../blocages/blocages.ts";
import { choixDuJournal, PROJET, ticketsDesChoix, type Choix } from "./besoins.ts";
import { besoinNomme } from "./catalogue.ts";

// Le calibrage du ticket : il lit un setup qu'il ne connaît pas, et éprouve
// ce qu'il y ajoute — comme le ticket qui prépare le dépôt.
export const LABELS_DU_BESOIN = [LABEL, "model:opus", "effort:high"];

// L'issue retrouvée d'une annonce : créée depuis, avec cette marge.
const MARGE_MS = 600_000;

// La marque d'un tel ticket : le projet, le besoin, et le numéro de l'annonce
// au journal — c'est elle qui retrouve l'issue d'une création dont la réponse
// s'est perdue, et pas celle d'une annonce d'avant.
const MARQUE = /^\s*<!--\s*brigade:need-setup (\S+) (\S+) (\d+)\s*-->\s*$/m;
export const marqueDuBesoin = (projet: string, besoin: string, annonce: number) => `<!-- brigade:need-setup ${projet} ${besoin} ${annonce} -->`;
export function annonceDuBesoin(corps: string, projet: string, besoin: string): number | null {
  const lue = MARQUE.exec(corps);
  return lue !== null && lue[1] === projet && lue[2] === besoin ? Number(lue[3]) : null;
}

const nomDe = (choix: Choix) => besoinNomme(choix.need)?.nom ?? choix.need;

export const titreDuBesoin = (projet: string, choix: Choix) => `Make the worktree setup of ${projet} bring ${nomDe(choix)} itself`;

export function corpsDuBesoin(projet: string, choix: Choix, annonce: number): string {
  const besoin = besoinNomme(choix.need);
  const nom = nomDe(choix);
  return [
    marqueDuBesoin(projet, choix.need, annonce),
    "",
    "## Context",
    "",
    `${choix.message} ${choix.cause}`,
    "",
    `The chef chose that the project brings it itself: its worktree setup (\`${SCRIPT_SETUP}\`) must provide ${nom} to the tests on its own, so nothing is installed on the station.${besoin === null ? "" : ` For instance, ${besoin.apporte.comment}.`}`,
    "",
    "## Acceptance criteria",
    "",
    `- \`${SCRIPT_SETUP}\` provides ${nom} to the tests by itself, on a station that does not have it, under the account the kitchen cooks with: no system package, no service, no \`sudo\`.`,
    `- The tests that need ${nom} run against what the setup provides: none of them is skipped or faked for lack of it.`,
    "- Two worktrees set up side by side each get their own (directory, port), and what the setup starts does not outlive what it serves.",
    `- The setup still works where ${nom} is already provided.`,
    "",
    "---",
    "",
    `_Opened by the kitchen when the chef chose "The project's setup brings it itself" for the need \`${choix.need}\` of ${projet}. Calibrated \`opus\` / \`high\`. One per choice: choosing it again opens no other._`,
  ].join("\n");
}

// Un choix qui attend son ticket : laissé au projet, et sans ticket ouvert.
export const attendSonTicket = (choix: Choix): boolean => choix.status === "chosen" && choix.selected === PROJET && choix.ticket === undefined;

export type OptionsTicketDuBesoin = {
  journal: Journal;
  github: Pick<GitHub, "creerIssue" | "issuesDepuis">;
  auteur: Auteur;
};

// Ouvre le ticket de chaque choix laissé au projet qui n'en a pas encore.
// Rend ceux qu'elle a ouverts, ou retrouvés. Lève sur une panne de GitHub :
// rien n'est noté que l'annonce, et l'appel suivant reprend là.
export async function ouvrirLesTicketsDesBesoins({ journal, github, auteur }: OptionsTicketDuBesoin): Promise<Array<{ id: string; ticket: number; ouvert: boolean }>> {
  const { projet } = auteur;
  const ouverts: Array<{ id: string; ticket: number; ouvert: boolean }> = [];
  for (const choix of choixDuJournal(journal.base).filter(attendSonTicket)) {
    // Annoncé, sans suite : l'issue a peut-être été créée, sa réponse perdue.
    let annonce = ticketsDesChoix(journal.base).get(choix.id) ?? null;
    let numero: number | undefined;
    if (annonce !== null) {
      const { annonce: seq } = annonce;
      const recentes = await github.issuesDepuis(new Date(Date.parse(annonce.annonceLe) - MARGE_MS).toISOString());
      // La marque ne vaut que sur une issue de confiance : n'importe qui peut en
      // ouvrir une qui la porte.
      numero = recentes.find((issue) => DE_CONFIANCE.includes(issue.association) && annonceDuBesoin(issue.body, projet, choix.need) === seq)?.number;
    } else {
      const ecrite = journal.ajouter({ project: projet, ticket: null, author: auteur.auteur, type: "need.ticket-opening", payload: { id: choix.id, need: choix.need } });
      if (ecrite === null) throw new Error(`annonce du ticket de ${choix.id} non écrite`);
      annonce = { need: choix.need, annonce: ecrite.seq, annonceLe: ecrite.at, ticket: null };
    }
    const retrouve = numero !== undefined;
    numero ??= await github.creerIssue({ titre: titreDuBesoin(projet, choix), corps: corpsDuBesoin(projet, choix, annonce.annonce), labels: LABELS_DU_BESOIN });
    journal.ajouter({ project: projet, ticket: null, author: auteur.auteur, type: "need.ticket-opened", payload: { id: choix.id, need: choix.need, ticket: numero, reconciled: retrouve } });
    ouverts.push({ id: choix.id, ticket: numero, ouvert: !retrouve });
  }
  return ouverts;
}

// De même, sur le journal du répertoire d'état d'un projet. GitHub n'est
// ouvert que s'il y a un ticket à ouvrir.
export async function ouvrirLesTicketsDans(repertoireEtat: string, auteur: Auteur, github: () => OptionsTicketDuBesoin["github"] & { fermer(): void }): Promise<Array<{ id: string; ticket: number; ouvert: boolean }>> {
  mkdirSync(repertoireEtat, { recursive: true });
  const journal = ouvrirJournal(repertoireEtat);
  try {
    if (!choixDuJournal(journal.base).some(attendSonTicket)) return [];
    const ouvert = github();
    try {
      return await ouvrirLesTicketsDesBesoins({ journal, github: ouvert, auteur });
    } finally {
      ouvert.fermer();
    }
  } finally {
    journal.fermer();
  }
}
