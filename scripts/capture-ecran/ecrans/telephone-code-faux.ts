// L'appairage du téléphone refusé (#1161) : aucun code n'a été tiré sous celui-ci — la ligne le dit, la
// réponse de la station au survol, et le chef retape.
import { apresLeQr } from "./telephone-commun.ts";

export const ecran = apresLeQr("L'appairage du téléphone refusé : un code faux", { paired: false, reason: "inconnu", said: "code refused: no pairing code was issued under it — ask your station for a new one" });
