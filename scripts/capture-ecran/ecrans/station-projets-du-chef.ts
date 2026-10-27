// La page de nas (#1780, épique #1777), la station seulement enregistrée sous le compte GitHub du chef : le compte atteint
// trente-six dépôts — les siens, ceux de ses organisations, ceux où il est invité. Ses cases ne montrent que les projets du
// chef — ceux que ses stations servent ou qui leur sont choisis —, et le champ qui cherche les autres. Avant #1780, elles
// montraient les trente-six.
import { type Etape } from "./commun.ts";
import { stationsDuChef } from "./stations-une-liste.ts";

const AUTRES = [
  "benomite/cantine", "benomite/parade", "benomite/dotfiles", "benomite/notes", "benomite/site-perso", "benomite/cv", "benomite/scripts", "benomite/advent-2025",
  "benomite/raytracer", "benomite/budget", "benomite/recettes", "benomite/photos-tri", "benomite/kata-bowling", "benomite/meteo-bot", "benomite/playground",
  "atelier-bois/catalogue", "atelier-bois/site", "atelier-bois/factures", "asso-quartier/agenda", "asso-quartier/site", "asso-quartier/newsletter",
  "camille-r/thesis", "camille-r/blog", "jdupont/infra", "jdupont/homelab", "jdupont/ansible-roles", "lea-m/portfolio", "lea-m/chat-widget",
  "lea-m/chatops", "ecole-42/piscine", "ecole-42/minishell",
];
// Les dépôts du compte, tels que `depotsDuChef` les rend (les plus récemment poussés d'abord) : les cinq projets que
// parade-box sert, mêlés aux trente et un autres.
export const DEPOTS = {
  depots: ["benomite/brigade", ...AUTRES.slice(0, 6), "benomite/calculus-workspace", ...AUTRES.slice(6, 14), "benomite/espace", ...AUTRES.slice(14, 22), "benomite/mirrorscreen", ...AUTRES.slice(22), "benomite/mirrorlab"].map((depot) => ({
    depot,
    base: "main",
  })),
};

export const NAS: Etape = { cliquer: `#accueil-stations [data-station="e2d4"] button.ligne, #accueil-stations button.ligne[data-station="e2d4"]` };

export const ecran = stationsDuChef("La page de nas (#1780) : le compte atteint 36 dépôts — ses cases ne montrent que les projets du chef, et le champ qui cherche les autres", [NAS], DEPOTS);
