// La cuisine des tests de la passe qui écrit : un runtime — rail, garde-fous,
// pass, fermeture, et une station si le test la demande — sur un vrai dépôt
// git, un faux closer dont le test écrit les gestes, les fausses gates et le
// faux reviewer de la pass, et un GitHub de test. Ni réseau, ni quota.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { avecRail } from "../../src/alimenter.ts";
import { ouvrirDepot } from "../../src/depot.ts";
import type { FaitFermeture, ReglagesDeFermeture } from "../../src/events/closing.ts";
import type { Plafonds } from "../../src/events/guardrails.ts";
import { principal } from "../../src/closing/command.ts";
import { brancherFermeture } from "../../src/closing/run.ts";
import { MARQUEUR } from "../../src/fiche.ts";
import { brancherGardeFous } from "../../src/garde-fous.ts";
import type { Issue } from "../../src/github.ts";
import { brancherPass } from "../../src/pass.ts";
import { lirePass } from "../../src/projections/pass.ts";
import { demarrer } from "../../src/runtime.ts";
import { brancherStation } from "../../src/station.ts";
import { BAIL_MS, CALIBRAGE_DU_REVIEWER, fauxGitHub, issue, MACHINE_CALME, montre, PLAFONDS, REGLAGES, STATION } from "../aides/cuisine.ts";
import { appeler, BASE, DEPOT, depotGit, ENV_GIT, FAUX_CLAUDE, git, jusqua, lancementsDuFauxClaude, repertoireTemporaire } from "../outils.ts";
import { ecrireHistoire, type Etape, type Fichiers } from "./history.ts";

const FAUX_CLOSER = join(import.meta.dirname, "fake-closer.sh");
const FAUSSES_GATES = join(import.meta.dirname, "../aides/fausses-gates.sh");
// Les gates du projet des tests : les fausses gates, précédées des mesures que
// le test leur fait déclarer.
const GATES_A_MESURES = join(import.meta.dirname, "gates-to-measures.sh");

// Les réglages d'une passe, quand un test n'en dit rien : aucun cook en vol,
// et des plafonds qu'un closer qui retire une ligne n'atteint pas.
export const REGLAGES_DE_FERMETURE: ReglagesDeFermeture = { calibration: { model: "sonnet", effort: "low" }, cooksBelow: 1, tokens: 1000, removedLines: 20 };

const SUITE = Array.from({ length: 8 }, (_, i) => `const ligne${i + 1} = calculer(${i + 1});\n`).join("");
// Le projet des tests. L'observation y repère, dans cet ordre :
//   D1  huit lignes identiques, `src/libre/a.ts` = `src/libre/b.ts`
//   M1  l'export `inutile` de `src/libre/outils.ts`, que rien ne nomme
//   M2  l'export `oublie` de `src/tenu/outils.ts`, que rien ne nomme
// `vivant` et `garde`, que `src/app.ts` appelle, vivent.
export const PROJET: Record<string, string> = {
  "src/app.ts": 'import { vivant } from "./libre/outils.ts";\nimport { garde } from "./tenu/outils.ts";\nconsole.log(vivant(), garde());\n',
  "src/libre/outils.ts": "export function vivant() { return 1; }\nexport function inutile() { return 2; }\n",
  "src/tenu/outils.ts": "export function garde() { return 3; }\nexport function oublie() { return 4; }\n",
  "src/libre/a.ts": SUITE,
  "src/libre/b.ts": SUITE,
};

// Le geste d'un closer prudent : il retire M1, et rien d'autre.
export const RETIRER_M1 = "effacer inutile src/libre/outils.ts\ncommiter\n";

export type Options = {
  reglages?: Partial<ReglagesDeFermeture>;
  // Les réglages relus à chaud, comme le runtime les relit des décisions du chef.
  reglagesAChaud?: () => ReglagesDeFermeture;
  plafonds?: Partial<Plafonds>;
  issues?: Issue[];
  // Brancher une station, dont les cooks jouent le faux `claude` « livre ».
  station?: boolean;
  // Le scénario des relectures du reviewer de la pass — « relit-vert » par défaut.
  relecture?: string;
  fichiers?: Fichiers;
  // Ce que la branche d'intégration a vécu avant de porter le projet : ses merges.
  histoire?: Etape[];
  // Les lieux d'une vie précédente, pour redémarrer dessus.
  lieux?: Lieux;
};

