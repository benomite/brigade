// Point d'entrée de la porte d'un projet : `npm --prefix runtime run door`,
// ou l'unité `brigade-porte@<projet>.service`. Elle tourne hors du filtre
// réseau de l'unité du runtime — c'est elle, la sortie — et ne lit que le
// journal : sa liste blanche y est publiée par le runtime, et ses refus y
// entrent. Le journal n'est ouvert que le temps d'un geste : une restauration
// ne trouve pas la porte assise dessus.
import { ouvrirPorte } from "./porte.ts";
import { listeDuJournal, refusAuJournal } from "./porte-journal.ts";
import { configReseau } from "./reseau.ts";
import { ConfigInvalide } from "./runtime.ts";

const REFUS = 2;

function refuser(motif: string): never {
  console.error(`brigade : la porte refuse de démarrer — ${motif}`);
  process.exit(REFUS);
}

const repertoireEtat = process.env.BRIGADE_STATE_DIR || refuser("BRIGADE_STATE_DIR n'est pas défini");
const projet = process.env.BRIGADE_PROJECT || refuser("BRIGADE_PROJECT n'est pas défini");
let port: number | null;
try {
  port = configReseau(process.env);
} catch (erreur) {
  if (erreur instanceof ConfigInvalide) refuser(erreur.message);
  throw erreur;
}
if (port === null) refuser("BRIGADE_PROXY_PORT n'est pas défini");

const regles = listeDuJournal(repertoireEtat);
const surRefus = refusAuJournal(repertoireEtat, projet);

const porte = await ouvrirPorte({ port, projet, regles, surRefus });
console.log(`brigade : porte du projet « ${projet} » ouverte — 127.0.0.1:${porte.port}, liste blanche lue dans ${repertoireEtat}`);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    void porte.fermer().then(() => {
      console.log(`brigade : porte du projet « ${projet} » fermée (${signal})`);
      process.exit(0);
    });
  });
}
