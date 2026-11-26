// The morning of the logbook (#4280, spec 2026-11-23-autonomy-trust-control, T1 and Q3): on the runtime's tick, once
// each morning, the digest of the previous day is built from the agents' threads (`autonomie/agents/gestes.ts`) and
// the post-mortems (`post-mortems/post-mortems.ts`), and published for the project view (publication.ts). Nothing is
// pushed. A thread or a post-mortem file that cannot be read publishes nothing: it is said, and tried again ten
// minutes later.
import { GestesIllisibles, tousLesGestes } from "../autonomie/agents/gestes.ts";
import type { Journal } from "../journal.ts";
import { lireLesFinsDesPannes, lirePostMortems } from "../post-mortems/post-mortems.ts";
import type { Runtime } from "../runtime.ts";
import { digestDeLaVeille, jourDeLaVeille } from "./digest.ts";
import { dernierDigest, publierLeDigest } from "./publication.ts";

// The digest of the previous day is built on the first tick at or after this hour (UTC): 7:00 in Paris in winter.
const HEURE_DU_DIGEST_UTC = 6;
const RELANCE_MS = 10 * 60_000;

type Passage = "pas-encore" | "deja-publie" | "publie" | "echec";

const uneLigne = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur)).split("\n")[0] ?? "";

// One pass: before the morning hour, or once the digest of the previous day is out, nothing.
function passerLeDigest(journal: Journal, projet: string, repertoireEtat: string, maintenant: Date, avertir: (ligne: string) => void): Passage {
  if (maintenant.getUTCHours() < HEURE_DU_DIGEST_UTC) return "pas-encore";
  const jour = jourDeLaVeille(maintenant);
  if (dernierDigest(journal)?.day === jour) return "deja-publie";
  let texte: string;
  try {
    const fins = lireLesFinsDesPannes(repertoireEtat, projet);
    const postMortems = lirePostMortems(repertoireEtat, projet).map((postMortem, rang) => ({ ...postMortem, fin: fins[rang] as string }));
    texte = digestDeLaVeille({ postMortems, fils: tousLesGestes(repertoireEtat) }, maintenant);
  } catch (erreur) {
    const quoi = erreur instanceof GestesIllisibles ? "the agents' threads do not read" : "the post-mortems do not read";
    avertir(`digest of ${jour} — not published, ${quoi}, tried again later: ${uneLigne(erreur)}`);
    return "echec";
  }
  return publierLeDigest(journal, projet, texte, { jour }) ? "publie" : "deja-publie";
}

// The digest, on each tick of the runtime; after a failed pass, none before `RELANCE_MS`.
export function brancherLeDigest<R extends Pick<Runtime, "journal" | "projet" | "surReveil">>(runtime: R, { repertoireEtat, avertir, maintenant = () => new Date() }: { repertoireEtat: string; avertir: (ligne: string) => void; maintenant?: () => Date }): R {
  let pasAvant = 0;
  runtime.surReveil((cause) => {
    if (cause !== "tick" || maintenant().getTime() < pasAvant) return;
    if (passerLeDigest(runtime.journal, runtime.projet, repertoireEtat, maintenant(), avertir) === "echec") pasAvant = maintenant().getTime() + RELANCE_MS;
  });
  return runtime;
}
