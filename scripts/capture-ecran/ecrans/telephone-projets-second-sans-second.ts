// L'onglet Second de `parade` sur le téléphone appairé (#1426), la station qui ne tient pas son second — sa ligne ne
// nomme pas le dossier où il tourne : une phrase, ce que la station en a dit au survol, et « read again ».
import { secondAuGuichet } from "./telephone-projets-second-commun.ts";

export const ecran = await secondAuGuichet("L'onglet Second de « parade » sur le téléphone appairé, la station qui ne tient pas son second, en 412 × 915", {
  status: 503,
  data: { said: "this station does not hold the second of parade: its line names no folder where the second runs (BRIGADE_SECOND_DIR)" },
});
