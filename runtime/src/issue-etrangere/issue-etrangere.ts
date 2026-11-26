// L'issue d'un auteur qui n'est pas de confiance — ni le chef, ni un compte qui a
// l'écriture sur le dépôt, ni un agent de la cuisine (`trust/trust.ts`) — est
// retenue (#4422). Son texte est celui d'un inconnu : aucun agent ne le lit. Avant,
// le manager le lisait pour proposer un tri (#2934) — un texte étranger donné à un
// agent : ce n'est plus le cas. Elle n'est ni jugée, ni mise sur le rail, ni donnée
// à un cook, au manager ou au reviewer ; la cuisine y pose seulement une carte de
// TODO (`product-question`), assignée à l'humain `product` du projet (#2760) — au
// chef s'il n'en déclare pas —, qui ne recopie rien de l'issue.
//
// Sa réponse, un commentaire sur l'issue, de l'humain `product` ou d'un auteur de
// confiance :
//   - `accept` (ou `on the rail`, la réponse d'avant) — l'issue est acceptée :
//     l'accord est gardé (`trust/acceptes.ts`), la carte levée, et le manager la
//     juge au tour suivant, comme toute autre ;
//   - `close` — la cuisine ferme l'issue.
// Le bouton de l'app (`[rail]`) y pose `fire` de la main du chef : un label d'un
// membre de confiance, qui la lance aussi (#2619). Tout autre commentaire n'est
// pas une réponse : la carte attend toujours.
//
// Chaque pas se relit avant d'écrire : une station qui tombe au milieu laisse au
// tour suivant le pas qui manque, sans rien doubler.
import { aiguiller, type Humain } from "../aiguillage-humains/aiguillage.ts";
import { DE_CONFIANCE } from "../alimenter.ts";
import type { Commentaire, GitHub, IssueOuverte } from "../github.ts";
import { leverCarte, marqueur, poserCarte, type Carte } from "../github-seul/carte-todo/carte-todo.ts";
import type { Acceptes } from "../trust/acceptes.ts";

// La sorte de la carte : une question de produit, que l'aiguillage donne à
// l'humain `product` (`aiguillage-humains/aiguillage.ts`).
export const SORTE_DE_LA_CARTE = "product-question" as const;

// La réponse de l'humain : acceptée, ou fermée.
export type ReponseDuProduit = { geste: "accept"; par: string } | { geste: "close"; par: string };

// Le commentaire d'une réponse appliquée par le tri d'avant (#2934) : l'issue est déjà au chef.
const MARQUE_APPLIQUEE = /^<!-- brigade:triage-applied /m;
// La réponse que l'app poste quand le chef clique `[rail]` (`app/src/tableau-gestes/reponse-github.ts`).
const REPONSE_RAIL_DE_L_APP = /^<!-- brigade:reponse gesture=rail -->/;

// GitHub ne distingue pas la casse d'un login.
const meme = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// La carte : sa question sur sa première ligne, ses deux choix, puis qui l'a
// ouverte. Rien du titre ni du corps de l'issue : ce commentaire est celui de la
// cuisine, que ses agents lisent comme de confiance.
// `declare` : l'auteur est un humain que le projet déclare (`humans`), pas un inconnu.
export function carteDeLIssueRetenue(numero: number, issue: { auteur?: string; declare?: boolean } = {}): Carte {
  const declare = issue.declare === true;
  const auteur = issue.auteur === undefined || issue.auteur === "" ? null : `@${issue.auteur}`;
  const qui = declare
    ? `Opened by ${auteur}, a declared human of the project without write access.`
    : auteur === null
      ? "Opened by a stranger."
      : `Opened by ${auteur}, a stranger.`;
  return {
    sorte: SORTE_DE_LA_CARTE,
    texte: [
      `${declare ? "Issue" : "Stranger's issue"} #${numero}: accept it, or close it?`,
      "",
      "- [rail] Accept it: the manager judges it like any other issue",
      "- [close] Close it",
      "",
      qui,
      "No agent has read it: read it on GitHub before you answer.",
      "",
      `Until you answer, no agent reads #${numero} and nothing of it reaches the rail. You can also answer on the issue with one line: \`accept\`, or \`close\`.`,
    ].join("\n"),
  };
}

