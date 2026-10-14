// Prépare un projet pour le mode auto de Claude Code, sur le poste du chef :
//   node runtime/src/mode-auto-cli.ts <dossier du projet> [--hote <hote>] [--nom <nom>]
//
// Pose dans `<dossier>/.claude/settings.json` les règles `permissions.allow`
// des gestes que les rôles prévoient (`mode-auto.ts`), sans rien y retirer ni
// répéter — elle se rejoue sans dégât —, puis dit, geste par geste, ce que la
// configuration couvre et ce qu'elle ne peut pas couvrir. `/brigade:init` la
// lance ; le chef peut la relancer quand il veut.
//
// L'hôte et le nom se lisent dans la déclaration de l'app (`app.json`, le
// projet dont `dossier` est celui-ci), comme le second les lit ; `--hote` et
// `--nom` les remplacent. Sans hôte, les lectures de la box ne se posent pas,
// et la sortie le dit.
//
// Elle n'est pas une commande de `package.json`, exprès : le geste de la box
// lance toutes celles-là, et celle-ci écrit dans un dossier qu'on lui nomme —
// elle n'a rien à faire sur la box.
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { enProcess, Sortie, type Appel } from "./appel.ts";
import { CibleInvalide, GESTES, poserLesRegles, reglesDuGeste, reglesDuModeAuto, REGLAGES_DU_PROJET, ReglagesIllisibles, ROLES, type Cible, type Pose } from "./mode-auto.ts";

const USAGE = "usage : node runtime/src/mode-auto-cli.ts <dossier du projet> [--hote <hote>] [--nom <nom>]";
const MAL_APPELEE = 64;
const REFUSEE = 65;

type Lue = { cible: Cible; depuis?: string; pourquoi?: string };

// Le projet de ce dossier dans la déclaration de l'app, s'il y est.
function lireLApp(chemin: string, dossier: string, maison: string): Lue {
  if (!existsSync(chemin)) return { cible: {}, pourquoi: `${chemin} n'existe pas` };
  let contenu: unknown;
  try {
    contenu = JSON.parse(readFileSync(chemin, "utf8"));
  } catch (erreur) {
    return { cible: {}, pourquoi: `${chemin} n'est pas du JSON (${(erreur as Error).message})` };
  }
  const projets = (contenu as { projets?: unknown })?.projets;
  for (const projet of Array.isArray(projets) ? projets : []) {
    const { nom, dossier: le, hote } = (projet ?? {}) as { nom?: unknown; dossier?: unknown; hote?: unknown };
    if (typeof le !== "string" || typeof nom !== "string") continue;
    const absolu = le === "~" || le.startsWith("~/") ? join(maison, le.slice(1)) : le;
    if (!isAbsolute(absolu) || !existsSync(absolu) || realpathSync(absolu) !== dossier) continue;
    return { cible: { nom, ...(typeof hote === "string" && hote.trim() !== "" ? { hote: hote.trim() } : {}) }, depuis: chemin };
  }
  return { cible: {}, pourquoi: `aucun projet de ${chemin} n'a ce dossier` };
}

