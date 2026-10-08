// Sauvegarde l'état du projet : `npm --prefix runtime run sauvegarder`, ou le
// timer systemd (brigade-sauvegarde@<projet>.timer). Se joue pendant que le
// runtime tourne. La destination vient de l'environnement, sans défaut : une
// sauvegarde qui choisit seule où elle va finit sur le disque qu'elle devait
// protéger.
import { sauvegarder, SauvegardeRefusee } from "./sauvegarde.ts";

const USAGE = "usage : BRIGADE_STATE_DIR=<répertoire d'état> BRIGADE_BACKUP_DIR=<destination> npm --prefix runtime run sauvegarder";
const REFUS = 2;
// Le nombre de sauvegardes datées gardées, sans BRIGADE_BACKUP_KEEP.
const GARDEES = 14;

function echouer(code: number, message: string): never {
  console.error(`brigade : ${message}`);
  process.exit(code);
}

function exiger(variable: string): string {
  const valeur = process.env[variable];
  if (!valeur) echouer(REFUS, `${variable} n'est pas défini\n${USAGE}`);
  return valeur;
}

const repertoireEtat = exiger("BRIGADE_STATE_DIR");
const destination = exiger("BRIGADE_BACKUP_DIR");
const reglage = process.env.BRIGADE_BACKUP_KEEP;
if (reglage !== undefined && !/^[1-9][0-9]*$/.test(reglage)) {
  echouer(REFUS, `BRIGADE_BACKUP_KEEP invalide : « ${reglage} » — attendu un nombre de sauvegardes, 1 au moins`);
}
const garder = reglage === undefined ? GARDEES : Number(reglage);

const nombre = (valeur: number) => valeur.toLocaleString("fr-FR");

let bilan;
try {
  bilan = sauvegarder({ repertoireEtat, destination, garder });
} catch (erreur) {
  const message = erreur instanceof Error ? erreur.message : String(erreur);
  if (erreur instanceof SauvegardeRefusee) echouer(REFUS, `sauvegarde refusée — ${message}`);
  echouer(1, `sauvegarde en échec — ${message}`);
}
if (bilan === null) {
  console.log(`brigade : rien à sauvegarder — aucun journal dans ${repertoireEtat}`);
} else {
  console.log(
    `brigade : sauvegarde ${bilan.nom} — projet « ${bilan.projet} », ${nombre(bilan.evenements)} événements jusqu'au n° ${bilan.dernierSeq}, ` +
      `${nombre(bilan.flux.total)} flux bruts dont ${nombre(bilan.flux.copies)} recopiés, dans ${bilan.chemin}`,
  );
  if (bilan.retirees.length > 0) console.log(`brigade : ${garder} sauvegardes gardées, retirées : ${bilan.retirees.join(", ")}`);
}