// Le geste qu'un commentaire écrit, ou nul : sa première ligne, ou la réponse `[rail]` de l'app.
export function gesteDuCommentaire(body: string): ReponseDuProduit["geste"] | null {
  if (REPONSE_RAIL_DE_L_APP.test(body)) return "accept";
  if (body.includes("<!-- brigade:")) return null;
  const ligne = (body.split("\n").find((lue) => lue.trim() !== "") ?? "").replace(/[`*_>]/g, "").trim().toLowerCase();
  if (/^close\b/.test(ligne)) return "close";
  if (/^(accept|on the rail)\b/.test(ligne)) return "accept";
  return null;
}

// La réponse de l'humain parmi ces commentaires — ceux qui suivent la carte —,
// la plus récente qui se lise. Fait foi : l'humain à qui la carte va, ou un
// auteur de confiance (`deConfiance`).
export async function reponseDuProduit(commentaires: readonly Commentaire[], humain: string | null, deConfiance: (commentaire: Commentaire) => Promise<boolean>): Promise<ReponseDuProduit | null> {
  for (const commentaire of [...commentaires].reverse()) {
    const geste = gesteDuCommentaire(commentaire.body);
    if (geste === null) continue;
    if ((humain !== null && meme(commentaire.author, humain)) || (await deConfiance(commentaire))) return { geste, par: commentaire.author };
  }
  return null;
}

// Ce que la retenue demande au manager. Aucun agent.
export type AtelierDuTri = {
  github: Pick<GitHub, "commentaires" | "commenter" | "issue" | "labelliser" | "delabelliser" | "fermerIssue" | "assigner">;
  // Où l'accord du chef est gardé ; null : le fichier est illisible, et rien ne s'accepte.
  acceptes: Acceptes | null;
  // Un commentaire d'un auteur de confiance — la porte de `trust/`, sinon le lien de l'auteur au dépôt.
  deConfiance: (commentaire: Commentaire) => Promise<boolean>;
  arrete: () => boolean;
  avertir: (message: string) => void;
  // Les humains du projet (`humans` de ses réglages), relus à chaque carte.
  humains: () => Humain[];
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

export function ouvrirIssuesEtrangeres(atelier: AtelierDuTri) {
  const { github, avertir, arrete } = atelier;
  // Les issues dont la carte attend l'humain, à l'instant de leur dernière
  // modification : tant qu'elle ne change pas, rien n'est à relire. Cache, pas
  // état : le perdre coûte une lecture des commentaires.
  const enAttente = new Map<number, string>();

  // Pose la carte, assignée à l'humain `product` s'il y en a un — avant la
  // carte : un arrêt entre les deux rejoue l'assignation, sans doubler.
  const poser = async (issue: IssueOuverte) => {
    const numero = issue.number;
    const aiguillage = aiguiller(atelier.humains(), SORTE_DE_LA_CARTE);
    if (aiguillage.vers === "humain") await github.assigner?.(numero, [aiguillage.login]);
    // L'auteur : celui que la liste des ouvertes dit, sinon la lecture de l'issue.
    // Une lecture qui échoue fait reprendre le pas au tour suivant.
    const auteur = issue.author ?? (await github.issue(numero))?.author;
    const declare = auteur !== undefined && atelier.humains().some(({ login }) => meme(login, auteur));
    await poserCarte(numero, carteDeLIssueRetenue(numero, { ...(auteur === undefined ? {} : { auteur }), declare }), github);
  };

  // Applique la réponse : la carte levée d'abord — un arrêt après elle relit la
  // réponse au tour suivant et la rejoue —, puis l'accord gardé ou la fermeture,
  // puis le commentaire qui le dit.
  const appliquer = async (numero: number, reponse: ReponseDuProduit): Promise<"fait" | "reste"> => {
    if (reponse.geste === "accept" && atelier.acceptes === null) {
      avertir(`brigade : l'issue #${numero} est acceptée par @${reponse.par}, mais l'accord ne peut pas se garder (éléments acceptés illisibles) — elle reste retenue`);
      return "reste";
    }
    await leverCarte(numero, github, SORTE_DE_LA_CARTE);
    if (reponse.geste === "close") {
      await github.fermerIssue(numero);
      await github.commenter(numero, `<!-- brigade:held-applied geste=close -->\n**Closed**, as @${reponse.par} answered on the TODO card.`);
      return "fait";
    }
    atelier.acceptes?.accept({ kind: "issue", id: numero });
    await github.commenter(numero, `<!-- brigade:held-applied geste=accept -->\n**Accepted** by @${reponse.par} on the TODO card: the manager judges #${numero} like any other issue.`);
    return "fait";
  };

  return {
    // Sert l'issue retenue. `fait` : rien n'y reste à faire avant que l'humain
    // réponde, ou sa réponse est appliquée ; `reste` : un pas a échoué, et se
    // refait au tour suivant.
    async traiter(issue: IssueOuverte): Promise<"fait" | "reste"> {
      if (enAttente.get(issue.number) === issue.updatedAt) return "fait";
      enAttente.delete(issue.number);
      try {
        const lus = await github.commentaires(issue.number);
        // Les marques de la cuisine, comme les cartes les lisent (`carte-todo.ts`) : du dépôt, jamais d'un inconnu.
        const deLaCuisine = (lu: Commentaire) => DE_CONFIANCE.includes(lu.association);
        // Déjà appliquée par le tri d'avant (#2934) : l'issue est au chef, comme toute autre.
        if (lus.some((lu) => deLaCuisine(lu) && MARQUE_APPLIQUEE.test(lu.body))) return "fait";
        const carte = lus.findLastIndex((lu) => deLaCuisine(lu) && lu.body.startsWith(marqueur(SORTE_DE_LA_CARTE)));
        if (carte === -1) {
          if (arrete()) return "reste";
          await poser(issue);
          return "fait";
        }
        const aiguillage = aiguiller(atelier.humains(), SORTE_DE_LA_CARTE);
        const reponse = await reponseDuProduit(lus.slice(carte + 1), aiguillage.vers === "humain" ? aiguillage.login : null, atelier.deConfiance);
        if (reponse === null) {
          enAttente.set(issue.number, issue.updatedAt);
          return "fait";
        }
        const fait = await appliquer(issue.number, reponse);
        if (fait === "reste") enAttente.set(issue.number, issue.updatedAt);
        return fait;
      } catch (erreur) {
        if (!arrete()) avertir(`brigade : issue retenue #${issue.number}, d'un auteur qui n'est pas de confiance, reprise au tour suivant — ${message(erreur)}`);
        return "reste";
      }
    },
  };
}
