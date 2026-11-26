// The autonomy policy (#4380, epic #4378): an agent's level moves from its gesture record, no longer only when the
// chef clicks. It reads the agent's gesture log (gestes.ts), the levels (niveaux.ts) and the quality figures — the
// escaped bugs and the reverts, as autonomie/chiffres/chiffres.ts shapes them (qualite.ts reads them for the runtime).
//
//   - Promotion: an agent at `propose` moves to `act` when its last NOMBRE_DE_GESTES_PROPRES gestures done at
//     `propose` — each through the chef's OK, the gate holding every gesture at that level (porte.ts) — are clean:
//     none of their deliveries is in an escaped bug or a revert.
//   - Demotion: a gesture the agent did by itself under `act` whose delivery is later reverted, or cited by an escaped
//     bug, sends it one step back, `act` to `propose`, the revert or the bug as the reason. Each revert or bug is
//     handled once, by its key (`revert <sha>`, `bug <owner/repo>#<n>`): run again on the same facts, nothing moves.
//   - Pin: a level the chef set is pinned (niveaux.ts); the policy never moves it, up or down.
//
// Every move is a gesture in the agent's log, its reason naming the facts. A demotion wakes the chef once.
// The policy moves the four agents that each have their own log and level — the manager, the supervisor, the closer,
// the pass —: the cooks share one level over a log per ticket, and the manager's splitting of an epic logs in the
// manager's log; neither has a record of its own to read.
//
// A gesture's delivery is what its line and reason cite: a commit (7 to 40 hex digits) or a ticket (`#12`). The level
// a gesture was done under is the agent's level after the last move logged before it — its current level when none
// follows. A levels file or a gesture log that cannot be read is refused: the policy throws before writing anything.
import { consignerGeste, OUTCOME, tousLesGestes, type Geste } from "./gestes.ts";
import { magasinDeNiveaux, NOMBRE_DE_GESTES_PROPRES, type FaitTraite, type MagasinDeNiveaux, type Niveau, type Reglable } from "./niveaux.ts";
import type { BugEchappe, Revert } from "../chiffres/chiffres.ts";

// N, the clean gestures that move a level up, is declared with the levels (niveaux.ts); the acceptance tests read it here.
export { NOMBRE_DE_GESTES_PROPRES } from "./niveaux.ts";

export type ChiffresDeQualite = { bugsEchappes: readonly BugEchappe[]; reverts: readonly Revert[] };
export type Progres = { toward: "act"; done: number; of: number };
export type Mouvement = { agent: Reglable; de: Niveau; vers: Niveau; reason: string };

const AGENTS = ["manager", "supervisor", "closer", "pass"] as const satisfies readonly Reglable[];

// The line of a move in the agent's log.
const ligneDuMouvement = (de: Niveau, vers: Niveau) => `autonomy moved from ${de} to ${vers}`;
const MOUVEMENT = /^autonomy moved from (observe|propose|act) to (observe|propose|act)$/;

const COMMIT = /\b(?=[0-9a-f]*\d)[0-9a-f]{7,40}\b/gi;
const TICKET = /#(\d+)\b/g;

// The facts the quality figures give, each under its key.
function faitsDe({ bugsEchappes, reverts }: ChiffresDeQualite): FaitTraite[] {
  return [
    ...reverts.map(({ sha, revertes, tickets }) => ({ key: `revert ${sha}`, commits: revertes.map((commit) => commit.toLowerCase()), tickets: [...tickets] })),
    ...bugsEchappes.map(({ depot, bug, tickets }) => ({ key: `bug ${depot}#${bug}`, commits: [], tickets: [...tickets] })),
  ];
}

// True when the fact touches what the gesture delivered.
function touche(geste: Geste, fait: FaitTraite): boolean {
  const texte = `${geste.line} ${geste.reason}`;
  const commits = Array.from(texte.matchAll(COMMIT), ([commit]) => commit.toLowerCase());
  const tickets = new Set(Array.from(texte.matchAll(TICKET), ([, n]) => Number(n)));
  return fait.commits.some((sien) => commits.some((cite) => sien.startsWith(cite) || cite.startsWith(sien))) || fait.tickets.some((ticket) => tickets.has(ticket));
}