export function principal({ args, env, dire, redire }: Appel): void {
  function refuser(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }

  const positionnels: string[] = [];
  const options: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg === "--hote" || arg === "--nom") {
      const valeur = args[++i];
      if (valeur === undefined) refuser(MAL_APPELEE, `${arg} attend une valeur\n${USAGE}`);
      options[arg.slice(2)] = valeur;
    } else if (arg.startsWith("-")) refuser(MAL_APPELEE, `option inconnue : ${arg}\n${USAGE}`);
    else positionnels.push(arg);
  }
  const [nommee] = positionnels;
  if (nommee === undefined || positionnels.length !== 1) refuser(MAL_APPELEE, USAGE);
  const nomme = resolve(nommee);
  if (!existsSync(nomme)) refuser(MAL_APPELEE, `${nomme} n'existe pas`);
  const dossier = realpathSync(nomme);

  const maison = env.HOME ?? homedir();
  const app = lireLApp(env.BRIGADE_APP_CONFIG ?? join(maison, ".config/brigade/app.json"), dossier, maison);
  const cible: Cible = { ...app.cible, ...(options.nom === undefined ? {} : { nom: options.nom }), ...(options.hote === undefined ? {} : { hote: options.hote }) };

  let regles: string[];
  try {
    regles = reglesDuModeAuto(cible);
  } catch (erreur) {
    if (!(erreur instanceof CibleInvalide)) throw erreur;
    refuser(REFUSEE, `${erreur.message} — rien n'est écrit`);
  }

  const fichier = join(dossier, REGLAGES_DU_PROJET);
  const avant = existsSync(fichier) ? readFileSync(fichier, "utf8") : undefined;
  let pose: Pose;
  try {
    pose = poserLesRegles(avant, regles);
  } catch (erreur) {
    if (!(erreur instanceof ReglagesIllisibles)) throw erreur;
    refuser(REFUSEE, `${fichier} : ${erreur.message} — rien n'est écrit ; corrige-le, puis relance`);
  }
  if (pose.texte !== undefined) {
    mkdirSync(dirname(fichier), { recursive: true });
    writeFileSync(fichier, pose.texte);
  }

  dire(`mode auto — ${fichier}`);
  dire(
    cible.hote !== undefined && cible.nom !== undefined
      ? `  box : \`${cible.hote}\`, projet « ${cible.nom} »${app.depuis !== undefined && options.hote === undefined ? ` (lus dans ${app.depuis})` : ""}`
      : `  box : AUCUN HÔTE — ${cible.nom === undefined ? "ni nom ni hôte" : "pas d'hôte"} pour ce projet (${app.pourquoi ?? `${app.depuis} ne lui donne pas d'\`hote\``}) : les lectures de la box ne sont pas posées. Ajoute le projet dans l'app avec sa box, ou passe --hote et --nom, puis relance.`,
  );
  dire(pose.ajoutees.length === 0 ? `  ${pose.dejaLa.length} règle(s), toutes déjà là : rien n'est écrit` : `  ${pose.ajoutees.length} règle(s) ajoutée(s), ${pose.dejaLa.length} déjà là — le reste du fichier est inchangé`);
  for (const regle of pose.ajoutees) dire(`    + ${regle}`);

  for (const role of ROLES) {
    dire("");
    dire(role);
    for (const geste of GESTES.filter((g) => g.role === role)) {
      const siennes = reglesDuGeste(geste, cible);
      if (siennes === undefined) dire(`  NON POSÉ        ${geste.libelle} — il faut l'hôte et le nom du projet`);
      else if ("regles" in geste) dire(`  AUTORISÉ        ${geste.libelle} — ${siennes.length} règle(s), au caractère près`);
      else if ("classifieur" in geste) dire(`  SANS RÈGLE      ${geste.libelle} — ${geste.classifieur}`);
      else dire(`  PAS AUTORISABLE ${geste.libelle} — ${geste.impossible}`);
    }
  }

  dire("");
  dire("Ce que la configuration du projet ne fait pas :");
  dire("  - aucune règle `autoMode` : Claude Code ne les lit pas depuis le dépôt. Le classifieur reste souverain sur tout geste qu'aucune règle ne nomme ; un refus, le rôle le dit en une phrase, avec le geste à faire.");
  dire("  - rien avant le dialogue de confiance : Claude Code n'applique les règles `allow` d'un `.claude/settings.json` qu'une fois le dossier accepté. Le fichier se merge avec le reste de `/brigade:init` : c'est ainsi qu'il gagne les autres clones du projet.");
  dire("  - une lecture de la box écrite autrement — sans les options du `ssh`, avec un argument, entre guillemets — n'est pas reconnue : elle passe par le classifieur.");
}

if (import.meta.main) await enProcess(principal);
