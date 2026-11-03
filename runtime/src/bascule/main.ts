// La bascule, telle que le paquet de la station la joue (`debian/postinst`),
// sous root :
//
//   node src/bascule/main.ts [--racine <r>]            lit l'ancienne installation et la bascule
//   node src/bascule/main.ts attendre [--racine <r>]   attend que la station serve ce qu'elle a repris
//
// `--racine` : la racine de la machine (`/` par défaut) ; une installation de
// test la pose ailleurs.
//
// Codes de sortie :
//   0  basculée, ou rien à basculer ; reprise constatée, ou rien à attendre
//   1  bascule refusée (rien n'a changé) ou en échec, dite en une ligne ; reprise non constatée
import { enProcess, Sortie, type Appel } from "../appel.ts";
import { attendreLaReprise, basculer, BasculeEnEchec, type Systemctl } from "./basculer.ts";
import { lieux, lireAncienneInstallation } from "./ancienne.ts";

// La bascule en commande (`appel.ts`) : son process la joue, un test aussi,
// avec le systemd qu'il lui donne — à défaut, le vrai.
export async function principal({ args, dire, redire }: Appel, options: { systemctl?: Systemctl } = {}): Promise<void> {
  const attendre = args[0] === "attendre";
  const option = args.indexOf("--racine");
  const racine = option >= 0 ? (args[option + 1] ?? "/") : "/";
  const ici = lieux(racine);

  if (attendre) {
    if (!(await attendreLaReprise(ici, { dire }))) throw new Sortie(1);
    return;
  }

  const { plan, refus } = lireAncienneInstallation(ici);
  if (refus.length > 0) {
    redire("bascule refusée — rien n'a changé : les anciennes unités servent toujours leurs projets, la station n'en sert aucun. Ce qui l'empêche :");
    for (const ligne of refus) redire(`  ${ligne}`);
    redire("Une fois réglé, relancer l'installation : elle reprend la bascule.");
    throw new Sortie(1);
  }
  if (plan === null) return;

  try {
    const note = basculer(plan, ici, { dire, ...options });
    dire(`bascule : faite — ${note.projets.length === 0 ? "aucun projet à reprendre" : `${note.projets.length} projet${note.projets.length > 1 ? "s" : ""} remis à la station : ${note.projets.join(", ")}`}`);
  } catch (erreur) {
    if (!(erreur instanceof BasculeEnEchec)) throw erreur;
    redire(`bascule en échec — ${erreur.message}. Relancer l'installation la reprend où elle s'est arrêtée.`);
    throw new Sortie(1);
  }
}

if (import.meta.main) await enProcess(principal);
