// Le crochet du second pour une question de blocage (#4121) : la vue du projet que l'app a déposée, mise en texte par
// contexte-du-blocage.ts. Déclaré par hook-of-blockage.ts.
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Target } from "./hook-of-the-file.ts";
import { contextOfBlockage, type VueOfProject } from "./context-of-blockage.ts";

// Le chef demande pourquoi on est bloqués, ou ce qui se passe (#4121).
export const QUESTION_OF_BLOCKAGE = /bloqu|blocked|stuck|what('| i)s (happening|going on)|qu'est-ce qui se passe|que se passe/i;

// Un événement de fond (notification de tâche, moniteur) n'est pas un message du chef : il ne reçoit pas la vue.
const EVENT_OF_BACKGROUND = /^\s*(<task-notification|monitor event)/i;

// L'état de la vue du projet — bandeaux et cartes du rail — que l'app dépose pour le second : un fichier JSON du
// dossier temporaire du poste, au nom du projet (une `VueDuProjet`). Pas de fichier, ou un fichier illisible : pas de vue.
export const VIEWS = (): string => join(tmpdir(), "brigade-second-vue");
export const vueOf = (views: string, name: string): string => join(views, `${name.replace(/[^\w.-]/g, "_")}.json`);

function readTheVue(views: string, name: string): VueOfProject | undefined {
  try {
    const vue = JSON.parse(readFileSync(vueOf(views, name), "utf8")) as Partial<VueOfProject>;
    return Array.isArray(vue.banners) && Array.isArray(vue.rail) ? (vue as VueOfProject) : undefined;
  } catch {
    return undefined;
  }
}

// À une question de blocage : le contexte de la vue du projet, d'abord ce que le chef voit ; rien sans vue déposée
// ou pour un autre message.
export function blockage(entry: { prompt?: string }, target: Target, views: string = VIEWS()): string {
  if (!entry.prompt || !QUESTION_OF_BLOCKAGE.test(entry.prompt) || EVENT_OF_BACKGROUND.test(entry.prompt)) return "";
  const vue = readTheVue(views, target.nom);
  return vue === undefined ? "" : JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: contextOfBlockage(entry.prompt, vue) } });
}

// Joué par `claude` : `node blockage-of-second.ts <nom>`, le message du chef sur l'entrée standard. Le crochet sort
// toujours en 0 et ne bloque jamais la session ; ce qui échoue ne rend rien.
if (import.meta.main) {
  try {
    const output = blockage(JSON.parse(readFileSync(0, "utf8")) as { prompt?: string }, { nom: process.argv[2] ?? "" });
    if (output !== "") process.stdout.write(`${output}\n`);
  } catch {}
  process.exit(0);
}
