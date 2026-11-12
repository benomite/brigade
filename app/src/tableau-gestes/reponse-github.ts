// La réponse du chef à une carte du chef lue de GitHub (#2434) : un clic sur un choix, ou son
// texte, joué par l'app elle-même sur GitHub, avec le jeton du `gh` de ce poste — celui du chef. Ni box, ni tableau de la
// cuisine, ni station : GitHub est le seul état.
//
// La carte est celle que la dernière lecture porte (tableau/todo-github.ts, `formeDuChef`) : sa question, ses choix
// `- [<geste>] <libellé>`. La réponse se contrôle comme celle de toute carte de TODO (carte-todo.ts, `reponseLue`), puis :
//   1. un commentaire est posté sur l'issue : `<!-- brigade:reponse gesture=<geste> -->`, puis le libellé du choix, ou le
//      texte du chef — il reste dans l'issue, c'est là que le cook le lit ;
//   2. le geste est joué :
//      - `resume` (un choix, ou tout texte libre) : `served-elsewhere`, `blocked-on-human` et `chef-todo` retirés — le ticket revient sur le rail ;
//      - `merge` : la PR que la carte nomme est mergée — celle que le libellé du choix nomme (`#N`), sinon la PR ouverte
//        du ticket ; aucune, rien ne part. `blocked-on-human` est retiré : la mise de côté de la station levée (#3368) ;
//      - `drop` : `fire` retiré — le ticket sort du rail, son issue reste ouverte ;
//      - `close` : l'issue est fermée ;
//      - `rail` : le label `prio:N` que le libellé du choix nomme (sinon `fire`) est posé — l'issue d'un inconnu entre sur le rail.
//      Chaque geste retire aussi `chef-todo` : répondue, la question n'attend plus le chef.
// La carte quitte TODO à la lecture suivante : ses labels ont changé, et une question que suit une réponse n'en pose plus
// (tableau/mise-de-cote-github.ts).
import { carteLueDuChef, reponseLue, type Rendu } from "../carte-todo.ts";
import type { MethodeDEcriture } from "../priorite.ts";
import type { AppelGitHub, ReponseGitHub } from "../tableau/client.ts";
import { BLOCKED_ON_HUMAN, SERVED_ELSEWHERE } from "../tableau/mise-de-cote-github.ts";
import { ticketDeLaPR } from "../tableau/rail-github.ts";
import { LABEL_DU_CHEF, type CarteDuChef, type GesteDuChef } from "../tableau/todo-github.ts";
import { refusDe } from "../tableau/client.ts";

// Le client : les lectures par le `GET` du tableau (client.ts), les écritures avec le même jeton — celui des labels de
// priorité (priorite.ts, `clientDeLaPriorite`).
export type ClientDeLaReponse = { lire: AppelGitHub; ecrire: (methode: MethodeDEcriture, chemin: string, corps?: unknown) => Promise<ReponseGitHub> };

const LABEL_FIRE = "fire";
// Ce que chaque geste retire de l'issue, en plus de jouer ce qu'il joue.
const RETIRES: Readonly<Record<GesteDuChef, readonly string[]>> = {
  // Le ticket revient sur le rail : la mise de côté, de la station ou du manager, est levée (#3369).
  resume: [SERVED_ELSEWHERE, BLOCKED_ON_HUMAN, LABEL_DU_CHEF],
  // Mergée, la livraison mise de côté parce qu'elle touche à ce qui la juge n'est plus retenue (#3368).
  merge: [BLOCKED_ON_HUMAN, LABEL_DU_CHEF],
  drop: [LABEL_FIRE, LABEL_DU_CHEF],
  close: [LABEL_DU_CHEF],
  rail: [LABEL_DU_CHEF],
};

// Le commentaire de la réponse : sa marque, puis le libellé du choix, ou le texte du chef.
export const commentaireDeReponse = (geste: GesteDuChef, dite: string): string => `<!-- brigade:reponse gesture=${geste} -->\n${dite}`;

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const objet = (valeur: unknown): Record<string, unknown> => (typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : {});

// La PR ouverte que la carte nomme : le `#N` du libellé du choix, s'il nomme une PR ouverte ; sinon celle dont la branche
// ou le corps nomme le ticket (rail-github.ts, `ticketDeLaPR`). Rien : nulle.
async function prNommee(depot: string, ticket: number, libelle: string, client: ClientDeLaReponse): Promise<number | null> {
  const nommee = /#(\d+)\b/.exec(libelle)?.[1];
  if (nommee !== undefined) {
    const lue = await client.lire(`/repos/${depot}/pulls/${nommee}`);
    if (lue.status === 200 && objet(lue.data).state === "open") return Number(nommee);
  }
  const ouvertes = await client.lire(`/repos/${depot}/pulls?state=open&per_page=100`);
  if (ouvertes.status !== 200) throw refusDe("the reading of the open PRs", ouvertes);
  const liste = Array.isArray(ouvertes.data) ? (ouvertes.data as unknown[]).map(objet) : [];
  const sienne = liste.find((pr) => typeof pr.number === "number" && ticketDeLaPR(String(objet(pr.head).ref ?? ""), typeof pr.body === "string" ? pr.body : "") === ticket);
  return sienne === undefined ? null : (sienne.number as number);
}

