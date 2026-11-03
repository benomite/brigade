// L'espace de « parade » quand GitHub limite les appels du compte (#2147) : `facts` porte l'entrée `github` du runtime
// (#2144) — la limite secondaire des écritures par minute, depuis 10:01, retour vers 10:33. L'état est celui du compte :
// `cantine`, sur le même compte, la porte aussi, et sa case de la barre le signale. La bande de `parade` le dit en une ligne.
import type { Faits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const GITHUB = { limit: "secondary-writes", since: "2026-10-13T10:01:00.000Z", backAt: "2026-10-13T10:33:00.000Z" };
const limite = (rendu: Rendu): Rendu => ({ ...rendu, facts: { ...rendu.facts, github: GITHUB } as Faits });

export const ecran: Ecran = {
  dit: "L'espace de « parade », GitHub limitant les écritures par minute du compte (#2147) : la ligne de la bande, et `cantine` signalé sur la barre",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ parade: limite(RENDUS.parade as Rendu), cantine: limite(RENDUS.cantine as Rendu) }),
  }),
};
