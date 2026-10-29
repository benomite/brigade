// Un projet ouvert depuis le premier lancement sur un PC neuf (#1435) : `parade`, ni box ni station sur ce PC. Son
// onglet Rail lit le rail que parade-box publie sur GitHub (#1432), son onglet Second dit ce que le runtime dit du
// second (#1433) — ce que chacun rend est écrit par les fonctions mêmes du runtime, comme l'app le recevra. Les écrans
// `rail-publie*` et `second-*` en sont tirés.
import type { RailDuProjet } from "../../../runtime/src/appairage/rail-du-projet.ts";
import { planDuSecond, type OptionsDuSecond } from "../../../runtime/src/second/lancement.ts";
import { rangerLeRailPublie, type RailDuProjetLu } from "../../../app/src/faits.ts";
import type { DitDuSecond, Terminal } from "../../../app/src/terminaux.ts";
import { configuration, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { CONNEXION, SANS_GH as STATIONS_SANS_GH } from "./premier-lancement-commun.ts";

const PROJET = "parade";
const DOSSIER = "C:\\Users\\chef\\parade";

// Le rail que parade-box publie pour parade : un ticket par colonne, deux servis.
const TICKETS = [
  { ticket: 21, state: "en attente", title: "Allergens on every dish", url: "https://github.com/benomite/parade/issues/21" },
  { ticket: 14, state: "pris", title: "Login page", url: "https://github.com/benomite/parade/issues/14" },
  { ticket: 15, state: "en pass", title: "Search the menu", url: "https://github.com/benomite/parade/issues/15" },
  { ticket: 17, state: "WAITING", title: "Payment provider", url: "https://github.com/benomite/parade/issues/17" },
  { ticket: 9, state: "servi", title: "Footer links", url: "https://github.com/benomite/parade/issues/9" },
  { ticket: 8, state: "servi", title: "Opening hours", url: "https://github.com/benomite/parade/issues/8" },
];
const LISTE: Extract<RailDuProjet, { state: "listed" }> = {
  state: "listed",
  project: PROJET,
  repository: "benomite/parade",
  station: { id: "gbox", name: "parade-box", online: true },
  publishedAt: "2026-10-13T10:02:40.000Z",
  tickets: TICKETS,
};
export const LISTE_LUE: RailDuProjetLu = { ...LISTE, range: rangerLeRailPublie(LISTE.tickets) };
export const CONNEXION_REQUISE: RailDuProjetLu = {
  state: "sign-in-required",
  project: PROJET,
  reason: `This computer is not signed in to GitHub, so brigade cannot read the rail of ${PROJET}, which its station publishes there.`,
  action: CONNEXION,
};
// Le rail ne se lit pas : il n'y a pas de `gh` sur ce PC — la phrase du runtime, tirée de l'échec des stations.
export const SANS_GH: RailDuProjetLu =
  STATIONS_SANS_GH.state === "unavailable"
    ? {
        state: "unavailable",
        project: PROJET,
        cause: STATIONS_SANS_GH.cause,
        reason: `The GitHub CLI (\`gh\`) is not installed on this computer, and brigade reads the rail of ${PROJET} on GitHub through it.`,
        ...(STATIONS_SANS_GH.link === undefined ? {} : { link: STATIONS_SANS_GH.link }),
        ...(STATIONS_SANS_GH.detail === undefined ? {} : { detail: STATIONS_SANS_GH.detail }),
      }
    : (() => {
        throw new Error("echecDeGh ne rend plus un échec pour un gh absent");
      })();

// Ce PC : le PATH de Windows, et les seuls programmes que `existe` y trouve.
const PC = (presents: readonly string[], folder = DOSSIER): OptionsDuSecond => ({
  plateforme: "win32",
  env: { PATH: "C:\\Windows\\System32;C:\\Program Files\\Git\\cmd", PATHEXT: ".COM;.EXE;.BAT;.CMD" },
  maison: "C:\\Users\\chef",
  existe: (chemin) => presents.some((nom) => chemin.toLowerCase().endsWith(`\\${nom}.exe`)),
  folder,
  args: ["/brigade:second"],
});
// Ce que l'app tient d'un outil absent (terminaux.ts) : son nom, pourquoi, ce qui l'obtient, sa page.
const dit = (reason: string, tools: NonNullable<Extract<ReturnType<typeof planDuSecond>, { state: "cannot-start" }>["tools"]> = []): DitDuSecond => ({
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

// L'espace de parade, ouvert par sa case de la barre : son rail tel qu'il se lit, son second tel qu'il part.
export function espaceDuPC(dit: string, rail: RailDuProjetLu | { __enAttente: true }, second: Terminal): Ecran {
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
        railDuProjet: rail,
      },
      envois: { regarder: {} },
    }),
  };
}
