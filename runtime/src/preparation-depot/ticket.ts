// Le premier ticket d'un projet que le chef ajoute depuis l'app : préparer son
// dépôt pour la cuisine — ses gates, le setup de ses worktrees, les sites
// qu'il a le droit de joindre. Ce module n'en écrit que le contenu : son
// titre, ses labels, et le corps qui dit au cook quoi livrer et comment
// l'éprouver.
import { execFileSync } from "../sans-invite.ts";
import { LABEL } from "../github.ts";
import { SCRIPT_GATES, SCRIPT_SETUP } from "../gates.ts";
import { DECLARATION_RESEAU } from "../reseau.ts";
import { DECLARATION } from "../secrets.ts";

// Ce qui marque l'issue comme le ticket de préparation du dépôt : la station
// le reconnaît par lui si elle l'a créé sans avoir pu le noter.
export const MARQUEUR = "<!-- brigade:preparation-depot -->";

export const TITRE = "Prepare the repository: gates, worktree setup, allowed sites";

// `fire` : il entre sur le rail. Son calibrage est posé d'office — aucun cook
// ne part sans —, celui d'un ticket qui demande du jugement : il lit un dépôt
// qu'il ne connaît pas, et éprouve ce qu'il écrit.
export const LABELS = [LABEL, "model:opus", "effort:high"];

// Les trois fichiers que le ticket demande, dans l'ordre où le corps les dit.
export const FICHIERS = [SCRIPT_GATES, SCRIPT_SETUP, DECLARATION_RESEAU] as const;

// Ce que la branche d'intégration du clone porte déjà de ces fichiers : vrai,
// faux, ou null quand le clone ne permet pas de le dire (pas de branche
// d'intégration sur l'origine, pas de git).
export function dejaSurLaBase(clone: string, base: string): Record<string, boolean | null> {
  const git = (...args: string[]) => execFileSync("git", ["-C", clone, ...args], { stdio: "ignore", timeout: 30_000 });
  const reference = `refs/remotes/origin/${base}`;
  try {
    git("rev-parse", "--verify", "--quiet", `${reference}^{commit}`);
  } catch {
    return Object.fromEntries(FICHIERS.map((fichier) => [fichier, null]));
  }
  return Object.fromEntries(
    FICHIERS.map((fichier) => {
      try {
        git("cat-file", "-e", `${reference}:${fichier}`);
        return [fichier, true];
      } catch {
        return [fichier, false];
      }
    }),
  );
}

const direPresence = (present: boolean | null | undefined, base: string) =>
  present === true ? `already on \`${base}\`: to try, to fix if needed` : present === false ? "missing: to write" : "unknown: the station could not read the branch";

export type Contenu = { projet: string; depot: string; base: string; presents: Record<string, boolean | null> };

// Le corps de l'issue.
export function corps({ projet, depot, base, presents }: Contenu): string {
  return [
    MARQUEUR,
    `First ticket of the kitchen of **${projet}** (\`${depot}\`, integration branch \`${base}\`): prepare the repository so that it can serve it. The station opened it on its own when the chef added the project.`,
    "",
    `**As long as this ticket is not merged, no other ticket of the project starts.** Once merged, the rail starts on its own: nothing else to do.`,
    "",
    `If the branch's \`${SCRIPT_SETUP}\` fails on the station, this ticket starts anyway — fixing it is its job: the station says here, in one sentence, what failed, and hands the cook what the setup said.`,
    "",
    "## To deliver",
    "",
    "| File | Contract | Today |",
    "|---|---|---|",
    `| \`${SCRIPT_GATES}\` | executable; \`gates.sh <worktree>\`. **Its exit code is the pass's verdict**: 0 green, anything else red. It runs what says a delivery is good — tests, type check, lint —, with no screen, no service left running behind it, and without racing the clock. | ${direPresence(presents[SCRIPT_GATES], base)} |`,
    `| \`${SCRIPT_SETUP}\` | executable; \`worktree-setup.sh <n> <worktree>\`. **Prints only \`export\` lines** on its output (the rest goes to the error output). It makes a fresh worktree ready for the cook and the gates: dependencies, build. Ports derive from \`<n>\`, never hard-coded — several cooks run at once; it leaves nothing running. It reads no file the repository does not hold — a \`.env\` copied by hand onto a machine — and requires no service the station does not have: a dev configuration is written in the repository or derived from it, a secret is declared in \`${DECLARATION}\` and the station passes it to the setup. | ${direPresence(presents[SCRIPT_SETUP], base)} |`,
    `| \`${DECLARATION_RESEAU}\` | **the sites the project may reach**, besides Anthropic and GitHub: one host per line (\`registry.npmjs.org\`), \`*.\` in front for its subdomains, \`:port\` behind for a port other than 443 and 80, never an address; \`#\` comments. Every package registry, every service the setup and the gates reach is there. Nothing to open: the file exists anyway, commented, and says so. | ${direPresence(presents[DECLARATION_RESEAU], base)} |`,
    "",
    "## Try it on the station, not locally",
    "",
    "This ticket is cooked on the station that will serve the project: that is where the setup and the gates of each of its tickets will run. **Try the configuration here, on this machine, in your worktree** — not on a dev workstation, not from memory, not only by reading it:",
    "",
    `1. \`${SCRIPT_SETUP} <n> "$PWD"\` exits with 0 and prints only \`export\` lines; with its output \`eval\`ed in a shell, it leaves the worktree ready;`,
    `2. in that same shell, \`${SCRIPT_GATES} "$PWD"\` exits with 0;`,
    `3. every host the setup and the gates reached is in \`${DECLARATION_RESEAU}\`. If the station filters the project's network, the sites you declare open only once this ticket is merged: a download refused here is said in the report, with the host at fault — it is not worked around.`,
    "",
    "## Acceptance criteria",
    "",
    `- [ ] \`${SCRIPT_GATES}\` passes (code 0) on the station that cooks this ticket, in a worktree prepared by the setup`,
    `- [ ] \`${SCRIPT_SETUP}\` runs on this station in a fresh worktree, and prints only \`export\` lines`,
    `- [ ] \`${DECLARATION_RESEAU}\` is present, and names every site the setup and the gates reach — or says, commented, that there is none`,
    `- [ ] the three are committed, the two scripts executable; the report says, for each, the command run on the station and the end of what it printed`,
  ].join("\n");
}