// Le geste joué sur l'issue de `ticket` — ce qu'il dit fait, ou l'erreur de GitHub.
async function jouer(depot: string, ticket: number, geste: GesteDuChef, pr: number | null, libelle: string, client: ClientDeLaReponse): Promise<string> {
  const issue = `/repos/${depot}/issues/${ticket}`;
  let fait = "";
  if (geste === "merge" && pr !== null) {
    const mergee = await client.ecrire("PUT", `/repos/${depot}/pulls/${pr}/merge`, { merge_method: "merge" });
    if (mergee.status !== 200) throw refusDe(`the merge of PR #${pr}`, mergee);
    fait = `PR #${pr} merged`;
  }
  if (geste === "close") {
    const fermee = await client.ecrire("PATCH", issue, { state: "closed", state_reason: "not_planned" });
    if (fermee.status !== 200) throw refusDe(`the closing of #${ticket}`, fermee);
    fait = `#${ticket} closed`;
  }
  if (geste === "rail") {
    // L'issue d'un inconnu : le `prio:` que le choix nomme, sinon `fire`, comme « on the rail » du runtime.
    const label = /\bprio:([1-9])\b/.exec(libelle)?.[0] ?? LABEL_FIRE;
    const posee = await client.ecrire("POST", `${issue}/labels`, { labels: [label] });
    if (posee.status !== 200) throw refusDe(`the \`${label}\` label`, posee);
    fait = `\`${label}\` put on #${ticket}`;
  }
  const retires: string[] = [];
  for (const label of RETIRES[geste]) {
    const retire = await client.ecrire("DELETE", `${issue}/labels/${encodeURIComponent(label)}`);
    // Une issue qui ne le porte pas : rien à retirer.
    if (retire.status === 200) retires.push(`\`${label}\``);
    else if (retire.status !== 404) throw refusDe(`the removal of \`${label}\``, retire);
  }
  const dits = [fait, retires.length === 0 ? "" : `${retires.join(" and ")} removed`].filter((dit) => dit !== "");
  return dits.length === 0 ? "nothing else to change on the issue" : dits.join(", ");
}

// La réponse du chef à la carte du chef de `ticket` — `chef`, celle que la dernière lecture porte —, jouée sur GitHub.
// Rien ne part pour une carte inconnue, changée, une réponse vide, ni un merge sans PR à merger. Le commentaire posté, un
// geste que GitHub refuse se dit : la réponse est écrite, le geste est à faire sur GitHub.
export async function repondreSurGithub({ depot, ticket, chef, reponse, client }: { depot: string; ticket: unknown; chef: CarteDuChef | undefined; reponse: unknown; client: ClientDeLaReponse }): Promise<Rendu> {
  const connue = chef === undefined ? undefined : carteLueDuChef(chef);
  const lue = reponseLue(connue, ticket, reponse);
  if ("refus" in lue) return lue;
  const choisi = "choix" in lue ? connue?.choix[lue.choix - 1] : undefined;
  const geste = (choisi?.suite ?? "resume") as GesteDuChef;
  let pr: number | null = null;
  if (geste === "merge") {
    try {
      pr = await prNommee(depot, lue.ticket, choisi?.texte ?? "", client);
    } catch (erreur) {
      return { refus: `nothing was sent: the PR to merge for #${lue.ticket} was not read on GitHub`, detail: message(erreur) };
    }
    if (pr === null) return { refus: `nothing was sent: no open PR names #${lue.ticket} — the card has nothing to merge`, detail: "" };
  }
  let commentaire: number;
  try {
    const posee = await client.ecrire("POST", `/repos/${depot}/issues/${lue.ticket}/comments`, { body: commentaireDeReponse(geste, choisi?.texte ?? ("texte" in lue ? lue.texte : "")) });
    if (posee.status !== 201) throw refusDe("the comment", posee);
    const id = objet(posee.data).id;
    commentaire = typeof id === "number" ? id : 0;
  } catch (erreur) {
    return { refus: `nothing was sent: your answer was not posted on #${lue.ticket}`, detail: message(erreur) };
  }
  try {
    const fait = await jouer(depot, lue.ticket, geste, pr, choisi?.texte ?? "", client);
    return { repondue: true, dit: `answer posted on #${lue.ticket} (${geste}): ${fait}`, commentaire };
  } catch (erreur) {
    return { refus: `your answer is posted on #${lue.ticket}, but its gesture (${geste}) was not played — play it on GitHub`, detail: message(erreur) };
  }
}
