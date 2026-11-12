// Un ticket que le manager a écarté au chef avec le label `question` (#3370) : #50 sur « parade », projet GitHub seul, hors
// du rail. Le commentaire du manager pose sa question ; l'entrée de TODO est posée comme la lecture de ce qui attend le chef
// la pose (app/src/tableau/attente-du-chef.ts) : sa carte est tirée du commentaire par l'app (app/src/tableau/mise-de-cote-github.ts,
// `carteDeLEcart`). Ce fichier n'est pas un écran.
import { avecLAttenteDuChef, type AttenteDuChef } from "../../../app/src/tableau/attente-du-chef.ts";
import { carteDeLEcart } from "../../../app/src/tableau/mise-de-cote-github.ts";
import { avecLeRail } from "../../../app/src/vue/rail/github.ts";
import { configuration, cuisine, demarrage, type Donnees, MAINTENANT } from "./commun.ts";
import { MANAGER_ALLUME, PROJETS, RENDUS } from "./cuisine-figee.ts";
import { renduDeParade, SIGNES, SUR_GITHUB, TABLEAU_FIGE } from "./github-seul-commun.ts";
import { SECOND } from "./rail-waiting-commun.ts";

const DEPOT = "chef/parade";
const DEPUIS = "2026-10-13T09:40:00.000Z";
const COMMENTAIRES = [
  {
    body: "<!-- brigade:manager -->\n**Manager — set aside: a question for the chef.**\n\nThe ticket does not say which separator the CSV uses; the accounting tool of the chef reads only one.\nWhich separator does the CSV export use?\n- [resume] Semicolon, as the accounting tool reads it\n- [resume] Comma, the CSV default\n- [close] Drop the export",
    author_association: "OWNER",
    created_at: DEPUIS,
  },
];
const chef = carteDeLEcart("question", COMMENTAIRES);

export const CARTE: AttenteDuChef = {
  ticket: 50,
  titre: "Export the invoices as CSV",
  url: `https://github.com/${DEPOT}/issues/50`,
  depuis: DEPUIS,
  quoi: "ecart",
  ligne: chef.texte.split("\n")[0] ?? "",
  chef,
};

export const OUVRIR_PARADE = { cliquer: '#projets > button[title^="parade — "]' };

export const donnees = (): Donnees => {
  const lu = avecLAttenteDuChef(avecLeRail(TABLEAU_FIGE, SUR_GITHUB, SIGNES), { attentes: [CARTE], illisibles: [] });
  return {
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [SECOND] },
    envois: cuisine({ ...RENDUS, parade: { ...renduDeParade(lu), manager: MANAGER_ALLUME } }),
  };
};
