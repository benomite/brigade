// Point d'entrée de l'arbitre entre projets : `npm --prefix runtime run
// tenir-arbitre`, ou l'unité `brigade-arbitre.service`. Un seul par machine,
// au-dessus des runtimes de projet : il ne lance rien, ne lit aucun journal,
// et ne sort pas de la boucle locale.
import { arbiterConfig, openArbiter, serveArbiter, type Arbiter, type ArbiterConfig, type ArbiterServer } from "./arbiter.ts";
import { ConfigInvalide, DejaEnCours } from "./runtime.ts";

const REFUS = 2;

function refuser(motif: string): never {
  console.error(`brigade : the arbiter refuses to start — ${motif}`);
  process.exit(REFUS);
}

let config: ArbiterConfig;
let arbiter: Arbiter;
try {
  // Toute la configuration est lue avant de rien écrire.
  config = arbiterConfig(process.env);
  arbiter = openArbiter(config);
} catch (erreur) {
  if (erreur instanceof ConfigInvalide || erreur instanceof DejaEnCours) refuser(erreur.message);
  throw erreur;
}

let server: ArbiterServer;
try {
  server = await serveArbiter(arbiter, config.port);
} catch (erreur) {
  arbiter.fermer();
  // Un port pris ne se libère pas en réessayant : c'est au chef d'en poser un autre.
  if ((erreur as NodeJS.ErrnoException).code === "EADDRINUSE") refuser(`port ${config.port} is already taken (BRIGADE_ARBITER_PORT)`);
  throw erreur;
}
const connus = arbiter.etat().projets.filter((projet) => projet.presence === "muet").map((projet) => projet.projet);
console.log(
  `brigade : arbiter open — 127.0.0.1:${server.port}, account cap: ${config.plafond} cooks, settings in ${config.repertoire}` +
    (connus.length === 0 ? "" : `; share reserved, until they speak again: ${connus.join(", ")}`),
);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    void server.fermer().then(() => {
      arbiter.fermer();
      console.log(`brigade : arbiter closed (${signal}) — each project launches at most one cook at a time until it is back`);
      process.exit(0);
    });
  });
}
