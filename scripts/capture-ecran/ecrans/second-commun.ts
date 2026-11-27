// Un projet ouvert depuis le premier lancement sur un PC neuf (#1435) : `parade`, ni box ni station sur ce PC. Son
// onglet Second dit ce que le runtime dit du second (#1433) — ce qu'il rend est écrit par les fonctions mêmes du runtime,
// comme l'app le recevra. Les écrans `second-*` en sont tirés.
import { planDuSecond, type OptionsDuSecond } from "../../../runtime/src/second/lancement.ts";
import type { SaysOfSecond, Terminal } from "../../../app/src/terminals.ts";
import { configuration, demarrage, type Ecran, MAINTENANT } from "./commun.ts";

const PROJET = "parade";
const DOSSIER = "C:\\Users\\chef\\parade";

// Ce PC : le PATH de Windows, et les seuls programmes que `existe` y trouve.
const PC = (presents: readonly string[], folder = DOSSIER): OptionsDuSecond => ({
  plateforme: "win32",
  env: { PATH: "C:\\Windows\\System32;C:\\Program Files\\Git\\cmd", PATHEXT: ".COM;.EXE;.BAT;.CMD" },
  maison: "C:\\Users\\chef",
  existe: (chemin) => presents.some((nom) => chemin.toLowerCase().endsWith(`\\${nom}.exe`)),
  folder,
  args: ["/brigade:second"],
});
// Ce que l'app tient d'un outil absent (terminals.ts) : son nom, pourquoi, ce qui l'obtient, sa page.
const dit = (reason: string, tools: NonNullable<Extract<ReturnType<typeof planDuSecond>, { state: "cannot-start" }>["tools"]> = []): SaysOfSecond => ({
  reason,
  tools: tools.flatMap((vu) => (vu.present ? [] : [{ tool: vu.tool, reason: vu.reason, install: vu.install, link: vu.link }])),
});

const SECOND: Terminal = { id: 1, projet: PROJET, genre: "second", titre: "second · claude", note: "new session", arrete: false };
// Ni `claude`, ni `git`, ni `gh` sur ce PC : le second ne part pas.
export function secondEmpeche(): Terminal {
  const plan = planDuSecond(PC([]));
  if (plan.state !== "cannot-start") throw new Error("le second part sans claude");
  return { ...SECOND, arrete: true, note: plan.reason, empeche: dit(plan.reason, plan.tools) };
}
// Tout y est, mais le dossier du projet n'existe pas sur ce PC : une autre raison, sans outil nommé.
export function secondSansDossier(): Terminal {
  const plan = planDuSecond({ ...PC([]), plateforme: "linux", env: { PATH: "/usr/bin" }, maison: "/home/chef", existe: () => true, folder: "/home/chef/parade" });
  if (plan.state !== "cannot-start") throw new Error("le second part sans son dossier");
  return { ...SECOND, arrete: true, note: plan.reason, empeche: dit(plan.reason) };
}
// Il part, mais sans `gh` : ce qui en a besoin échouera, et la colonne le dit au-dessus du terminal.
export function secondSansGh(): Terminal {
  const plan = planDuSecond({ ...PC(["claude", "git"], import.meta.dirname), plateforme: "linux", env: { PATH: "/usr/bin" }, maison: "/home/chef", existe: (chemin) => ["/usr/bin/claude", "/usr/bin/git"].includes(chemin) });
  if (plan.state !== "ready") throw new Error(`le second ne part pas : ${plan.reason}`);
  return { ...SECOND, manque: dit(plan.reason ?? "", plan.tools) };
}
export const SECOND_PARTI = SECOND;

// L'espace de parade, ouvert par sa case de la barre : son second tel qu'il part.
export function espaceDuPC(dit: string, second: Terminal): Ecran {
  return {
    dit,
    largeur: 1440,
    hauteur: 900,
    etapes: [{ cliquer: '#projets > button[title^="parade"]' }],
    donnees: () => ({
      maintenant: MAINTENANT,
      reponses: {
        demarrage: { ...demarrage(configuration([{ nom: PROJET, dossier: DOSSIER, depot: "benomite/parade" }]), undefined, undefined, () => false), poste: { nom: "this PC", mac: false } },
        espace: [second],
      },
      envois: { regarder: {} },
    }),
  };
}
