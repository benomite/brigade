// The first ticket of a project the chef adds from the app: prepare its repo
// for the kitchen — its gates, its worktree setup, the sites it is allowed to
// reach. This module only writes its content: its title, its labels, and the
// body that tells the cook what to deliver and how to put it to the test.
import { execFileSync } from "node:child_process";
import { LABEL } from "../github.ts";
import { SCRIPT_GATES, SCRIPT_SETUP } from "../gates.ts";
import { DECLARATION_RESEAU } from "../reseau.ts";

// What marks the issue as the repo-preparation ticket: the station recognises
// it by this if it created it without having been able to record it.
export const MARKER = "<!-- brigade:preparation-depot -->";

export const TITLE = "Préparer le dépôt : gates, setup de worktree, sites autorisés";

// `fire`: it enters the rail. Its sizing is set up front — no cook leaves
// without one —, that of a ticket that calls for judgement: it reads a repo
// it does not know, and tests what it writes.
export const LABELS = [LABEL, "model:opus", "effort:high"];

// The three files the ticket asks for, in the order the body lists them.
export const FILES = [SCRIPT_GATES, SCRIPT_SETUP, DECLARATION_RESEAU] as const;

// What the clone's integration branch already carries of these files: true,
// false, or null when the clone cannot tell (no integration branch on the
// origin, no git).
export function alreadyOnBase(clone: string, base: string): Record<string, boolean | null> {
  const git = (...args: string[]) => execFileSync("git", ["-C", clone, ...args], { stdio: "ignore", timeout: 30_000 });
  const ref = `refs/remotes/origin/${base}`;
  try {
    git("rev-parse", "--verify", "--quiet", `${ref}^{commit}`);
  } catch {
    return Object.fromEntries(FILES.map((file) => [file, null]));
  }
  return Object.fromEntries(
    FILES.map((file) => {
      try {
        git("cat-file", "-e", `${ref}:${file}`);
        return [file, true];
      } catch {
        return [file, false];
      }
    }),
  );
}

const describePresence = (present: boolean | null | undefined, base: string) =>
  present === true ? `déjà sur \`${base}\` : à éprouver, à corriger au besoin` : present === false ? "absent : à écrire" : "inconnu : la station n'a pas pu lire la branche";

export type Content = { project: string; repo: string; base: string; presence: Record<string, boolean | null> };

// The issue body.
export function body({ project, repo, base, presence }: Content): string {
  return [
    MARKER,
    `Premier ticket de la cuisine de **${project}** (\`${repo}\`, branche d'intégration \`${base}\`) : préparer le dépôt pour qu'elle puisse le servir. La station l'a ouvert seule quand le chef a ajouté le projet.`,
    "",
    `**Tant que ce ticket n'est pas mergé, aucun autre ticket du projet ne part.** Une fois mergé, le rail démarre seul : rien d'autre à faire.`,
    "",
    "## À livrer",
    "",
    "| Fichier | Contrat | Aujourd'hui |",
    "|---|---|---|",
    `| \`${SCRIPT_GATES}\` | exécutable ; \`gates.sh <worktree>\`. **Son code de sortie est le verdict de la pass** : 0 vert, tout autre rouge. Il joue ce qui dit qu'une livraison est bonne — tests, contrôle de types, lint —, sans écran, sans service qui reste derrière lui, et sans courir contre l'horloge. | ${describePresence(presence[SCRIPT_GATES], base)} |`,
    `| \`${SCRIPT_SETUP}\` | exécutable ; \`worktree-setup.sh <n> <worktree>\`. **N'imprime que des \`export\`** sur sa sortie (le reste va sur la sortie d'erreur). Il rend un worktree neuf prêt pour le cook et les gates : dépendances, build. Les ports se dérivent de \`<n>\`, jamais en dur — plusieurs cooks tournent en même temps ; il ne laisse rien tourner. | ${describePresence(presence[SCRIPT_SETUP], base)} |`,
    `| \`${DECLARATION_RESEAU}\` | **les sites que le projet a le droit de joindre**, en plus d'Anthropic et de GitHub : un hôte par ligne (\`registry.npmjs.org\`), \`*.\` devant pour ses sous-domaines, \`:port\` derrière pour un autre port que 443 et 80, jamais une adresse ; \`#\` commente. Chaque registre de paquets, chaque service que le setup et les gates joignent y est. Rien à ouvrir : le fichier existe quand même, commenté, et le dit. | ${describePresence(presence[DECLARATION_RESEAU], base)} |`,
    "",
    "## Éprouver sur la station, pas en local",
    "",
    "Ce ticket se cuit sur la station qui servira le projet : c'est là que tourneront le setup et les gates de chacun de ses tickets. **Éprouve la configuration ici, sur cette machine, dans ton worktree** — pas sur un poste de dev, pas de tête, pas en la lisant seulement :",
    "",
    `1. \`${SCRIPT_SETUP} <n> "$PWD"\` sort en 0 et n'imprime que des \`export\` ; \`eval\` de sa sortie dans un shell, il laisse le worktree prêt ;`,
    `2. dans ce même shell, \`${SCRIPT_GATES} "$PWD"\` sort en 0 ;`,
    `3. chaque hôte que le setup et les gates ont joint est dans \`${DECLARATION_RESEAU}\`. Si la station filtre le réseau du projet, les sites que tu déclares ne s'ouvrent qu'une fois ce ticket mergé : un téléchargement refusé ici se dit dans le compte-rendu, avec l'hôte en cause — il ne se contourne pas.`,
    "",
    "## Critères d'acceptation",
    "",
    `- [ ] \`${SCRIPT_GATES}\` passe (code 0) sur la station qui cuit ce ticket, dans un worktree préparé par le setup`,
    `- [ ] \`${SCRIPT_SETUP}\` s'exécute sur cette station dans un worktree neuf, et n'imprime que des \`export\``,
    `- [ ] \`${DECLARATION_RESEAU}\` est présent, et nomme chaque site que le setup et les gates joignent — ou dit, commenté, qu'il n'y en a aucun`,
    `- [ ] les trois sont commités, exécutables pour les deux scripts ; le compte-rendu dit, pour chacun, la commande lancée sur la station et la fin de ce qu'elle a imprimé`,
  ].join("\n");
}
