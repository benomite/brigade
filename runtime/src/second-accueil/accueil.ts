// Ce que le second dit en ouvrant un projet neuf : un mot d'accueil qui nomme
// le projet et propose ce qu'il peut faire ici — dire où en est la préparation,
// aider à écrire les premiers tickets —, d'après l'état d'onboarding
// (`onboarding/etat.ts`). Un projet dont l'onboarding est fini n'a pas
// d'accueil : le second n'a rien de particulier à dire.
//
// Pur, hors le registre des ouvertures déjà saluées. Les phrases sont en
// anglais : c'est le second, dans l'app, qui les dit.
import type { Onboarding } from "../onboarding/etat.ts";

// Le mot d'accueil, ou null quand l'onboarding du projet est fini.
export function motDAccueil(projet: string, onboarding: Onboarding): string | null {
  if (onboarding.termine) return null;
  const lignes = [`Welcome to ${projet}. I can tell you where the preparation stands, or help you write your first tickets.`];
  if (onboarding.preparation?.etat === "en-echec") {
    const { raison, ticket } = onboarding.preparation;
    const dit = raison === null ? `the cook of #${ticket} was set aside` : `${raison[0]?.toLowerCase() ?? ""}${raison.slice(1)}`.replace(/\.$/, "");
    lignes.push(`The preparation failed: ${dit}.`);
  }
  return lignes.join(" ");
}

// Une ouverture de projet = un identifiant que l'app donne à chaque fois
// qu'elle ouvre le projet (pas à chaque rafraîchissement). Le mot d'accueil
// part une fois par ouverture.
export class Accueil {
  readonly #salues = new Set<string>();

  // Le mot à envoyer au second pour cette ouverture, ou null : déjà dit, ou rien à dire.
  saluer(projet: string, ouverture: string, onboarding: Onboarding): string | null {
    const cle = `${projet}\u0000${ouverture}`;
    if (this.#salues.has(cle)) return null;
    const mot = motDAccueil(projet, onboarding);
    if (mot !== null) this.#salues.add(cle);
    return mot;
  }

  // L'ouverture est close : la prochaine, même sous le même identifiant, salue de nouveau.
  oublier(projet: string, ouverture: string): void {
    this.#salues.delete(`${projet}\u0000${ouverture}`);
  }
}
