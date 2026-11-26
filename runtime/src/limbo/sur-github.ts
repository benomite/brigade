// La réparation des limbes (reparer.ts, #4215) sur GitHub : les tickets du tour, relus par le client de la station,
// la carte `chef-todo` (github-seul/carte-todo/carte-todo.ts) et le label `parked`. La guérison de chaque tour la
// joue (guerison/index.ts).
import { DE_CONFIANCE, LABEL_PARKED } from "../attente-github/marque.ts";
import { estParque } from "../github-etat/etats.ts";
import { poserCarte, type GitHubDesCartes } from "../github-seul/carte-todo/carte-todo.ts";
import { calibre, reparerLesLimbes, type TicketDesLimbes } from "./reparer.ts";

// Ce que la réparation demande au client GitHub de la station.
export type GitHubDesLimbesDuTour = GitHubDesCartes;

// La ligne d'une réponse sur la carte, dans la forme que l'app lit (manager.ts, `lignesDeLaCarte`).
const ligneDeReponse = (reponse: string) => `- [${/^close it\b/i.test(reponse) ? "close" : /^wait for\b/i.test(reponse) ? "wait" : "resume"}] ${reponse}`;

/**
 * La réparation sur GitHub, pour les tickets du tour. Seuls ceux qui peuvent être en limbes — ouverts, sans calibrage,
 * ni parqués, ni carte (`chef-todo`), ni `decision` — se relisent : leurs commentaires d'un auteur du dépôt, qui seuls
 * font foi. La carte est une carte `product-question` (`poserCarte`) ; l'attente, le label `parked` et son commentaire.
 */
export async function reparerLesLimbesSurGitHub(github: GitHubDesLimbesDuTour, tickets: readonly { number: number; state: string; labels: string[] }[], maintenant?: () => Date): Promise<void> {
  const candidats = tickets.filter((t) => t.state === "open" && !calibre(t.labels) && !estParque(t.labels));
  if (candidats.length === 0) return;
  await reparerLesLimbes({
    github: {
      listerTickets: async () => {
        const lus: TicketDesLimbes[] = [];
        for (const t of candidats) {
          const commentaires = (await github.commentaires(t.number)).filter(({ association }) => DE_CONFIANCE.includes(association));
          lus.push({ numero: t.number, etat: "open", etiquettes: [...t.labels], commentaires: commentaires.map(({ body }) => ({ corps: body })) });
        }
        return lus;
      },
      ajouterEtiquette: (numero, nom) => github.labelliser(numero, [nom]),
      retirerEtiquette: (numero, nom) => github.delabelliser(numero, nom),
      commenter: (numero, corps) => github.commenter(numero, corps),
    },
    cartes: {
      // Une carte de TODO, c'est `chef-todo` sur l'issue, et un candidat ne le porte pas (`estParque`) : aucune carte ne
      // l'attend. Celle que ce tour pose porte le label au tour suivant, qui ne le relit donc plus.
      lister: async () => [],
      poser: async ({ numero, question, choix }) => {
        await poserCarte(numero, { sorte: "product-question", texte: [question, "", ...choix.map(ligneDeReponse)].join("\n") }, github);
      },
    },
    labelDAttente: LABEL_PARKED,
    ...(maintenant === undefined ? {} : { maintenant }),
  });
}
