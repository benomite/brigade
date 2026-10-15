// Écrit la déclaration réseau d'un projet, depuis son worktree-setup.sh :
//   node runtime/src/reseau-cli.ts <dossier du projet>
//
// `/brigade:init` la lance après avoir écrit les scripts. Elle ne laisse
// jamais le fichier absent : un setup sans hôte externe donne un fichier vide
// commenté, un setup qu'elle ne sait pas traduire un fichier « NON DÉTERMINÉ ».
// Les hôtes viennent des lignes d'installation connues (`INSTALLEURS`) et de
// toute URL que le setup nomme (une dépendance tirée de
// `https://cdn.sheetjs.com/…` donne `cdn.sheetjs.com`).
//
// Un fichier déjà là n'est jamais réécrit : elle dit les hôtes qui lui
// manquent, et c'est l'humain qui les ajoute. Elle n'est pas une commande de
// `package.json`, pour la même raison que `mode-auto-cli.ts`.
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { enProcess, Sortie, type Appel } from "./appel.ts";
import { DECLARATION_RESEAU, lireDeclaration, REGLES_DE_BASE } from "./reseau.ts";

const USAGE = "usage : node runtime/src/reseau-cli.ts <dossier du projet>";
const MAL_APPELEE = 64;
const SETUP = ".claude/brigade/worktree-setup.sh";

// Ce que le setup lance, et les hôtes que cela ouvre.
const INSTALLEURS: { motif: RegExp; hotes: string[] }[] = [
  { motif: /\b(npm\s+(ci|install|i)|pnpm\s+(install|i|add)|bun\s+(install|add))\b/, hotes: ["registry.npmjs.org"] },
  { motif: /\byarn(\s+install|\s*$)/, hotes: ["registry.yarnpkg.com"] },
  { motif: /\b(pip3?\s+install|uv\s+(sync|pip)|poetry\s+install)\b/, hotes: ["pypi.org", "files.pythonhosted.org"] },
  { motif: /\bcargo\s+(fetch|build)\b/, hotes: ["index.crates.io", "static.crates.io"] },
  { motif: /\bgo\s+(mod\s+download|build)\b/, hotes: ["proxy.golang.org", "sum.golang.org"] },
  { motif: /\bbundle\s+install\b/, hotes: ["rubygems.org"] },
  { motif: /\bcomposer\s+install\b/, hotes: ["repo.packagist.org"] },
];
// Un installeur que le tableau ne connaît pas : on ne devine pas son hôte.
const INCONNUS = /\b(apt(-get)?|brew|gem|mix|dotnet|nuget|conda|mamba|pipx|deno|swift|flutter|pub)\s+(install|add|get|restore|fetch|package)\b/;

const URL_DE_DEPENDANCE = /https?:\/\/([a-z0-9][a-z0-9.-]*\.[a-z][a-z0-9-]*)(:[0-9]+)?(?=[/\s"'`)]|$)/gi;
const DU_SOCLE = REGLES_DE_BASE.map((regle) => regle.hote);
const duSocle = (hote: string) => DU_SOCLE.some((base) => hote === base || hote.endsWith(`.${base}`));

export type Deduction = { hotes: { hote: string; ligne: string }[]; inconnues: string[] };

// Les hôtes que ce texte de setup ouvre, ligne par ligne ; commentaires exclus.
export function deduireLesHotes(setup: string): Deduction {
  const hotes: Deduction["hotes"] = [];
  const inconnues: string[] = [];
  const ajouter = (hote: string, ligne: string) => {
    if (!duSocle(hote) && !hotes.some((deja) => deja.hote === hote)) hotes.push({ hote, ligne });
  };
  for (const brute of setup.split("\n")) {
    const ligne = brute.trim();
    if (ligne === "" || ligne.startsWith("#")) continue;
    let connue = false;
    for (const { motif, hotes: siens } of INSTALLEURS) {
      if (!motif.test(ligne)) continue;
      connue = true;
      for (const hote of siens) ajouter(hote, ligne);
    }
    for (const [, hote = "", port = ""] of ligne.matchAll(URL_DE_DEPENDANCE)) {
      connue = true;
      ajouter(`${hote.toLowerCase()}${port}`, ligne);
    }
    if (!connue && INCONNUS.test(ligne)) inconnues.push(ligne);
  }
  return { hotes, inconnues };
}

// Le fichier à écrire pour cette déduction : jamais vide de sens, jamais absent.
export function rediger({ hotes, inconnues }: Deduction): string {
  const tete = `# ${DECLARATION_RESEAU} — un hôte par ligne`;
  const lignes = [tete];
  if (inconnues.length > 0) {
    for (const ligne of inconnues) lignes.push(`# NON DÉTERMINÉ : /brigade:init n'a pas su traduire \`${ligne}\` en registre.`);
    lignes.push(hotes.length === 0 ? "# Aucun hôte n'est ouvert." : "# Seuls les hôtes ci-dessous sont ouverts.");
    lignes.push("# Un cook qui échoue à son setup nomme l'hôte refusé : ajoute-le ici, puis merge.");
  } else if (hotes.length === 0) {
    lignes.push("# Rien à ouvrir : le setup de worktree ne joint aucun hôte externe. Vérifié par /brigade:init.");
  } else {
    lignes.push("# Le setup de worktree de ce dépôt joint les hôtes ci-dessous ; sous cloison, ils doivent être nommés ici.");
  }
  for (const { hote, ligne } of hotes) lignes.push(`# ${hote} ← ${ligne.slice(0, 100)}`, hote);
  return `${lignes.join("\n")}\n`;
}

export function principal({ args, dire, redire }: Appel): void {
  const [nommee, ...reste] = args;
  if (nommee === undefined || reste.length > 0 || nommee.startsWith("-")) {
    redire(`brigade : ${USAGE}`);
    throw new Sortie(MAL_APPELEE);
  }
  const nomme = resolve(nommee);
  if (!existsSync(nomme)) {
    redire(`brigade : ${nomme} n'existe pas`);
    throw new Sortie(MAL_APPELEE);
  }
  const dossier = realpathSync(nomme);
  const script = join(dossier, SETUP);
  const fichier = join(dossier, DECLARATION_RESEAU);
  const setup = existsSync(script) ? readFileSync(script, "utf8") : null;
  // Pas de setup à lire : rien ne justifie un hôte, et le dit. Le fichier existe quand même.
  const deduction = setup === null ? { hotes: [], inconnues: [`${SETUP} (absent)`] } : deduireLesHotes(setup);

  if (!existsSync(fichier)) {
    mkdirSync(dirname(fichier), { recursive: true });
    writeFileSync(fichier, rediger(deduction));
    dire(`réseau — ${fichier} : écrit`);
  } else {
    const declares = lireDeclaration(readFileSync(fichier, "utf8")).hotes;
    const manquants = deduction.hotes.filter(({ hote }) => !declares.includes(hote));
    dire(`réseau — ${fichier} : déjà là, laissé tel quel`);
    for (const { hote, ligne } of manquants) dire(`  MANQUE ${hote} — ${ligne.slice(0, 100)}`);
    if (manquants.length === 0) dire("  tous les hôtes du setup y sont");
  }
  for (const { hote, ligne } of deduction.hotes) dire(`  ${hote} ← ${ligne.slice(0, 100)}`);
  for (const ligne of deduction.inconnues) dire(`  NON DÉTERMINÉ ${ligne}`);
  if (deduction.hotes.length === 0 && deduction.inconnues.length === 0) dire("  rien à ouvrir");
}

if (import.meta.main) await enProcess(principal);
