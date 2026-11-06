// La connexion du téléphone à GitHub lancée (#2500) : GitHub a donné son code à usage unique, la page où le taper
// est ouverte dans le navigateur du téléphone — l'écran montre le code, et de quoi rouvrir la page.
import { apresLaConnexion } from "./telephone-commun.ts";

export const ecran = apresLaConnexion("La connexion du téléphone à GitHub lancée : le code à taper sur la page de GitHub", { code: "A1B2-C3D4", page: "https://github.com/login/device" });
