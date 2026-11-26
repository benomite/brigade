// La porte de confiance (#4358) : sur un dépôt public, n'importe qui ouvre une issue ou écrit un
// commentaire, et les agents de la cuisine lisent ce texte. Un auteur est de confiance s'il est
// le chef, un collaborateur qui a l'écriture, ou un agent de la cuisine ; tout autre texte reste
// hors de ce qu'un agent reçoit.
//
// Le lien que GitHub nomme (`author_association`) ne suffit pas : un membre d'une organisation
// (`MEMBER`) peut n'avoir que la lecture. Pour les auteurs que ce lien ne met pas déjà dehors,
// la permission se lit par l'API (`permissionDe`), une fois par auteur et par client : le
// résultat est gardé. Une lecture qui échoue n'est pas gardée, et lève : l'appelant reprend
// au tour suivant, sans rien décider à sa place.
//
// Un client sans `permissionDe` (les doublures des tests) s'en tient au lien de GitHub, comme
// avant ce ticket.
import { DE_CONFIANCE } from "../alimenter.ts";
import { auteurInterne } from "../auteur-interne.ts";
import { ECRITURE, type Commentaire, type GitHub } from "../github.ts";

// Un agent de la cuisine : le robot du projet, ou une App de rôle (`<app>[bot]`), qu'un
// administrateur du dépôt seul installe.
export const agentDeLaCuisine = (login: string | undefined): boolean => login !== undefined && (auteurInterne(login) || login.toLowerCase().endsWith("[bot]"));

export type GitHubDeLaConfiance = Pick<GitHub, "commentaires" | "permissionDe">;
export type Auteur = { author?: string; association: string };

// Ce que chaque client a lu de chaque auteur : la porte de confiance, une par client, que le
// manager et la station partagent.
const lus = new WeakMap<object, Map<string, Promise<boolean>>>();

export function porteDeConfiance(github: GitHubDeLaConfiance) {
  let ecrivains = lus.get(github);
  if (ecrivains === undefined) {
    ecrivains = new Map();
    lus.set(github, ecrivains);
  }
  const gardes = ecrivains;
  const permission = (login: string): Promise<boolean> => {
    const cle = login.toLowerCase();
    const connue = gardes.get(cle);
    if (connue !== undefined) return connue;
    const lue = (async () => ECRITURE.includes(await (github.permissionDe as (login: string) => Promise<string>)(login)))();
    gardes.set(cle, lue);
    lue.catch(() => gardes.delete(cle));
    return lue;
  };
  // L'auteur a-t-il l'écriture, ou est-il un agent de la cuisine ?
  const deConfiance = async ({ author, association }: Auteur): Promise<boolean> => {
    if (agentDeLaCuisine(author)) return true;
    if (!DE_CONFIANCE.includes(association)) return false;
    if (github.permissionDe === undefined) return true;
    if (author === undefined || author === "") return false;
    return permission(author);
  };
  // Les commentaires de confiance d'une liste, dans son ordre.
  const garder = async <C extends Auteur>(commentaires: readonly C[]): Promise<C[]> => {
    const surs = await Promise.all(commentaires.map(deConfiance));
    return commentaires.filter((_, rang) => surs[rang]);
  };
  return {
    deConfiance,
    garder,
    // Les commentaires d'une issue qu'un agent peut lire.
    commentaires: async (numero: number): Promise<Commentaire[]> => garder(await github.commentaires(numero)),
  };
}

export type PorteDeConfiance = ReturnType<typeof porteDeConfiance>;
