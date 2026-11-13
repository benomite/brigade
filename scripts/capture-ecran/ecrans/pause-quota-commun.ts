// Ce que les écrans de la pause de quota partagent (#3482) : le quota GitHub du compte est épuisé. La seule station de
// « parade », box/claude, tourne, mais son dernier signe de vie a quinze minutes — elle ne peut plus l'écrire — et elle a
// publié son état de quota (`quotaGithub`) : la limite `core`, reprise à 10:11 UTC, sept minutes après la lecture. Trois
// tickets `fire` attendent en file depuis vingt minutes, deux qu'aucun manager n'a pris. La vue reçoit ce que l'app en
// tire (app/src/vue/rail/github.ts, `avecLeRail`), rien écrit à la main.
import type { TableauLu } from "../../../app/src/tableau/lecture.ts";
import { avecLeRail, type RailSurGithub, type SignesDeVie } from "../../../app/src/vue/rail/github.ts";
import { MAINTENANT, type Rendu } from "./commun.ts";
import { renduDeParade, signe, ticket } from "./github-seul-commun.ts";

const ENTREE = new Date(Date.parse(MAINTENANT) - 20 * 60_000).toISOString();
export const REPRISE = new Date(Date.parse(MAINTENANT) + 7 * 60_000 - 12_000).toISOString();

const RAIL: RailSurGithub = {
  lu: MAINTENANT,
  tickets: [ticket(12, "en attente", { entreLe: ENTREE }), ticket(21, "en attente", { entreLe: ENTREE, depend: [12] }), ticket(22, "en attente", { entreLe: ENTREE })],
  nonPris: [
    { ticket: 21, depuis: ENTREE },
    { ticket: 22, depuis: ENTREE },
  ],
};

// La lecture d'un projet sur GitHub seul avant son rail (app/src/tableau/lecture.ts, `vide`).
const VIDE: TableauLu = {
  lu: true,
  depot: "chef/parade",
  luLe: MAINTENANT,
  cuisine: { rubriques: [] },
  faits: { etat: "ouverte", lu: MAINTENANT, dernierTick: null, dernierEvenement: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, rail: [] },
  file: [],
  bilans: [],
  lignesDuRail: [],
  activites: [],
};

// box/claude : son signe de vie a quinze minutes, et son quota GitHub dit la pause. `pauseJusqua` nul : la reprise n'est pas dite.
export const boxEnPause = (pauseJusqua: string | null) => ({
  ...signe("box", new Date(Date.parse(MAINTENANT) - 15 * 60_000).toISOString()),
  quotaGithub: { limite: "core" as const, pauseJusqua, utilise: 5000, maximum: 5000, renouvellement: REPRISE, parStationEtProjet: { "box/chef/parade": 5000 } },
});

export const signesEnPause = (pauseJusqua: string | null = REPRISE): SignesDeVie => ({ lus: [boxEnPause(pauseJusqua)] });

export const RENDU_EN_PAUSE: Rendu = renduDeParade(avecLeRail(VIDE, RAIL, signesEnPause()));
