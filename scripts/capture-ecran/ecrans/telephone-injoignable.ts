// L'appairage du téléphone, la station injoignable (#1161) : la demande n'est jamais arrivée — la ligne
// le dit, plutôt qu'un écran vide ; ce que le réseau en a dit au survol.
import { apresLeQr } from "./telephone-commun.ts";

export const ecran = apresLeQr("L'appairage du téléphone, la station injoignable", { paired: false, reason: "injoignable", said: "failed to connect to /192.168.1.20 (port 7010) from /192.168.1.42 (port 41234) after 10000ms" });
