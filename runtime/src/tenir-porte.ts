// Point d'entrée de la porte d'un projet : `npm --prefix runtime run porte`,
// ou l'unité `brigade-porte@<projet>.service`. Elle tourne hors du filtre
// réseau de l'unité du runtime — c'est elle, la sortie — et ne lit que le
// journal : sa liste blanche y est publiée par le runtime, et ses refus y
// entrent. Le journal n'est ouvert que le temps d'un geste : une restauration
// ne trouve pas la porte assise dessus.
import { existsSync } from "node:fs";
import { cheminJournal, ouvrirJournal } from "./journal.ts";
import { compterLesRefus, ouvrirPorte } from "./porte.ts";
import { configReseau, REGLES_DE_BASE, reglesDuProjet, type Regle } from "./reseau.ts";
import { ConfigInvalide } from "./runtime.ts";

const REFUS = 2;
const AUTEUR = "porte";
// Un hôte fraîchement mergé s'ouvre dans ce délai, sans rien redémarrer.
const RELECTURE_MS = 5000;

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
let lues: { regles: Regle[]; le: number } | null = null;
function regles(): Regle[] {
  if (lues !== null && Date.now() - lues.le < RELECTURE_MS) return lues.regles;
  let courantes = REGLES_DE_BASE;
  try {
    if (existsSync(cheminJournal(repertoireEtat))) {
      const journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
      try {
        courantes = reglesDuProjet(journal.duType("network.declared", 1)[0]?.payload.hosts ?? []);
      } finally {
        journal.fermer();
      }
    }
  } catch (erreur) {
    // Une liste illisible ne ferme pas la porte au socle, et n'ouvre rien d'autre.
    console.error(`brigade : liste blanche illisible, la porte s'en tient au socle — ${dire(erreur)}`);
    courantes = lues?.regles ?? REGLES_DE_BASE;
  }
  lues = { regles: courantes, le: Date.now() };
  return courantes;
}

const surRefus = compterLesRefus((refus) => {
  console.error(`brigade : sortie refusée — ${refus.host}:${refus.port}${refus.count > 1 ? ` (${refus.count} tentatives)` : ""}`);
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
