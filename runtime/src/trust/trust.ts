// La porte de confiance (#4421, épique #4358) : sur un dépôt public, n'importe
// qui ouvre une issue ou écrit un commentaire, et les agents de la cuisine lisent
// ce texte. Un auteur de confiance est le chef, un collaborateur qui a le droit
// d'écrire sur le dépôt, ou un agent de la cuisine (`auteur-interne.ts`). Ce
// module le dit ; il ne change encore aucune lecture : la commande `trust` le
// joue, et les lectures de la cuisine l'appelleront.
//
// Le droit d'un auteur se lit sur GitHub (`collaborators/<login>/permission`,
// `permissionSurLeDepot` de `github.ts`) une seule fois par auteur : la réponse
// est gardée, et deux questions sur le même auteur en même temps partagent la
// même lecture. Une lecture qui échoue n'est pas gardée — elle se refait à la
// question suivante — et fait échouer la question : rien ne décide à sa place.
import { auteurInterne } from "../auteur-interne.ts";

// Le droit d'un compte sur le dépôt, tel que GitHub le rend : "admin",
// "maintain", "write", "triage", "read" ou "none".
export type LirePermission = (login: string) => Promise<string>;

const DROITS_D_ECRITURE: readonly string[] = ["admin", "maintain", "write"];

// Vrai si ce droit permet d'écrire sur le dépôt.
export const peutEcrire = (permission: string | undefined): boolean => permission !== undefined && DROITS_D_ECRITURE.includes(permission);

export type OptionsDeConfiance = {
  // Le login du chef ; null : aucun chef résolu, le droit seul décide.
  chef: string | null;
  permission: LirePermission;
};

export type Confiance = { isTrusted(author: string): Promise<boolean> };

// GitHub ne distingue pas la casse des logins.
const cle = (login: string) => login.toLowerCase();

export function creerConfiance({ chef, permission }: OptionsDeConfiance): Confiance {
  const lues = new Map<string, Promise<boolean>>();
  return {
    async isTrusted(author) {
      if (author.trim() === "") return false;
      if (chef !== null && cle(author) === cle(chef)) return true;
      if (auteurInterne(author)) return true;
      const auteur = cle(author);
      let lue = lues.get(auteur);
      if (lue === undefined) {
        lue = permission(author).then(peutEcrire);
        lues.set(auteur, lue);
        lue.catch(() => lues.delete(auteur));
      }
      return lue;
    },
  };
}