// Each gesture done, newest first, with the level it was done under. Moves and gestures not done are left out.
function gestesFaits(gestes: readonly Geste[], niveauActuel: Niveau): { geste: Geste; niveau: Niveau }[] {
  const faits: { geste: Geste; niveau: Niveau }[] = [];
  let niveau = niveauActuel;
  for (const geste of [...gestes].reverse()) {
    const mouvement = MOUVEMENT.exec(geste.line);
    if (mouvement !== null) niveau = mouvement[1] as Niveau;
    else if (geste.outcome !== OUTCOME.NOT_DONE) faits.push({ geste, niveau });
  }
  return faits;
}

// How far an agent at `propose` is from `act`: its clean gestures done at `propose` since its last move, the newest
// first, up to the first one a fact touches. Null for an agent at any other level.
export function progresDe(gestes: readonly Geste[], niveau: Niveau, faits: readonly FaitTraite[]): Progres | null {
  if (niveau !== "propose") return null;
  let done = 0;
  for (const { geste, niveau: sous } of gestesFaits(gestes, niveau)) {
    if (sous !== "propose" || faits.some((fait) => touche(geste, fait))) break;
    done++;
  }
  return { toward: "act", done: Math.min(done, NOMBRE_DE_GESTES_PROPRES), of: NOMBRE_DE_GESTES_PROPRES };
}

export type OptionsDeLaPolitique = {
  repertoire: string;
  projet: string;
  chiffres: ChiffresDeQualite;
  horloge: () => Date;
  // Wakes the chef, once per demotion, with its reason.
  reveillerLeChef: (raison: string) => void;
  niveaux?: MagasinDeNiveaux;
};

// Applies the policy once; returns the moves made.
export function appliquerLaPolitique({ repertoire, projet, chiffres, horloge, reveillerLeChef, niveaux = magasinDeNiveaux(repertoire) }: OptionsDeLaPolitique): Mouvement[] {
  // Both files read before anything is written: one that cannot be read throws, and nothing moves.
  const { niveaux: lus, epingles, traites } = niveaux.etat(projet);
  const journaux = tousLesGestes(repertoire);
  const dejaTraites = new Set(traites.map(({ key }) => key));
  const nouveaux = faitsDe(chiffres).filter(({ key }) => !dejaTraites.has(key) && dejaTraites.add(key));
  const connus = [...traites, ...nouveaux];
  const mouvements: Mouvement[] = [];
  for (const agent of AGENTS) {
    if (epingles.has(agent)) continue;
    const niveau = lus[agent];
    const gestes = journaux[agent] ?? [];
    if (niveau === "act") {
      const sousAct = gestesFaits(gestes, niveau).filter(({ geste, niveau: sous }) => sous === "act" && geste.outcome === OUTCOME.FIXED_BY_SELF);
      const raisons = nouveaux.flatMap((fait) => {
        const touches = sousAct.filter(({ geste }) => touche(geste, fait)).map(({ geste }) => `« ${geste.line} »`);
        return touches.length === 0 ? [] : [`${fait.key.startsWith("revert ") ? `the ${fait.key}` : `the escaped ${fait.key}`} touches ${touches.join(", ")}, done by itself under act`];
      });
      if (raisons.length > 0) mouvements.push({ agent, de: "act", vers: "propose", reason: raisons.join("; ") });
    } else if (progresDe(gestes, niveau, connus)?.done === NOMBRE_DE_GESTES_PROPRES) {
      mouvements.push({ agent, de: "propose", vers: "act", reason: `its last ${NOMBRE_DE_GESTES_PROPRES} gestures at propose went through the chef's OK, and none of their deliveries is in an escaped bug or a revert: from propose to act` });
    }
  }
  if (mouvements.length === 0 && nouveaux.length === 0) return [];
  niveaux.retenir(projet, { mouvements: mouvements.map(({ agent, vers }) => ({ reglable: agent, niveau: vers })), traites: nouveaux });
  for (const { agent, de, vers, reason } of mouvements) {
    consignerGeste(repertoire, agent, { line: ligneDuMouvement(de, vers), reason, outcome: OUTCOME.FIXED_BY_SELF }, horloge);
    if (vers === "propose") reveillerLeChef(`the ${agent} went back from act to propose: ${reason}`);
  }
  return mouvements;
}
