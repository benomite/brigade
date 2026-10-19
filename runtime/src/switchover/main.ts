// La bascule, telle que le paquet de la station la joue (`debian/postinst`),
// sous root :
//
//   node src/switchover/main.ts [--racine <r>]            lit l'ancienne installation et la bascule
//   node src/switchover/main.ts attendre [--racine <r>]   attend que la station serve ce qu'elle a repris
//
// `--racine` : la racine de la machine (`/` par défaut) ; une installation de
// test la pose ailleurs.
//
// Codes de sortie :
//   0  basculée, ou rien à basculer ; reprise constatée, ou rien à attendre
//   1  bascule refusée (rien n'a changé) ou en échec, dite en une ligne ; reprise non constatée
import { attendreLaReprise, basculer, BasculeEnEchec } from "./switch.ts";
import { lieux, lireAncienneInstallation } from "./previous.ts";

const args = process.argv.slice(2);
const attendre = args[0] === "attendre";
const option = args.indexOf("--racine");
const racine = option >= 0 ? (args[option + 1] ?? "/") : "/";
const ici = lieux(racine);

if (attendre) {
  process.exit((await attendreLaReprise(ici)) ? 0 : 1);
}

const { plan, refus } = lireAncienneInstallation(ici);
if (refus.length > 0) {
  console.error("bascule refusée — rien n'a changé : les anciennes unités servent toujours leurs projets, la station n'en sert aucun. Ce qui l'empêche :");
  for (const ligne of refus) console.error(`  ${ligne}`);
  console.error("Une fois réglé, relancer l'installation : elle reprend la bascule.");
  process.exit(1);
}
if (plan === null) process.exit(0);

try {
  const note = basculer(plan, ici);
  console.log(`bascule : faite — ${note.projets.length === 0 ? "aucun projet à reprendre" : `${note.projets.length} projet${note.projets.length > 1 ? "s" : ""} remis à la station : ${note.projets.join(", ")}`}`);
} catch (erreur) {
  if (!(erreur instanceof BasculeEnEchec)) throw erreur;
  console.error(`bascule en échec — ${erreur.message}. Relancer l'installation la reprend où elle s'est arrêtée.`);
  process.exit(1);
}
