// La session qui prépare un dépôt pour Brigade (#2595, #4632) : l'onglet Second l'ouvre (terminals.ts) avec ses
// instructions dans le prompt système, comme il donne `role.md` au second (second/launch.ts) — aucune commande du
// plugin n'est tapée ni montrée. Ce qu'elle écrit, elle le fait écrire par `init.sh`, à côté de ce module.
//
// Les instructions (`instructions.md`) nomment ce que la session lance par des marques — `@SCRIPT@` — que l'app remplace par leurs chemins sur ce poste : elle les pose, rendues, dans un dossier à elle
// (à côté du fichier des projets), avec le script et son catalogue de labels. Le script y est exécutable, quel que
// soit le mode que le paquet lui a laissé. Un fichier déjà tel quel n'est pas réécrit.
//
// Le texte des instructions ne passe pas par la ligne de commande : sous Windows, un `claude.cmd` ne reçoit aucun
// argument sur plusieurs lignes. Seul le premier message, d'une ligne, y passe.
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// Ce que l'app porte de la préparation : il est dans `src/`, que le paquet porte entier.
export const OWN = import.meta.dirname;
export const INSTRUCTIONS = "instructions.md";
export const SCRIPT = "init.sh";
// Le catalogue des labels que le script lit, posé à côté de lui.
export const CATALOG_OF_LABELS = "labels.tsv";
// Le dossier où l'app pose la préparation rendue, à côté du fichier des projets.
export const FOLDER = "setup";

// Le premier message de la session, sur une ligne : il la met en route, les instructions disent le reste.
export const START_OF_SETUP = "Set this repository up for Brigade as your setup instructions say.";
// Ce que l'app écrit dans un second qui tourne déjà, sans Entrée : ses instructions n'étant pas dans son prompt
// système, il les lit dans le fichier.
export const setupInWords = (instructions: string): string => `Set this repository up for Brigade: read ${instructions} and follow it.`;

// Pose la préparation dans `folder`, sa marque remplacée par le chemin du script ; rend le chemin des instructions.
export function setTheSetup(folder: string, own = OWN): string {
  // Les chemins en barres obliques : la session les passe à `bash` et `node`, Git Bash compris.
  const slashes = (path: string) => path.replaceAll("\\", "/");
  const script = join(folder, SCRIPT);
  write(script, readFileSync(join(own, SCRIPT), "utf8"));
  chmodSync(script, 0o755);
  write(join(folder, CATALOG_OF_LABELS), readFileSync(join(own, CATALOG_OF_LABELS), "utf8"));
  const instructions = join(folder, INSTRUCTIONS);
  write(
    instructions,
    readFileSync(join(own, INSTRUCTIONS), "utf8")
      .replaceAll("@SCRIPT@", slashes(script)),

  );
  return instructions;
}

// Sans dossier donné (les essais) : un dossier temporaire, le même pour tout ce lancement de l'app.
let temporary: string | undefined;
export const setTheSetupInTemporary = (): string => setTheSetup((temporary ??= mkdtempSync(join(tmpdir(), "brigade-setup-"))));

// Les arguments de `claude` pour la session : une conversation neuve, les instructions ajoutées à son prompt système,
// et son premier message.
export const argumentsOfSetup = (instructions: string): string[] => ["--append-system-prompt-file", instructions, START_OF_SETUP];

function write(path: string, content: string): void {
  try {
    if (readFileSync(path, "utf8") === content) return;
  } catch {}
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}
