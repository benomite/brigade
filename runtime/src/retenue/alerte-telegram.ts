// L'alerte de la retenue sur le canal Telegram du chef (#2282) : le même texte
// que la ligne de sa TODO (`direRetenueEn`) quand une retenue commence, et un
// seul message quand la cuisine sert de nouveau. Une retenue = une alerte : les
// transitions viennent de `annoncerRetenue`, qui n'écrit un fait qu'au début
// d'une retenue, à sa levée, ou quand sa cause change — pas à chaque passe — ;
// ce module ne parle qu'au début et à la levée, et ne renvoie jamais deux fois
// l'alerte d'une retenue déjà annoncée.
//
// L'envoi lui-même est un port : `EnvoyerTelegram`, à brancher sur le code
// d'envoi du canal du chef. Un envoi qui échoue ne retient pas la boucle : il
// n'est pas attendu, et son échec est dit au journal de service.
import type { Transition } from "./brancher.ts";
import { direRetenueEn } from "./retenue.ts";

export type EnvoyerTelegram = (texte: string) => Promise<void> | void;

export const MESSAGE_DE_REPRISE = "The kitchen is moving again: a ticket was served, the hold is lifted.";

export type OptionsAlerte = {
  envoyer: EnvoyerTelegram;
  // Une ligne du journal de service.
  dire?: (ligne: string) => void;
};

export function alerteTelegram({ envoyer, dire = (ligne) => console.error(`brigade : ${ligne}`) }: OptionsAlerte): (transition: Transition) => void {
  // Le début de la retenue dont l'alerte est partie, nul quand aucune n'est en cours.
  let annoncee: string | null = null;

  const echec = (erreur: unknown) => dire(`telegram: hold message not sent — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  const poster = (texte: string) => {
    try {
      Promise.resolve(envoyer(texte)).catch(echec);
    } catch (erreur) {
      echec(erreur);
    }
  };

  return (transition) => {
    if (transition.type === "started") {
      if (annoncee === transition.retenue.since) return;
      annoncee = transition.retenue.since;
      poster(direRetenueEn(transition.retenue));
    } else if (transition.type === "lifted") {
      if (annoncee === null) return;
      annoncee = null;
      poster(MESSAGE_DE_REPRISE);
    }
  };
}
