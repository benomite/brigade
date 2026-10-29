// La page des ratios de tous les projets (#1682), ouverte depuis l'accueil : `closing --json` lu sur la box de chaque
// projet, l'objet sur une ligne comme runtime/src/fermeture-lecture/lecture.ts l'écrit. Cinq projets : `brigade`
// dont le rapport baisse, `parade` où il tient, `cantine` où il monte, `atelier`, trop jeune pour une tendance, et
// `espace`, sans closer réglé — qui n'a pas de ligne.
import type { Lecture } from "../../../app/src/box.ts";
import type { Projet } from "../../../app/src/config.ts";
import { OBSERVEE } from "./closer.ts";
import { configuration, cuisine, demarrage, type Ecran, type Envoi, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const AUTRES: Projet[] = [
  { nom: "brigade", dossier: "/Users/chef/code/brigade", couleurs: { onglet: "#7fb2f0", accent: "#7fb2f0" } },
  { nom: "atelier", dossier: "/Users/chef/code/atelier", couleurs: { onglet: "#c792ea", accent: "#c792ea" } },
  { nom: "espace", dossier: "/Users/chef/code/espace", couleurs: { onglet: "#e9c46a", accent: "#e9c46a" } },
];
const TOUS = [...AUTRES.slice(0, 1), ...PROJETS, ...AUTRES.slice(1)];

// Une fenêtre du rapport, comme `closing --json` l'écrit.
const fenetre = (window: number, merges: number, added: number, removed: number) => ({
  window,
  merges,
  added,
  removed,
  ratio: removed === 0 ? null : added / removed,
  reads: removed === 0 ? "nothing removed" : `${(added / removed).toLocaleString("en-US", { maximumFractionDigits: 1 })}:1`,
});
const observee = (ratio: ReturnType<typeof fenetre>[]) => ({ ...OBSERVEE, observation: { ...OBSERVEE.observation, ratio } });

const LUS: Record<string, unknown> = {
  // 51–100 : 20:1, 21–50 : 16:1, les 20 derniers : 8:1 — il baisse.
  brigade: observee([fenetre(20, 20, 3_200, 400), fenetre(50, 50, 12_800, 1_000), fenetre(100, 100, 24_800, 1_600)]),
  // 4:1, 4.2:1, 3.9:1 — il tient.
  parade: observee([fenetre(20, 20, 3_900, 1_000), fenetre(50, 50, 10_200, 2_500), fenetre(100, 100, 18_200, 4_500)]),
  // 2:1, puis 3:1, puis 5:1 — il monte.
  cantine: observee([fenetre(20, 20, 5_000, 1_000), fenetre(50, 50, 11_000, 3_000), fenetre(100, 100, 17_000, 6_000)]),
  // Quatorze merges en tout : une seule tranche.
  atelier: observee([fenetre(20, 14, 2_100, 300), fenetre(50, 14, 2_100, 300), fenetre(100, 14, 2_100, 300)]),
  espace: { configured: false, text: "the closer is not set on this project: no closing pass writes, there is nothing to observe for it" },
};

const lu = (projet: string): Envoi => {
  const lecture: Lecture = { projet, demande: 0, a: MAINTENANT, sorties: [{ commande: "closing --json", texte: `${JSON.stringify(LUS[projet])}\n` }] };
  return { sur: "surContenu", args: [lecture, undefined, undefined], demande: "onglet" };
};

export const ecran: Ecran = {
  dit: "La page des ratios de tous les projets : le rapport ajouté / retiré de chacun qui a un closer, et sa tendance",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: 'button[aria-label="the added / removed ratio of all projects"]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(TOUS)) },
    envois: { ...cuisine(RENDUS), onglet: { "undefined/ratios": TOUS.map(({ nom }) => lu(nom)) } },
  }),
};
