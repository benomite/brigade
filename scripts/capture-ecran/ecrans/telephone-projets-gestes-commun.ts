// Ce que les écrans des gestes d'une carte sur le téléphone appairé partagent (#1420) : la file de `parade` des écrans
// `telephone-gestes-*` — dans TODO, #12, verte, à merger, et #31, dont la PR a été fermée, à sortir du rail —, lue au
// guichet de la station par la lecture du pont (telephone-projets-commun.ts). Les gestes de la fiche sont ceux que cette
// même lecture propose pour la carte touchée, et ce qu'un geste rend est ce qu'elle rend de la réponse figée du guichet
// à son `POST /projects/parade/gestures` — ou de l'erreur du réseau qui ne l'a pas joint.
import { ouvrirLaLecture, type Reponse } from "../../../app/android/web/lecture.ts";
import { carteDe, type Ecran, type Etape, type Rendu } from "./commun.ts";
import { RENDUS } from "./cuisine-figee.ts";
import { STATUS } from "./file-ou-cuit.ts";
import { FAITS } from "./telephone-gestes-commun.ts";
import { guichet, HAUTEUR, INJOIGNABLE, LARGEUR, lireLaStation, OUVRIR_PARADE, PROJETS, STATION } from "./telephone-projets-commun.ts";
import { ADRESSE } from "./telephone-commun.ts";

export { INJOIGNABLE };
const RENDU: Rendu = { ...(RENDUS.parade as Rendu), facts: FAITS, status: STATUS };
const lu = guichet();
const donnees = await lireLaStation({
  repondre: (chemin) => (chemin === "/projects/parade/queue" ? { status: 200, data: { project: "parade", repository: "chef/parade", facts: FAITS, status: STATUS } } : lu(chemin)),
  connus: PROJETS,
});

// La carte d'un ticket de TODO touchée : sa fiche s'ouvre. Puis le geste touché, et son « oui ».
const TOUCHER: Record<number, Etape> = {
  12: { cliquer: "#rail .colonne[data-attend] li.bon:nth-of-type(1)" },
  31: { cliquer: "#rail .colonne[data-attend] li.bon:nth-of-type(2)" },
};
const geste = (id: string): Etape => ({ cliquer: `#fiche li[data-geste="${id}"] button:not(.aide)` });
const OUI: Etape = { cliquer: "#fiche .gestes-fiche .confirmation button.recommande" };

// La fiche d'un ticket de TODO, sa carte touchée ; `id` — un geste touché, confirmé, et `reponse`, ce que le guichet en
// rend.
export async function gesteDUneCarte(dit: string, ticket: 12 | 31, id?: string, reponse?: Reponse | Error): Promise<Ecran> {
  const lecture = ouvrirLaLecture({
    station: STATION,
    adresse: ADRESSE,
    requete: async () => ({ status: 404, data: { said: "unknown" } }),
    envoyer: async () => {
      if (reponse instanceof Error) throw reponse;
      return reponse ?? { status: 404, data: { said: "unknown" } };
    },
    dire: () => undefined,
    planifier: () => () => undefined,
  });
  const proposes = lecture.gestesDeFiche?.(carteDe(RENDU, "parade", ticket));
  const rendu = id === undefined ? undefined : await lecture.geste?.("parade", id, ticket);
  return {
    dit,
    largeur: LARGEUR,
    hauteur: HAUTEUR,
    etapes: [OUVRIR_PARADE, TOUCHER[ticket] as Etape, ...(id === undefined ? [] : [geste(id), OUI])],
    donnees: () => ({ ...donnees, reponses: { ...donnees.reponses, ...(proposes === undefined ? {} : { gestesDeFiche: proposes }), ...(rendu === undefined ? {} : { gesteDeFiche: rendu }) } }),
  };
}
