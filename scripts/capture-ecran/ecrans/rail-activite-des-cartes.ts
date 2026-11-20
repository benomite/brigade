// Le rail de « parade » quand ses cartes disent ce que la cuisine en fait (#3923) : #14, prise pour la troisième fois, dont le
// cook lance les tests depuis 20 s ; #15, prise, dont le runtime ne sait encore rien ; #30, en pass, dont la CI tourne depuis 45 s.
import type { Faits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const PARADE = RENDUS.parade as Rendu;
// Le rail figé de parade, dans son ordre : #14 pris, #21 et #22 en attente, #30 et #12 en pass.
const [prise, enFile, libre, enPass] = PARADE.facts.rail as [Faits["rail"][number], Faits["rail"][number], Faits["rail"][number], Faits["rail"][number]];
// Un essai : fini à `jusqua`, ou celui qui cuit encore quand `jusqua` est nul.
const essai = (depuis: string, jusqua: string | null) => ({ depuis, jusqua, arret: jusqua === null ? null : "idle", enCours: jusqua === null });

const FACTS = {
  ...PARADE.facts,
  rail: [
    {
      ...prise,
      depuis: "2026-10-13T09:20:00.000Z",
      essais: [essai("2026-10-13T09:20:00.000Z", "2026-10-13T09:35:00.000Z"), essai("2026-10-13T09:36:00.000Z", "2026-10-13T09:50:00.000Z"), essai("2026-10-13T09:51:00.000Z", null)],
      activite: { fait: "lance les tests", faitEn: "running the tests", cible: null, depuis: "2026-10-13T10:03:51.000Z" },
    },
    { ...prise, ticket: 15, titre: "La clé de cache du build", url: "https://github.com/chef/parade/issues/15", depuis: "2026-10-13T10:04:00.000Z", activite: null },
    enFile,
    libre,
    { ...enPass, depuis: "2026-10-13T10:00:12.000Z", activite: { fait: "jugement en cours", faitEn: "judging", cible: null, depuis: "2026-10-13T10:03:26.000Z", etape: "CI running" } },
  ],
  cooks: [...PARADE.facts.cooks, { ticket: 15, titre: "La clé de cache du build", station: "box/claude" }],
  attend: [],
} as Faits;

const donnees: Ecran["donnees"] = () => ({
  maintenant: MAINTENANT,
  reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
  envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS } }),
});

export const ecran: Ecran = {
  dit: "Le rail de « parade » : #14 prise une troisième fois, son cook lance les tests ; #15 prise, rien de connu encore ; #30 en pass, sa CI tourne (#3923)",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees,
};
