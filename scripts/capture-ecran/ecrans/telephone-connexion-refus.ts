// La connexion du téléphone à GitHub ratée (#2500) : GitHub ne se joint pas — l'écran reste sur la connexion, une
// ligne le dit sous le bouton, ce que le réseau en a dit au survol ; le bouton relance.
import { apresLaConnexion } from "./telephone-commun.ts";

export const ecran = apresLaConnexion("La connexion du téléphone à GitHub ratée : GitHub injoignable, l'écran le dit et reste", {
  refus: "This phone could not reach GitHub: check its connection, then try again.",
  detail: 'Unable to resolve host "github.com": No address associated with hostname',
});
