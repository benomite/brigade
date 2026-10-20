// Le premier ticket d'un projet que le chef ajoute depuis l'app : préparer son
// dépôt pour la cuisine — ses gates, le setup de ses worktrees, les sites
// qu'il a le droit de joindre. Ce module n'en écrit que le contenu : son
// titre, ses labels, et le corps qui dit au cook quoi livrer et comment
// l'éprouver.
import { execFileSync } from "../sans-invite.ts";
import { LABEL } from "../github.ts";
import { SCRIPT_GATES, SCRIPT_SETUP } from "../gates.ts";
import { DECLARATION_RESEAU } from "../reseau.ts";

// Ce qui marque l'issue comme le ticket de préparation du dépôt : la station
// le reconnaît par lui si elle l'a créé sans avoir pu le noter.
export const MARQUEUR = "<!-- brigade:preparation-depot -->";

export const TITRE = "Préparer le dépôt : gates, setup de worktree, sites autorisés";

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
  present === true ? `déjà sur \`${base}\` : à éprouver, à corriger au besoin` : present === false ? "absent : à écrire" : "inconnu : la station n'a pas pu lire la branche";

export type Contenu = { projet: string; depot: string; base: string; presents: Record<string, boolean | null> };

// Le corps de l'issue.
export function corps({ projet, depot, base, presents }: Contenu): string {
  return [
    MARQUEUR,
    `Premier ticket de la cuisine de **${projet}** (\`${depot}\`, branche d'intégration \`${base}\`) : préparer le dépôt pour qu'elle puisse le servir. La station l'a ouvert seule quand le chef a ajouté le projet.`,
    "",
    `**Tant que ce ticket n'est pas mergé, aucun autre ticket du projet ne part.** Une fois mergé, le rail démarre seul : rien d'autre à faire.`,
    "",
    "## À livrer",
    "",
    "| Fichier | Contrat | Aujourd'hui |",
    "|---|---|---|",
    `| \`${SCRIPT_GATES}\` | exécutable ; \`gates.sh <worktree>\`. **Son code de sortie est le verdict de la pass** : 0 vert, tout autre rouge. Il joue ce qui dit qu'une livraison est bonne — tests, contrôle de types, lint —, sans écran, sans service qui reste derrière lui, et sans courir contre l'horloge. | ${direPresence(presents[SCRIPT_GATES], base)} |`,
    `| \`${SCRIPT_SETUP}\` | exécutable ; \`worktree-setup.sh <n> <worktree>\`. **N'imprime que des \`export\`** sur sa sortie (le reste va sur la sortie d'erreur). Il rend un worktree neuf prêt pour le cook et les gates : dépendances, build. Les ports se dérivent de \`<n>\`, jamais en dur — plusieurs cooks tournent en même temps ; il ne laisse rien tourner. | ${direPresence(presents[SCRIPT_SETUP], base)} |`,
    `| \`${DECLARATION_RESEAU}\` | **les sites que le projet a le droit de joindre**, en plus d'Anthropic et de GitHub : un hôte par ligne (\`registry.npmjs.org\`), \`*.\` devant pour ses sous-domaines, \`:port\` derrière pour un autre port que 443 et 80, jamais une adresse ; \`#\` commente. Chaque registre de paquets, chaque service que le setup et les gates joignent y est. Rien à ouvrir : le fichier existe quand même, commenté, et le dit. | ${direPresence(presents[DECLARATION_RESEAU], base)} |`,
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
