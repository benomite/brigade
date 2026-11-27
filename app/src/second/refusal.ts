// Les gestes que le second ne fait jamais, refusés par un crochet `PreToolUse` (role.md : « You never merge a
// pull request », « You never read the chef's secrets ») : le rôle le dit, ce crochet le tient. `claude` joue ce
// module avant chaque appel d'outil Bash, Read ou Grep du second, lui passe l'appel en JSON sur l'entrée
// standard, et lit la réponse sur la sortie standard.
//
// Le crochet n'est que dans les réglages du lancement de l'onglet Second (launch.ts, `--settings`) : aucun
// fichier du projet ne le porte, une autre session `claude` du même dossier n'est pas restreinte.
//
// Le refus nomme le geste que le chef tape à la place, dans les mots de role.md et de commands/po.md :
// `!gh pr merge <N> --squash`. Ce module se joue par Node seul : il n'importe rien de l'app.
import { sep } from "node:path";
import type { Hooks } from "./launch.ts";

export const EVENT = "PreToolUse";
export const MATCHER = "Bash|Read|Grep";

// Les secrets du chef — la seule liste à étendre. Un fichier se reconnaît à son nom (`nom`, ou `nom.suite`) ;
// une commande Bash, à un motif. Le fichier du jeton Max est celui que `variablesDeFichier` désigne : sa valeur
// est lue dans l'environnement du crochet, à l'exécution.
export const SECRETS = {
  noms: [".env.local"],
  motifs: [/\.env\.local\b/, /\bCLAUDE_CODE_OAUTH_TOKEN\b/, /\bBRIGADE_CLAUDE_TOKEN_FILE\b/, /\bprintenv\b/, /\/proc\/[^\s/]+\/environ\b/],
  variablesDeFichier: ["BRIGADE_CLAUDE_TOKEN_FILE"],
};

// `gh pr merge`, avec ses options, enchaîné (`&&`, `;`, `|`, retour à la ligne), dans un sous-shell ou une
// chaîne (`bash -c "…"`), avec des options de `gh` avant la sous-commande (`gh -R x/y pr merge`).
const MERGE = /(?:^|[^\w./-])gh\b[^;&|\n)]*?\bpr\s+merge\b(?<suite>[^;&|\n)]*)/;

export type Call = { tool_name?: string; tool_input?: Record<string, unknown> };
export type Refusal = { raison: string };

const MERGE_REFUSES = (number: string) =>
  `Merging a pull request is the chef's gesture, never the second's, even when asked. Tell the chef, in one sentence, that you cannot merge it and give them the command to type themselves in this tab, with \`!\` in front: \`!gh pr merge ${number} --squash\`.`;
const SECRET_REFUSES = (what: string) =>
  `${what} is one of the chef's secrets (\`.env.local\` files, the Max token — the file named by \`BRIGADE_CLAUDE_TOKEN_FILE\`, and \`CLAUDE_CODE_OAUTH_TOKEN\`): the second never reads them. If the request needs them, say so in one sentence and let the chef do it themselves in this tab, with \`!\` in front of the command (for example \`!cat .env.local\`). Do not work around this refusal.`;

const nameOf = (path: string) => path.split(/[\\/]/).at(-1) ?? path;

// Les fichiers du jeton Max, tels que l'environnement du crochet les désigne.
function filesOfToken(env: NodeJS.ProcessEnv): string[] {
  return SECRETS.variablesDeFichier.flatMap((variable) => (env[variable] ? [env[variable] as string] : []));
}

function pathSecret(path: string, env: NodeJS.ProcessEnv): boolean {
  const name = nameOf(path);
  if (SECRETS.noms.some((secret) => name === secret || name.startsWith(`${secret}.`))) return true;
  return filesOfToken(env).some((token) => path === token);
}

// Ce que le crochet décide d'un appel : un refus, ou rien (l'appel passe).
export function decide(call: Call, env: NodeJS.ProcessEnv = process.env): Refusal | undefined {
  const entry = call.tool_input ?? {};
  if (call.tool_name === "Bash") {
    const command = typeof entry.command === "string" ? entry.command : "";
    const merge = MERGE.exec(command);
    if (merge !== null) {
      const number = /(?:^|\s)(\d+|https?:\/\/\S+|[\w.-]+\/[\w.-]+#\d+)(?=\s|$)/.exec(merge.groups?.suite ?? "")?.[1] ?? "<N>";
      return { raison: MERGE_REFUSES(number) };
    }
    if (SECRETS.motifs.some((motive) => motive.test(command)) || filesOfToken(env).some((token) => command.includes(token))) {
      return { raison: SECRET_REFUSES("What this command reads") };
    }
    return undefined;
  }
  // Read (`file_path`) et Grep (`path`, ou un `glob` qui nomme le fichier).
  const paths = [entry.file_path, entry.path, entry.glob].filter((c): c is string => typeof c === "string" && c !== "");
  const secret = paths.find((path) => pathSecret(path, env));
  return secret === undefined ? undefined : { raison: SECRET_REFUSES(`\`${secret}\``) };
}

// Le format que `claude` attend d'un crochet `PreToolUse` : du JSON sur la sortie standard. Un appel permis ne
// rend rien — sortie vide, code 0.
export const outputOfHook = (refusal: Refusal): string =>
  JSON.stringify({ hookSpecificOutput: { hookEventName: EVENT, permissionDecision: "deny", permissionDecisionReason: refusal.raison } });

// Citée pour le shell qui joue le crochet (comme second/file.ts : sous Windows, le `bash` de Git lit `C:/…`).
const cite = (word: string, separator: string) => `'${(separator === "\\" ? word.replaceAll("\\", "/") : word).replaceAll("'", `'\\''`)}'`;

// Le crochet des réglages du second : `node refusal.ts`.
export function hooksOfRefusal(options: { node: string; script?: string; separateur?: string }): Hooks {
  const separator = options.separateur ?? sep;
  const command = [options.node, options.script ?? import.meta.filename].map((word) => cite(word, separator)).join(" ");
  return { [EVENT]: [{ matcher: MATCHER, hooks: [{ type: "command", command }] }] };
}

// Joué par `claude` : l'appel sur l'entrée standard. Une entrée illisible n'est pas un refus — le crochet ne
// bloque que ce qu'il reconnaît.
if (import.meta.main) {
  let text = "";
  for await (const piece of process.stdin) text += piece;
  try {
    const refusal = decide(JSON.parse(text) as Call);
    if (refusal !== undefined) process.stdout.write(`${outputOfHook(refusal)}\n`);
  } catch {
    // rien : l'appel passe
  }
  process.exit(0);
}
