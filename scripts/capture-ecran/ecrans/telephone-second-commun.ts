// Ce que les écrans de la conversation sur le téléphone partagent (ticket 1165) : la file de `telephone-file`, reçue par
// l'app Android appairée à la box, et l'onglet Second de `parade` touché. Sur le téléphone, ni terminal ni shell : la
// conversation avec le second, telle que le pont la rend (`conversation`) — celle du second du desktop —, son markdown
// rendu par le module de l'app qui rend celui des issues (markdown.ts). Chaque écran fige ce que le pont en rend, et
// ce qu'il rend d'un message envoyé (`envoyerAuSecond`).
import { rendre } from "../../../app/src/markdown.ts";
import type { Conversation, MessageDuSecond } from "../../../app/src/vue/pont.d.ts";
import { type Ecran, type Etape } from "./commun.ts";
import { HAUTEUR, LARGEUR } from "./telephone-commun.ts";
import { donneesDeLaFile, OUVRIR_PARADE } from "./telephone-file-commun.ts";

// L'onglet Second de son espace : Rail, Cooks, Second.
export const OUVRIR_SECOND: Etape = { cliquer: "#onglets-du-projet > button:nth-child(3)" };
// Le message tapé, puis « send » touché.
export const TAPER: Etape = { saisir: "#conversation textarea", texte: "Merge #12, I grant it for this one." };
export const ENVOYER: Etape = { cliquer: '#conversation button[data-geste="envoyer-au-second"]' };

const message = (de: MessageDuSecond["de"], a: string, texte: string): MessageDuSecond => ({ de, a: `2026-10-13T${a}:00.000Z`, blocs: rendre(texte) });
// Ce que le chef a demandé au second de `parade` — du desktop, puis d'ici —, et ce qu'il a répondu.
export const CONVERSATION: Conversation = {
  messages: [
    message("chef", "09:58", "What is waiting for me on parade?"),
    message("second", "09:58", "One decision: **#12** — *Validation SIRET* — is green, but the pass does not merge it without the `merge` grant.\n\n- merge it from its sheet, in TODO;\n- or grant `merge`, and the pass merges it."),
    message("chef", "10:02", "And what is cooking?"),
    message("second", "10:02", "Two cooks:\n\n- **#14** *Le journal en ajout seul*, on the box — writing `app/src/bon.ts`;\n- **#15** *La carte des desserts*, on the Mac."),
  ],
};
// La même, le dernier message du chef parti d'ici : le second écrit sa réponse.
export const ENVOYEE: Conversation = { messages: [...CONVERSATION.messages, message("chef", "10:04", "Merge #12, I grant it for this one.")], repond: true };

// L'onglet Second de `parade` sur le téléphone : `conversation`, ce que le pont rend de sa lecture ; `etapes`, ce que le
// chef fait ensuite ; `envoi`, ce que le pont rend du message envoyé.
export function second(dit: string, conversation: unknown, etapes: Etape[] = [], envoi?: unknown): Ecran {
  return {
    dit,
    largeur: LARGEUR,
    hauteur: HAUTEUR,
    etapes: [OUVRIR_PARADE, OUVRIR_SECOND, ...etapes],
    donnees: () => {
      const file = donneesDeLaFile();
      return { ...file, reponses: { ...file.reponses, conversation, ...(envoi === undefined ? {} : { envoyerAuSecond: envoi }) } };
    },
  };
}
