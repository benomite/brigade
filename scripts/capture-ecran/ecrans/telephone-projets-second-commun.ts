// Ce que les écrans de la conversation sur le téléphone appairé partagent (#1426) : les projets et la file de `parade`
// lus au guichet de la station par la lecture du pont (telephone-projets-commun.ts), puis l'onglet Second de `parade`
// touché. La conversation est celle que cette même lecture rend de la réponse figée du guichet à son
// `GET /projects/parade/second` — ou de l'erreur du réseau qui ne l'a pas joint —, et le message envoyé, ce qu'elle rend
// de sa réponse au `POST`.
import { ouvrirLaLecture, type Reponse } from "../../../app/android/web/lecture.ts";
import { type Ecran, type Etape } from "./commun.ts";
import { ADRESSE } from "./telephone-commun.ts";
import { guichet, HAUTEUR, INJOIGNABLE, LARGEUR, lireLaStation, OUVRIR_PARADE, PROJETS, STATION } from "./telephone-projets-commun.ts";
import { ENVOYER, OUVRIR_SECOND } from "./telephone-second-commun.ts";

export { INJOIGNABLE };
// Le message tapé, puis « send » touché.
export const TEXTE = "Merge #12, I grant it for this one.";
const TAPER: Etape = { saisir: "#conversation textarea", texte: TEXTE };
const donnees = await lireLaStation({ repondre: guichet(), connus: PROJETS });

const message = (from: "chef" | "second", a: string, text: string) => ({ from, at: `2026-10-13T${a}:00.000Z`, text });
// Ce que le chef a demandé au second de `parade` — de son ordinateur, puis d'ici —, et ce qu'il a répondu, tel que le
// guichet le rend.
export const MESSAGES = [
  message("chef", "09:58", "What is waiting for me on parade?"),
  message("second", "09:58", "One decision: **#12** — *Validation SIRET* — is green, but the pass does not merge it without the `merge` grant.\n\n- merge it from its sheet, in TODO;\n- or grant `merge`, and the pass merges it."),
  message("chef", "10:02", "And what is cooking?"),
  message("second", "10:02", "Two cooks:\n\n- **#14** *Le journal en ajout seul*, on the box — writing `app/src/bon.ts`;\n- **#15** *La carte des desserts*, on the Mac."),
];
export const LUE: Reponse = { status: 200, data: { project: "parade", session: "0b6c1c2e-4f5a-4b7c-9d8e-1f2a3b4c5d6e", messages: MESSAGES } };

// La lecture du pont telle qu'elle se rend à la vue ; avant #1426, elle ne portait pas la conversation.
type LectureDuSecond = { conversation?(projet: string): Promise<unknown>; envoyerAuSecond?(projet: string, texte: string): Promise<unknown> };

// L'onglet Second de `parade` sur le téléphone appairé : `lue`, ce que le guichet rend de sa lecture ; `envoi`, ce qu'il
// rend du message tapé puis envoyé.
export async function secondAuGuichet(dit: string, lue: Reponse | Error, envoi?: Reponse | Error): Promise<Ecran> {
  const lecture: LectureDuSecond = ouvrirLaLecture({
    station: STATION,
    adresse: ADRESSE,
    requete: async () => {
      if (lue instanceof Error) throw lue;
      return lue;
    },
    envoyer: async () => {
      if (envoi instanceof Error) throw envoi;
      return envoi ?? { status: 404, data: { said: "unknown" } };
    },
    dire: () => undefined,
    planifier: () => () => undefined,
  });
  const conversation = await lecture.conversation?.("parade");
  const envoyee = envoi === undefined ? undefined : await lecture.envoyerAuSecond?.("parade", TEXTE);
  return {
    dit,
    largeur: LARGEUR,
    hauteur: HAUTEUR,
    etapes: [OUVRIR_PARADE, OUVRIR_SECOND, ...(envoi === undefined ? [] : [TAPER, ENVOYER])],
    donnees: () => ({ ...donnees, reponses: { ...donnees.reponses, conversation, ...(envoi === undefined ? {} : { envoyerAuSecond: envoyee }) } }),
  };
}
