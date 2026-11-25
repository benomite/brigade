// La carte du backlog vide (#4225) branchée sur la porte de TODO du projet, comme la carte
// d'un check Windows (carte-ci-windows.ts) : la carte n'a pas d'issue, un numéro négatif en
// tient lieu. Elle entre par `entrerDansTodo`, sort par `sortirDeTodo` quand une issue
// redevient cuisinable, et son état se relit du journal au démarrage : une carte dans TODO,
// retenue par le triage ou à laquelle le chef a répondu n'est pas reposée.
import { entrerDansTodo, sortirDeTodo } from "../carte-todo.ts";
import type { Journal } from "../journal.ts";
import { creerCarteBacklogVide, type IssueDuBacklog } from "./carte-backlog-vide.ts";

// Le « ticket » de la carte : négatif, qu'aucune issue ne porte, hors de la plage des
// cartes de check (carte-ci-windows.ts, de -1 à -0x3fffffff).
const TICKET_BACKLOG_VIDE = -0x40000000;
const AUTEUR = "manager";
// Pourquoi la carte sort de TODO quand une issue redevient cuisinable : la marque qui
// dit, au journal, la carte réarmée.
const POURQUOI_REARMEE = "an issue in the backlog is cookable again";

// La carte est devant le chef, ou il y a répondu, depuis qu'elle a été réarmée.
function carteDejaPosee(journal: Journal): boolean {
  const marques = journal.duTicket(TICKET_BACKLOG_VIDE).filter((e) => e.type === "todo.entered" || e.type === "todo.held" || e.type === "todo.answered" || e.type === "todo.left");
  const derniere = marques.at(-1);
  if (derniere === undefined) return false;
  return !(derniere.type === "todo.left" && derniere.payload.why === POURQUOI_REARMEE);
}

// La règle du projet, que le tour du manager sert à chaque lecture des issues ouvertes.
export function carteBacklogVideDuJournal(journal: Journal, projet: string): { boucle: (backlog: readonly IssueDuBacklog[]) => void } {
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
