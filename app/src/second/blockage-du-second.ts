// Le crochet du second pour une question de blocage (#4121) : la vue du projet que l'app a déposée, mise en texte par
// contexte-du-blocage.ts. Appelé par role-apres-init.ts (moment `vue`).
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Cible } from "./hook-de-la-file.ts";
import { contextDuBlockage, type VueDuProject } from "./context-du-blockage.ts";

// Le chef demande pourquoi on est bloqués, ou ce qui se passe (#4121).
export const QUESTION_DE_BLOCKAGE = /bloqu|blocked|stuck|what('| i)s (happening|going on)|qu'est-ce qui se passe|que se passe/i;

// Un événement de fond (notification de tâche, moniteur) n'est pas un message du chef : il ne reçoit pas la vue.
const EVENT_DE_BACKGROUND = /^\s*(<task-notification|monitor event)/i;

// L'état de la vue du projet — bandeaux et cartes du rail — que l'app dépose pour le second : un fichier JSON du
// dossier temporaire du poste, au nom du projet (une `VueDuProjet`). Pas de fichier, ou un fichier illisible : pas de vue.
export const VUES = (): string => join(tmpdir(), "brigade-second-vue");
export const vueDe = (vues: string, name: string): string => join(vues, `${name.replace(/[^\w.-]/g, "_")}.json`);

function lireLaVue(vues: string, name: string): VueDuProject | undefined {
  try {
    const vue = JSON.parse(readFileSync(vueDe(vues, name), "utf8")) as Partial<VueDuProject>;
    return Array.isArray(vue.banners) && Array.isArray(vue.rail) ? (vue as VueDuProject) : undefined;
  } catch {
    return undefined;
  }
}

// À une question de blocage : le contexte de la vue du projet, d'abord ce que le chef voit ; rien sans vue déposée
// ou pour un autre message.
export function blockage(entree: { prompt?: string }, cible: Cible, vues: string = VUES()): string {
  if (!entree.prompt || !QUESTION_DE_BLOCKAGE.test(entree.prompt) || EVENT_DE_BACKGROUND.test(entree.prompt)) return "";
  const vue = lireLaVue(vues, cible.nom);
  return vue === undefined ? "" : JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: contextDuBlockage(entree.prompt, vue) } });
}
