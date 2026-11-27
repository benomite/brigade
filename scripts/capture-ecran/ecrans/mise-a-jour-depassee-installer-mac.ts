// La suite de mise-a-jour-depassee-mac (#4494) : 1.0.428 se télécharge, et le chef a cliqué « Update now » — la ligne
// dit où en est son téléchargement, et qu'elle s'installera à sa fin, sans second clic.
import { ecranDepasse } from "./mise-a-jour-depassee-mac.ts";

export const ecran = {
  ...ecranDepasse(
    "« Tous les projets » sur un Mac : 1.0.428 se télécharge, « Update now » cliqué — elle s'installe à la fin du téléchargement (#4494)",
    { etat: "telechargement", version: "1.0.424", nouvelle: "1.0.428", recus: 62_914_560, taille: 157_286_400 },
    { installerMiseAJour: { __enAttente: true } },
  ),
  etapes: [{ cliquer: "#nouvelle-version button.recommande" }],
};
