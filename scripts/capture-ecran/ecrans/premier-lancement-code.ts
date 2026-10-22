// Le même, « Sign in to GitHub » cliqué (#1434) : le code à taper sur la page de GitHub ouverte dans le navigateur.
import { premierLancement, SANS_COMPTE } from "./premier-lancement-commun.ts";

export const ecran = premierLancement("Le premier lancement, « Sign in to GitHub » cliqué (#1434) : le code à taper sur la page ouverte", SANS_COMPTE, [{ cliquer: ".premier-lancement .recommande" }], {
  seConnecterAGitHub: { code: "A1B2-C3D4", page: "https://github.com/login/device" },
});
