// `npm --prefix runtime run agents`: the Agents tab's read side (#4220), agents-tab/commande.ts. Played only when
// launched: the tests of the commands play its `principal` in their own process.
import { enProcess } from "./appel.ts";
import { principal } from "./agents-tab/commande.ts";

export { principal };

if (import.meta.main) await enProcess(principal);
