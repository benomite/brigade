// L'onglet Cooks de « parade » quand ses cooks ont appris (#1058, épique 1034 ; sur Cooks depuis #1273) : sous ses
// stations et son plafond, ses leçons — provisoires et promues, chacune avec sa date, les tickets qui l'ont proposée et
// les cooks qui l'ont reçue, et pour une promue le lien vers sa ligne du carnet — et ses profils, chacun
// avec son domaine, son carnet et les tickets qu'il a cuisinés. Ce que la box rend de plus que la cuisine
// figée : le champ `apprentissage` de `facts` (runtime/src/apprentissage/projet.ts). La lecture de
// l'onglet est celle de la page sans correction (fiabilite.ts) ; sans `apprentissage`, cette page-là dit
// en une phrase qu'il n'y a ni leçon ni profil.
import { cuisine, type Ecran, type Rendu } from "./commun.ts";
import { RENDUS } from "./cuisine-figee.ts";
import { configuration, demarrage, MAINTENANT } from "./commun.ts";
import { PROJETS } from "./cuisine-figee.ts";

const PARADE = RENDUS.parade as Rendu;
const CARNET = "https://github.com/chef/parade/blob/main/.claude/brigade/carnet.md";

// Le progrès de chacun (#1059, `progres` de `facts`) : la livraison avant et après son entrée ; un côté sans
// ticket mergé est `null`, et la page le dit en mots.
const livraison = (retenus: number, premiers: number, essaisMoyens: number) => ({ retenus, premiers, premierCoup: premiers / retenus, essaisMoyens });
const COMPLET = { avant: livraison(10, 6, 1.5), apres: livraison(4, 3, 1.25) };
const SANS_APRES = { avant: livraison(8, 5, 1.4), apres: null };
const RIEN = { avant: null, apres: null };

export const APPRENTISSAGE = {
  lecons: [
    { id: "L4", texte: "run the app tests before touching the view: the skin test reads every class the view sets", statut: "provisoire", date: "2026-10-17", tickets: [29, 33], origine: { kind: "retro" }, cooks: 3, progres: COMPLET },
    { id: "L6", texte: "a capture screen is a file under scripts/capture-ecran/ecrans/, its data written as the box renders it", statut: "provisoire", date: "2026-10-19", tickets: [36], origine: { kind: "pass-send-back", ticket: 36 }, cooks: 0, progres: SANS_APRES },
    { id: "L-001", texte: "read CLAUDE.md before writing anything: the zones and the gates are there", statut: "promue", date: "2026-10-01", tickets: [12, 15, 22], origine: { kind: "chef-correction", ticket: 15 }, cooks: 14, url: `${CARNET}#L5`, progres: COMPLET },
    { id: "L-002", texte: "a test waits for a fact, never for a duration", statut: "promue", date: "2026-10-08", tickets: [18], origine: { kind: "retro" }, cooks: 9, url: `${CARNET}#L11`, progres: SANS_APRES },
  ],
  profils: [
    {
      nom: "app-src-vue",
      domaine: "app/src/vue",
      skills: [],
      perimetre: ["app/src/vue"],
      carnet: [
        { id: "L-001", texte: "keep the view thin: what it shows is computed in the main process", etat: "promoted" },
        { id: "L-002", texte: "every gesture is a button", etat: "retired" },
      ],
      tickets: [29, 33, 36],
      progres: COMPLET,
    },
    { nom: "design", domaine: "app/src/vue", skills: ["agents/cook-design.md"], perimetre: ["app/src/vue"], carnet: [], tickets: [], progres: RIEN },
    { nom: "runtime-src-correctif", domaine: "runtime/src/correctif", skills: [], perimetre: ["runtime/src/correctif"], carnet: [], tickets: [41], progres: RIEN },
  ],
};

export const ecran: Ecran = {
  dit: "L'onglet Cooks de « parade » quand ses cooks ont appris : sous ses stations, ses quatre leçons, chacune avec son origine (rétro, renvoi de la pass ou correction du chef sur un ticket) — deux provisoires, deux promues avec le lien vers leur ligne du carnet — et ses trois profils, leur domaine, leur carnet et leurs tickets",
  largeur: 1440,
  hauteur: 1900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets-du-projet button:nth-child(2)" }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: { ...PARADE.facts, apprentissage: APPRENTISSAGE } as Rendu["facts"] } }),
  }),
};
