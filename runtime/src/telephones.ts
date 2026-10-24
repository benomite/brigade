// La commande de box des téléphones de la station : `brigade <projet> phones
// code | status <code> | list | revoke <phone>` — tirer un code d'appairage et
// son QR, dire où en est un code, lister les téléphones appairés, en révoquer
// un. Les mêmes gestes, par le même chemin, que `telephone/appairage-cli.ts`,
// que la station lance aussi en direct.
//
// C'est par elle que l'app de l'ordinateur appaire un téléphone sans terminal
// ni `sudo` à taper : elle la lance par `ssh`, comme ses autres lectures de la
// box, et le geste de la station (`deploy/brigade`) ne la laisse partir que
// pour celui que sa règle sudoers nomme — tout autre est refusé avant que rien
// ne soit lu ni écrit. Le registre est celui de l'unité de la station, celui
// où son guichet reçoit le téléphone : le projet nommé ne sert qu'au geste.
import { enProcess } from "./appel.ts";
import { principal } from "./telephone/appairage-cli.ts";

export const LANCE = "brigade <project> phones";

if (import.meta.main) await enProcess((appel) => principal(appel, { lance: LANCE }));