export type Lieux = { repertoire: string; origine: string; clone: string; gh: ReturnType<typeof fauxGitHub> };

// La fiche d'un ticket qui possède ces chemins.
export const fiche = (...zone: string[]) => [MARQUEUR, "- attend : rien", `- zone : ${zone.join(", ")}`].join("\n");

export function cuisineFermee(t: TestContext, options: Options = {}) {
  // Enregistré avant tout répertoire temporaire : le runtime doit être arrêté
  // avant qu'on retire son état.
  let aArreter: { arreter(signal: string): void } | undefined;
  t.after(() => aArreter?.arreter("test"));
  const lieux: Lieux = options.lieux ?? { repertoire: repertoireTemporaire(t), ...depotGit(t), gh: fauxGitHub(...(options.issues ?? [])) };
  const { repertoire, origine, clone, gh } = lieux;
  if (!options.lieux) {
    // Le projet est sur l'origine : c'est de là que la passe rapatrie la base.
    // Ses gates sont la doublure : c'est sur elles que la pass juge la PR d'une passe.
    ecrireHistoire(clone, [...(options.histoire ?? []), { commit: { ...(options.fichiers ?? PROJET), ".claude/brigade/gates.sh": { lien: GATES_A_MESURES } } }]);
    git(clone, "push", "-q", "origin", `refs/remotes/origin/${BASE}:refs/heads/${BASE}`);
  }
  const heure = montre();
  const avertissements: string[] = [];
  const avertir = (message: string) => void avertissements.push(message);

  // Ce que le faux closer lit et laisse.
  const dossier = join(repertoire, "closer");
  mkdirSync(dossier, { recursive: true });
  const temoin = join(repertoire, "temoin");
  mkdirSync(temoin, { recursive: true });
  // Le scénario des fausses gates, que le test change à la main.
  const fichierGates = join(repertoire, "gates.txt");
  const env = { ...ENV_GIT, FAUX_CLOSER_DIR: dossier, FAUX_CLAUDE: "livre", FAUX_CLAUDE_TEMOIN: temoin, FAUSSES_GATES: fichierGates, FAUSSES_GATES_SH: FAUSSES_GATES };

  const depot = ouvrirDepot({ clone, base: BASE, worktrees: join(repertoire, "worktrees"), env: ENV_GIT });
  const socle = demarrer({ repertoireEtat: repertoire, projet: "brigade", intervalleVeilleMs: 5, intervalleTickMs: 20, maintenant: heure.maintenant });
  const garde = brancherGardeFous({ ...REGLAGES, plafonds: { ...PLAFONDS, ...options.plafonds } }, avecRail(socle, { depot: DEPOT, dureeBailMs: BAIL_MS, gh: "", github: gh.github, maintenant: heure.maintenant }));
  // La pass avant la fermeture : c'est à elle que la passe remet sa PR.
  const jugee = brancherPass(garde, {
    repertoireEtat: repertoire,
    depot,
    github: gh.github,
    base: BASE,
    reviewer: { calibrage: CALIBRAGE_DU_REVIEWER },
    depotGitHub: DEPOT,
    bin: FAUX_CLAUDE,
    env: { ...env, FAUX_CLAUDE: options.relecture ?? "relit-vert" },
    delaiGatesMs: 60_000,
    attenteCiMs: 1_800_000,
    machine: () => MACHINE_CALME,
    maintenant: heure.maintenant,
    avertir,
  });
  const fermee = brancherFermeture(jugee, {
    reglages: options.reglagesAChaud ?? { ...REGLAGES_DE_FERMETURE, ...options.reglages },
    repertoireEtat: repertoire,
    depot,
    clone,
    base: BASE,
    github: gh.github,
    depotGitHub: DEPOT,
    bin: FAUX_CLOSER,
    env,
    avertir,
    maintenant: heure.maintenant,
  });
  const runtime = options.station
    ? brancherStation(fermee, {
        repertoireEtat: repertoire,
        depot,
        github: gh.github,
        depotGitHub: DEPOT,
        base: BASE,
        bin: FAUX_CLAUDE,
        env,
        session: async () => "connectee",
        dureeBailMs: BAIL_MS,
        stations: [{ nom: STATION, moteur: "claude", fournit: ["code"], cooks: 1 }],
        machine: () => MACHINE_CALME,
        maintenant: heure.maintenant,
        avertir,
        apresCook: jugee.reveillerPass,
      })
    : fermee;
  aArreter = runtime;

  const { journal } = runtime;
  const types = (ticket?: number) => (ticket === undefined ? journal.tout() : journal.duTicket(ticket)).map((e) => e.type);
  // Le dernier fait de ce type que la fermeture a écrit.
  const dernier = <T extends FaitFermeture["type"]>(type: T) => journal.tout().findLast((e) => e.type === type)?.payload as Extract<FaitFermeture, { type: T }>["payload"] | undefined;
  return {
    runtime,
    journal,
    lieux,
    repertoire,
    origine,
    clone,
    gh,
    avertissements,
    heure,
    types,
    dernier,
    etat: (ticket: number) => runtime.rail.tickets().find((x) => x.ticket === ticket)?.state,
    // Ce que la pass suit, et ce qu'elle a fait jouer : ses gates, son reviewer.
    pass: () => lirePass(journal.base),
    gates: {
      regler: (scenario: "vert" | "rouge") => writeFileSync(fichierGates, scenario),
      // Ce que les gates déclarent désormais, chaque fois qu'elles sont jouées.
      mesurer: (mesures: Record<string, number>) => writeFileSync(`${fichierGates}.mesures`, Object.entries(mesures).map(([nom, valeur]) => `${nom}=${valeur}\n`).join("")),
      appels: () => (existsSync(`${fichierGates}.appels`) ? readFileSync(`${fichierGates}.appels`, "utf8").trimEnd().split("\n") : []),
    },
    relectures: () => lancementsDuFauxClaude(temoin).filter((lance) => lance.args.includes("--tools")),
    // Le geste du chef, depuis son propre process : `run fermeture -- ecrire`.
    async demander(): Promise<{ code: number; sortie: string }> {
      const appel = appeler(principal, ["write"], { BRIGADE_STATE_DIR: repertoire });
      return { code: await appel.fin, sortie: appel.sortie() };
    },
    // Le chef y renonce : `run fermeture -- annuler`.
    async annuler(): Promise<{ code: number; sortie: string }> {
      const appel = appeler(principal, ["cancel"], { BRIGADE_STATE_DIR: repertoire });
      return { code: await appel.fin, sortie: appel.sortie() };
    },
    // La fin de la passe, une fois au journal.
    async fin() {
      await jusqua(() => types().includes("closing.ended"));
      const fin = dernier("closing.ended");
      if (fin === undefined) throw new Error("passe sans fin");
      return fin;
    },
    closer: {
      // Ce que le closer fait dans son worktree, et ce qu'il en dit.
      gestes: (shell: string) => writeFileSync(join(dossier, "gestes.sh"), shell),
      message: (texte: string) => writeFileSync(join(dossier, "message.txt"), texte),
      // Laisse conclure un closer qui attend.
      feu: () => writeFileSync(join(dossier, "feu"), ""),
      // Les worktrees où il a été lancé, dans l'ordre.
      lancements: () => (existsSync(join(dossier, "lancements")) ? readFileSync(join(dossier, "lancements"), "utf8").trimEnd().split("\n") : []),
      consigne: () => readFileSync(join(dossier, "consigne"), "utf8"),
    },
    // Un ticket du rail, avec sa fiche, tel que le sondage le fait entrer.
    async poser(numero: number, ...zone: string[]) {
      if (zone.length > 0) gh.ficher(numero, "2026-10-08T09:00:00Z", fiche(...zone));
      gh.poser(issue(numero));
      await jusqua(() => types(numero).includes("ticket.arrived"));
    },
    // Ce que l'origine porte : la tête de sa branche d'intégration, ses branches.
    teteDeLaBase: () => git(origine, "rev-parse", `refs/heads/${BASE}`),
    branchesDeLOrigine: () => git(origine, "for-each-ref", "--format=%(refname:short)", "refs/heads").split("\n").filter(Boolean).sort(),
  };
}
