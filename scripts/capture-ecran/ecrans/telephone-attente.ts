// L'appairage du téléphone en route (#1161) : le QR scanné, la station n'a pas encore répondu — la ligne
// dit qu'on l'attend, les deux gestes sont inactifs.
import { apresLeQr } from "./telephone-commun.ts";

export const ecran = apresLeQr("L'appairage du téléphone, le QR scanné : la station n'a pas encore répondu", { __enAttente: true });
