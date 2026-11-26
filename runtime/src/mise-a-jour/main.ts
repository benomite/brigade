// La mise à jour de la station, telle que son minuteur la lance
// (brigade-station-mise-a-jour.timer, livré par le paquet) : un passage, puis
// la main rendue. Elle tourne sous root — c'est elle qui remet un paquet à
// apt —, et c'est le seul process de la station qui le fait : le chef n'a
// aucune commande à taper.
//
//   node src/mise-a-jour/main.ts          un passage
//   node src/mise-a-jour/main.ts etat     où en est la mise à jour, sans rien installer
//
// L'environnement :
//   BRIGADE_STATION_DIR         le répertoire de la station (obligatoire)
//   BRIGADE_MISE_A_JOUR_DIR     le répertoire de la mise à jour (obligatoire)
//   BRIGADE_MISE_A_JOUR_SOURCE  où sont les versions publiées : github:<owner>/<repo>
//                               ou un répertoire (obligatoire ; le paquet la pose)
//   BRIGADE_MISE_A_JOUR_GARDE_S le temps laissé à la station pour démarrer (défaut 120)
//
// Codes de sortie : 0 le passage s'est fait — à jour, gelée, passée ou
// revenue, l'état le dit ; 1 le retour à la version d'avant a échoué lui
// aussi ; 2 refus (environnement invalide).
import { resolve } from "node:path";
import { lireEtatMiseAJour } from "./etat.ts";
import { decrireEtatMiseAJour } from "./dire.ts";
import { GARDE_MS, passer } from "./mettre-a-jour.ts";
import { publications } from "./publications.ts";
import { systemeDeLaMachine } from "./systeme.ts";

const REFUS = 2;

function refuser(motif: string): never {
  console.error(`brigade : mise à jour refusée — ${motif}`);
  process.exit(REFUS);
}

const racine = resolve(process.env.BRIGADE_STATION_DIR || refuser("BRIGADE_STATION_DIR n'est pas défini"));
const dossier = resolve(process.env.BRIGADE_MISE_A_JOUR_DIR || refuser("BRIGADE_MISE_A_JOUR_DIR n'est pas défini"));
const [commande] = process.argv.slice(2);

if (commande === "etat") {
  for (const ligne of decrireEtatMiseAJour(lireEtatMiseAJour(dossier))) console.log(ligne);
  process.exit(0);
}
if (commande !== undefined) refuser(`commande inconnue « ${commande} » — attendu rien (un passage) ou etat`);

const ARCHITECTURES: Record<string, string> = { x64: "amd64", arm64: "arm64" };
const arch = ARCHITECTURES[process.arch] ?? refuser(`aucun paquet de la station pour l'architecture ${process.arch}`);
const garde = process.env.BRIGADE_MISE_A_JOUR_GARDE_S;
if (garde !== undefined && !/^[1-9]\d*$/.test(garde)) refuser(`BRIGADE_MISE_A_JOUR_GARDE_S=${garde} — attendu un nombre entier de secondes`);

let source;
try {
  source = publications(process.env.BRIGADE_MISE_A_JOUR_SOURCE, arch);
} catch (erreur) {
  refuser((erreur as Error).message);
}

const { issue } = await passer({
  racine,
  dossier,
  systeme: systemeDeLaMachine(),
  publications: source,
  dire: (ligne) => console.log(ligne),
  gardeMs: garde === undefined ? GARDE_MS : Number(garde) * 1000,
});
process.exit(issue?.quoi === "revenue" && issue.retour !== null ? 1 : 0);
