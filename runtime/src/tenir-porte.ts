// Point d'entrée de la porte d'un projet : `npm --prefix runtime run porte`,
// ou l'unité `brigade-porte@<projet>.service`. Elle tourne hors du filtre
// réseau de l'unité du runtime — c'est elle, la sortie — et ne lit que le
// journal : sa liste blanche y est publiée par le runtime, et ses refus y
// entrent. Le journal n'est ouvert que le temps d'un geste : une restauration
// ne trouve pas la porte assise dessus.
import { existsSync } from "node:fs";
import { cheminJournal, ouvrirJournal } from "./journal.ts";
import { AUTRES_HOTES, compterLesRefus, garderLaListe, ouvrirPorte } from "./porte.ts";
import { configReseau, REGLES_DE_BASE, reglesDuProjet, type Regle } from "./reseau.ts";
import { ConfigInvalide } from "./runtime.ts";

const REFUS = 2;
const AUTEUR = "porte";
// Ce que la liste se garde entre deux lectures du journal. Un hôte
// fraîchement publié n'attend pas ce délai : la porte relit avant de refuser.
const RELECTURE_MS = 5000;
// Une relecture avant refus par seconde au plus : une rafale de refus ne fait
// pas ouvrir le journal à chaque connexion.
const RELECTURE_AVANT_REFUS_MS = 1000;

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

const dire = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Avant le premier démarrage du runtime, il n'y a pas de journal : le socle
// suffit à rapatrier le dépôt, d'où viendra le reste.
const regles = garderLaListe(
  (): Regle[] => {
    if (!existsSync(cheminJournal(repertoireEtat))) return REGLES_DE_BASE;
    const journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
    try {
      return reglesDuProjet(journal.duType("network.declared", 1)[0]?.payload.hosts ?? []);
    } finally {
      journal.fermer();
    }
  },
  { delaiMs: RELECTURE_MS, plancherFraisMs: RELECTURE_AVANT_REFUS_MS },
);

const surRefus = compterLesRefus((refus) => {
  console.error(`brigade : sortie refusée — ${refus.host === AUTRES_HOTES ? "d'autres hôtes encore, qui ne sont plus nommés" : `${refus.host}:${refus.port}`}${refus.count > 1 ? ` (${refus.count} tentatives)` : ""}`);
  try {
    if (!existsSync(cheminJournal(repertoireEtat))) return;
    const journal = ouvrirJournal(repertoireEtat);
    try {
      journal.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "network.refused", payload: refus });
    } finally {
      journal.fermer();
    }
  } catch (erreur) {
    console.error(`brigade : refus non journalisé — ${dire(erreur)}`);
  }
});

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
