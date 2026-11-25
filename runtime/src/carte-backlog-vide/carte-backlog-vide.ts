// La carte du backlog vide (#4225, épique #4131 ; règle 3 du processus simplifié,
// docs/superpowers/specs/2026-11-24-simplified-process.md) : quand plus aucune issue
// ouverte n'est à cuire — toutes sont des `idea`, parquées, servies ou absentes —, le
// manager le dit au chef par une seule carte. Les tours suivants dans le même état n'en
// posent pas d'autre ; une issue redevenue cuisinable réarme la carte, et le backlog vide
// de nouveau en pose une nouvelle.
//
// `creerCarteBacklogVide` est la règle, sans E/S ; `carteBacklogVideDuJournal`, la même
// branchée sur la porte de TODO (carte-todo.ts), comme la carte d'un check Windows
// (carte-ci-windows.ts) : la carte n'a pas d'issue, un numéro négatif en tient lieu.
import { A_LA_MAIN } from "../brigade-github.ts";
import { entrerDansTodo, sortirDeTodo } from "../carte-todo.ts";
import { LABEL_WAITING } from "../github-etat/etats.ts";
import { CHEF_TODO } from "../github-seul/carte-todo/carte-todo.ts";
import { MIS_DE_COTE } from "../github.ts";
import type { Journal } from "../journal.ts";

// Une issue ouverte du backlog, telle que le tour du manager la lit.
export type IssueDuBacklog = { number: number; labels: readonly string[] };

// Le label d'une idée en réserve : jamais cuite (#3536).
const IDEE = "idea";
// Les labels d'une issue parquée : `parked`, et ceux que le parking remplace (règle 13) —
// WAITING, mis de côté, `blocked-on-human`, `chef-todo`, `question`, `decision`.
export const LABELS_PARQUES: readonly string[] = ["parked", LABEL_WAITING, A_LA_MAIN, CHEF_TODO, "question", "decision", ...MIS_DE_COTE];

// Une issue que le manager peut cuire : ni une idée, ni parquée.
export const cuisinable = ({ labels }: IssueDuBacklog): boolean => !labels.includes(IDEE) && !labels.some((label) => LABELS_PARQUES.includes(label));

// Ce que la carte dit au chef, dans les mots du glossaire.
export const TEXTE_BACKLOG_VIDE = "Nothing is left to cook: every open issue in the backlog is an idea or parked, or none is open.";

export type OptionsCarteBacklogVide = {
  // Pose la carte devant le chef. Si elle lève, rien n'est tenu pour envoyé : le tour suivant la repose.
  envoyer: (texte: string) => void;
  // Une issue est de nouveau cuisinable après une carte : elle n'est plus vraie.
  retirer?: () => void;
  // La carte est déjà devant le chef au démarrage (relu du journal).
  envoyee?: boolean;
};

export type CarteBacklogVide = { boucle: (backlog: readonly IssueDuBacklog[]) => void };

// La règle : une carte par backlog vide, à chaque tour du manager qui lit les issues ouvertes.
export function creerCarteBacklogVide({ envoyer, retirer = () => {}, envoyee = false }: OptionsCarteBacklogVide): CarteBacklogVide {
  let posee = envoyee;
  return {
    boucle(backlog) {
      if (backlog.some(cuisinable)) {
        if (posee) {
          posee = false;
          retirer();
        }
        return;
      }
      if (posee) return;
      envoyer(TEXTE_BACKLOG_VIDE);
      posee = true;
    },
  };
}

// Le « ticket » de la carte : négatif, qu'aucune issue ne porte, hors de la plage des
// cartes de check (carte-ci-windows.ts, de -1 à -0x3fffffff).
export const TICKET_BACKLOG_VIDE = -0x40000000;
const AUTEUR = "manager";
// Pourquoi la carte sort de TODO quand une issue redevient cuisinable : la marque qui
// dit, au journal, la carte réarmée.
export const POURQUOI_REARMEE = "an issue in the backlog is cookable again";

// La carte est devant le chef, ou il y a répondu, depuis qu'elle a été réarmée.
export function carteDejaPosee(journal: Journal): boolean {
  const marques = journal.duTicket(TICKET_BACKLOG_VIDE).filter((e) => e.type === "todo.entered" || e.type === "todo.held" || e.type === "todo.answered" || e.type === "todo.left");
  const derniere = marques.at(-1);
  if (derniere === undefined) return false;
  return !(derniere.type === "todo.left" && derniere.payload.why === POURQUOI_REARMEE);
}

// La règle branchée sur la porte de TODO du projet : la carte entre par `entrerDansTodo`,
// sort par `sortirDeTodo`, et son état se relit du journal au démarrage — une carte dans
// TODO, retenue par le triage ou répondue n'est pas reposée.
export function carteBacklogVideDuJournal(journal: Journal, projet: string): CarteBacklogVide {
  return creerCarteBacklogVide({
    envoyee: carteDejaPosee(journal),
    envoyer(texte) {
      entrerDansTodo(journal, projet, TICKET_BACKLOG_VIDE, {
        type: "product",
        raison: "product-choice",
        resume: texte,
        enonce: "Will you open an issue for the cooks?",
        // Le ticket négatif : reponse-carte.ts note la réponse et sort la carte, rien d'autre ne bouge.
        choix: [
          { texte: "Yes, I will open one; the card clears when an issue is cookable", suite: "resume" },
          { texte: "Dismiss this card; it comes back the next time nothing is left to cook", suite: "drop" },
        ],
      }, AUTEUR);
    },
    retirer() {
      if (sortirDeTodo(journal, projet, TICKET_BACKLOG_VIDE, POURQUOI_REARMEE, AUTEUR)) return;
      journal.ajouter({ project: projet, ticket: TICKET_BACKLOG_VIDE, author: AUTEUR, type: "todo.left", payload: { why: POURQUOI_REARMEE } });
    },
  });
}
