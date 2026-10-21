// L'appairage du téléphone refusé (#1161) : le code a passé son quart d'heure — la ligne dit d'en demander
// un neuf à la station.
import { apresLeQr } from "./telephone-commun.ts";

export const ecran = apresLeQr("L'appairage du téléphone refusé : un code expiré", { paired: false, reason: "expire", said: "code refused: it expired at 2026-10-13T09:58:00.000Z — ask your station for a new one" });
