// Settings → Reliability de « parade » quand ses cooks ont appris (#1058, épique 1034) : sous les causes
// corrigées, ses leçons — provisoires et promues, chacune avec sa date, les tickets qui l'ont proposée et
// les cooks qui l'ont reçue, et pour une promue le lien vers sa ligne du carnet — et ses profils, chacun
// avec son domaine, son carnet et les tickets qu'il a cuisinés. Ce que la box rend de plus que la cuisine
// figée : le champ `apprentissage` de `facts` (runtime/src/apprentissage/projet.ts). La lecture de
// l'onglet est celle de la page sans correction (fiabilite.ts) ; sans `apprentissage`, cette page-là dit
// en une phrase qu'il n'y a ni leçon ni profil.
import { cuisine, type Ecran, type Rendu } from "./commun.ts";
import { RENDUS } from "./cuisine-figee.ts";
import { ecran as fiabilite } from "./fiabilite.ts";

const PARADE = RENDUS.parade as Rendu;
const CARNET = "https://github.com/chef/parade/blob/main/.claude/brigade/carnet.md";

export const APPRENTISSAGE = {
  lecons: [
    { id: "L4", texte: "run the app tests before touching the view: the skin test reads every class the view sets", statut: "provisoire", date: "2026-10-17", tickets: [29, 33], cooks: 3 },
    { id: "L6", texte: "a capture screen is a file under scripts/capture-ecran/ecrans/, its data written as the box renders it", statut: "provisoire", date: "2026-10-19", tickets: [36], cooks: 0 },
    { id: "L-001", texte: "read CLAUDE.md before writing anything: the zones and the gates are there", statut: "promue", date: "2026-10-01", tickets: [12, 15, 22], cooks: 14, url: `${CARNET}#L5` },
    { id: "L-002", texte: "a test waits for a fact, never for a duration", statut: "promue", date: "2026-10-08", tickets: [18], cooks: 9, url: `${CARNET}#L11` },
  ],
  profils: [
    {
      nom: "app-src-vue",
      domaine: "app/src/vue",
      carnet: [
        { id: "L-001", texte: "keep the view thin: what it shows is computed in the main process", etat: "promoted" },
        { id: "L-002", texte: "every gesture is a button", etat: "retired" },
      ],
      tickets: [29, 33, 36],
    },
    { nom: "runtime-src-correctif", domaine: "runtime/src/correctif", carnet: [], tickets: [41] },
  ],
};

export const ecran: Ecran = {
  ...fiabilite,
  dit: "Settings → Reliability de « parade » quand ses cooks ont appris : sous la fiabilité, ses quatre leçons — deux provisoires, deux promues avec le lien vers leur ligne du carnet — et ses deux profils, leur domaine, leur carnet et leurs tickets",
  hauteur: 1700,
  donnees: () => {
    const sans = fiabilite.donnees();
    return { ...sans, envois: { ...sans.envois, ...cuisine({ ...RENDUS, parade: { ...PARADE, facts: { ...PARADE.facts, apprentissage: APPRENTISSAGE } as Rendu["facts"] } }) } };
  },
};
