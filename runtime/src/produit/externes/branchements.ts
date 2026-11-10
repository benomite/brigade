// Les ports des issues venues d'ailleurs (`externes.ts`) branchés sur ce que
// le runtime a déjà : le `GitHub` du projet (`github.ts`, seul module qui lance
// `gh`), et la porte de TODO (`carte-todo.ts`, seul chemin vers le chef).
import { entrerDansTodo } from "../../carte-todo.ts";
import type { GitHub, IssueOuverte } from "../../github.ts";
import type { Journal } from "../../journal.ts";
import type { DepotDesExternes, IssueExterne, VersTodo } from "./externes.ts";

// Qui pose la carte, au journal.
export const AUTEUR = "product";

// Le dépôt des issues venues d'ailleurs, sur un `GitHub` qui lui est propre :
// le sondage des issues ouvertes (`ouvertes`) a sa confirmation à lui, et la
// partager volerait à un autre lecteur — le manager — les changements qu'il
// attend. L'auteur d'une issue ne change pas : il se lit une fois par issue.
export function depotDuGitHub(github: GitHub): DepotDesExternes {
  let derniere: IssueOuverte[] | null = null;
  const auteurs = new Map<number, string>();
  const auteur = async (numero: number) => {
    const connu = auteurs.get(numero);
    if (connu !== undefined) return connu;
    const lu = (await github.issue(numero))?.author ?? "";
    if (lu !== "") auteurs.set(numero, lu);
    return lu;
  };
  return {
    async ouvertes() {
      const sondage = await github.ouvertes();
      if (sondage.inchange) {
        if (derniere === null) throw new Error("the open issues are unchanged since a poll this reader never saw: its GitHub is shared with another reader");
      } else {
        derniere = sondage.issues;
        sondage.confirmer();
      }
      const issues: IssueExterne[] = [];
      for (const { number, title, createdAt, labels, url, body } of derniere) issues.push({ number, title, author: await auteur(number), createdAt, labels, url, body });
      return issues;
    },
    commentaires: async (numero) => (await github.commentaires(numero)).map(({ author, body }) => ({ author, body })),
    commenter: (numero, corps) => github.commenter(numero, corps),
    labelliser: (numero, labels) => github.labelliser(numero, labels),
    delabelliser: (numero, label) => github.delabelliser(numero, label),
    ecrireCorps: (numero, corps) => github.ecrireCorps(numero, corps),
    fermer: (numero) => github.fermerIssue(numero),
  };
}

// La carte qu'une issue venue d'ailleurs pose dans TODO quand elle changerait
// la direction du produit : sa raison, en une ligne, et la seule question
// qu'elle pose au chef. Les deux choix reprennent l'issue avec sa réponse,
// écrite sur l'issue (`reponse-carte.ts`) : rien d'autre ne lui est demandé.
export function carteDeDirection(issue: IssueExterne, raison: string) {
  return {
    type: "product",
    raison: "product-choice",
    resume: raison,
    enonce: `Should brigade take on issue #${issue.number}, opened by ${issue.author}?`,
    choix: [
      { texte: "Take it on as a product issue", suite: "resume" },
      { texte: "Decline it", suite: "resume" },
    ],
  };
}

// La porte de TODO, au journal du projet. Une carte que la porte refuse (une
// raison qui n'en tient pas la forme) va au triage, retenue : rien ne se perd.
export function todoDuJournal(journal: Journal, projet: string): VersTodo {
  return (issue, raison) => {
    entrerDansTodo(journal, projet, issue.number, carteDeDirection(issue, raison), AUTEUR);
  };
}
