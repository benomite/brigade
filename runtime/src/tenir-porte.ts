// Point d'entrée de la porte d'un projet : `npm --prefix runtime run door`,
// ou l'unité `brigade-porte@<projet>.service`. Elle tourne hors du filtre
// réseau de l'unité du runtime — c'est elle, la sortie — et ne lit que le
// journal : sa liste blanche y est publiée par le runtime, et ses refus y
// entrent. Le journal n'est ouvert que le temps d'un geste : une restauration
// ne trouve pas la porte assise dessus.
import { openDoor } from "./door.ts";
import { logList, loggedRefusals } from "./door-log.ts";
import { configReseau } from "./reseau.ts";
import { ConfigInvalide } from "./runtime.ts";

const REFUS = 2;

function refuser(motif: string): never {
  console.error(`brigade : the door refuses to start — ${motif}`);
  process.exit(REFUS);
}

const repertoireEtat = process.env.BRIGADE_STATE_DIR || refuser("BRIGADE_STATE_DIR is not set");
const projet = process.env.BRIGADE_PROJECT || refuser("BRIGADE_PROJECT is not set");
let port: number | null;
try {
  port = configReseau(process.env);
} catch (erreur) {
  if (erreur instanceof ConfigInvalide) refuser(erreur.message);
  throw erreur;
}
if (port === null) refuser("BRIGADE_PROXY_PORT is not set");

const regles = logList(repertoireEtat);
const surRefus = loggedRefusals(repertoireEtat, projet);

const door = await openDoor({ port, projet, regles, surRefus });
console.log(`brigade : door of project “${projet}” open — 127.0.0.1:${door.port}, allowlist read from ${repertoireEtat}`);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    void door.fermer().then(() => {
      console.log(`brigade : door of project “${projet}” closed (${signal})`);
      process.exit(0);
    });
  });
}
