// Qui est de confiance (#4421) ? Sur un dépôt public, n'importe qui ouvre une
// issue ou écrit un commentaire, et les cooks, le manager et le reviewer lisent
// ce texte. Un auteur de confiance est le chef, un collaborateur qui a
// l'écriture sur le dépôt, ou un agent de la cuisine. Ce module le dit, auteur
// par auteur, et retient la réponse : le même auteur n'est demandé qu'une fois.
//
// Un agent de la cuisine est le robot du projet (`auteur-interne.ts`, la règle
// que le manager suit déjà) ; les identités des rôles écrivent sur le dépôt, et
// GitHub leur donne l'écriture. Le droit se lit par l'API des collaborateurs
// (`repos/<dépôt>/collaborators/<login>/permission`, `github.ts`).
import { auteurInterne } from "../auteur-interne.ts";

// Les droits GitHub qui donnent l'écriture sur le dépôt.
const ECRITURE = ["admin", "maintain", "write"];

export const aLaMain = (permission: string): boolean => ECRITURE.includes(permission);

type OptionsConfiance = {
  // Le login du chef, ou de quoi le résoudre (`chef/chef.ts`) ; null s'il n'est pas connu.
  chef: string | null | (() => Promise<string | null>);
  // Le droit de ce compte sur le dépôt, tel que GitHub le dit (`permissionSurLeDepot`).
  permission: (login: string) => Promise<string>;
  // Une lecture qui échoue : l'auteur n'est pas de confiance cette fois, et la réponse n'est pas retenue.
  avertir?: (ligne: string) => void;
};

export type Confiance = { isTrusted(author: string): Promise<boolean> };

const meme = (x: string, y: string) => x.toLowerCase() === y.toLowerCase();

export function creerConfiance(options: OptionsConfiance): Confiance {
  // Une réponse par auteur, retenue dès la question : des questions simultanées partagent la même lecture.
  const reponses = new Map<string, Promise<boolean>>();
  const leChef = async () => (typeof options.chef === "function" ? options.chef() : options.chef);
  const juger = async (author: string) => {
    if (auteurInterne(author)) return true;
    const chef = await leChef();
    if (chef !== null && chef !== "" && meme(chef, author)) return true;
    return aLaMain(await options.permission(author));
  };
  return {
    isTrusted(author) {
      if (author === "") return Promise.resolve(false);
      const cle = author.toLowerCase();
      const connue = reponses.get(cle);
      if (connue !== undefined) return connue;
      // Sans réponse de GitHub, l'auteur n'est pas de confiance — jamais l'inverse —, et la question se reposera.
      const reponse = juger(author).catch((erreur: unknown) => {
        reponses.delete(cle);
        options.avertir?.(`brigade : confiance de ${author} non lue, tenu pour inconnu — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
        return false;
      });
      reponses.set(cle, reponse);
      return reponse;
    },
  };
}
