// Sauvegarde l'état du projet : `npm --prefix runtime run backup`, ou le
// timer systemd (brigade-sauvegarde@<projet>.timer). Se joue pendant que le
// runtime tourne. La destination vient de l'environnement, sans défaut : une
// sauvegarde qui choisit seule où elle va finit sur le disque qu'elle devait
// protéger.
import { backup, BackupRefused } from "./backup.ts";

const USAGE = "usage: BRIGADE_STATE_DIR=<state directory> BRIGADE_BACKUP_DIR=<destination> npm --prefix runtime run backup";
const REFUS = 2;
// Le nombre de sauvegardes datées gardées, sans BRIGADE_BACKUP_KEEP.
const GARDEES = 14;

function echouer(code: number, message: string): never {
  console.error(`brigade : ${message}`);
  process.exit(code);
}

function exiger(variable: string): string {
  const valeur = process.env[variable];
  if (!valeur) echouer(REFUS, `${variable} is not set\n${USAGE}`);
  return valeur;
}

const repertoireEtat = exiger("BRIGADE_STATE_DIR");
const destination = exiger("BRIGADE_BACKUP_DIR");
const reglage = process.env.BRIGADE_BACKUP_KEEP;
if (reglage !== undefined && !/^[1-9][0-9]*$/.test(reglage)) {
  echouer(REFUS, `BRIGADE_BACKUP_KEEP is invalid: "${reglage}" — expected a number of backups, 1 at least`);
}
const garder = reglage === undefined ? GARDEES : Number(reglage);

const nombre = (valeur: number) => valeur.toLocaleString("en-US");

let bilan;
try {
  bilan = backup({ repertoireEtat, destination, garder });
} catch (erreur) {
  const message = erreur instanceof Error ? erreur.message : String(erreur);
  if (erreur instanceof BackupRefused) echouer(REFUS, `backup refused — ${message}`);
  echouer(1, `backup failed — ${message}`);
}
if (bilan === null) {
  console.log(`brigade : nothing to back up — no log in ${repertoireEtat}`);
} else {
  console.log(
    `brigade : backup ${bilan.nom} — project "${bilan.projet}", ${nombre(bilan.evenements)} events up to no. ${bilan.dernierSeq}, ` +
      `${nombre(bilan.flux.total)} raw streams of which ${nombre(bilan.flux.copies)} copied, in ${bilan.chemin}`,
  );
  if (bilan.nonJournalisee !== null) {
    console.error(`brigade : the backup is done, but its success could not be written to the log (backup.completed) — ${bilan.nonJournalisee}`);
  }
  if (bilan.retirees.length > 0) console.log(`brigade : ${garder} backups kept, removed: ${bilan.retirees.join(", ")}`);
}
