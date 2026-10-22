// Les gates que le cook joue lui-même, dans son shell, arrivent au journal :
// ce qu'elles ont coûté, et ce qu'elles ont jugé — qu'une pass sur le même
// code reprend au lieu de les rejouer (`empreinte-des-gates.ts`).
//
// Le runtime ne joue pas les gates du cook : il lui donne un lanceur, posé
// dans le `.git` du clone, que sa consigne nomme. Le lanceur joue le script du
// projet tel quel — sa sortie et son code de sortie sont les siens — et laisse
// un reçu dans le répertoire git du worktree, que rien ne commite et qui part
// avec lui : l'arbre jugé, ce qui n'est pas commité compris, lu avant que les
// gates ne partent ; leur code de sortie ; leur horloge et leur processeur,
// enfants compris. À la fin du cook, la station lit les reçus et écrit un
// `gates.ran` par passage, `runner: cook`.
//
// Un reçu vaut ce que vaut le cook qui l'a laissé : il l'écrit dans son propre
// worktree. Ce qu'il en dit ne sert à la pass que sur l'arbre exact qu'elle
// jugerait — sa fusion avec la base —, et la CI et la relecture jugent la
// livraison quoi qu'il en soit. Un cook qui joue le script sans le lanceur ne
// laisse aucun reçu : la pass joue ses gates, comme avant.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { empreinteDeConfig } from "./empreinte-des-gates.ts";
import { aDesGates, processeurDesEnfants, SCRIPT_GATES } from "./gates.ts";
import type { Journal } from "./journal.ts";
import { noterCoutDesGates } from "./cout-des-gates.ts";
import { execFileSync } from "./sans-invite.ts";

// Sous le `.git` du clone, commun à ses worktrees : la cloison le rend au cook
// en écriture, et le chemin ne change pas d'un cook à l'autre — un renvoi qui
// reprend la session du précédent le retrouve.
export const LANCEUR = "brigade/gates-du-cook";
// Dans le répertoire git du worktree : le sien seul.
export const RECUS = "brigade-gates.recus";
// Ce qu'un cook joue de gates en un tour se compte en dizaines au plus : au-delà,
// seuls les derniers reçus comptent.
const RECUS_MAX = 50;
const ARBRE = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

// Le lanceur. L'arbre se lit dans un index à part, copié de celui du worktree :
// le cook ne voit rien bouger dans le sien. L'horloge en millisecondes vient
// de `EPOCHREALTIME` (bash 5), à la seconde sinon. `times` se lit dans le shell
// qui a attendu les gates — dans un sous-shell, il ne dirait rien d'elles.
const SCRIPT = `#!/usr/bin/env bash
# Les gates du projet, jouées par un cook de la brigade : le script du projet,
# tel quel — sa sortie et son code de sortie sont les siens —, et un reçu pour
# la station. Posé par le runtime (runtime/src/gates-du-cook.ts), réécrit à
# chaque cook. Usage : gates-du-cook [<worktree>]
set -u
WT="\${1:-$(git rev-parse --show-toplevel)}"
cd "$WT" || exit 2
WT="$PWD"
horloge() {
  if [ -n "\${EPOCHREALTIME-}" ]; then
    local t="\${EPOCHREALTIME//[.,]/}"
    echo "\${t:0:\${#t}-3}"
  else
    echo "$(date +%s)000"
  fi
}
DOSSIER="$(git rev-parse --absolute-git-dir 2>/dev/null)" || DOSSIER=""
ARBRE=""
if [ -n "$DOSSIER" ]; then
  INDEX="$DOSSIER/brigade-gates.index.$$"
  cp "$DOSSIER/index" "$INDEX" 2>/dev/null || rm -f "$INDEX"
  ARBRE="$(GIT_INDEX_FILE="$INDEX" git add --all -- :/ >/dev/null 2>&1 && GIT_INDEX_FILE="$INDEX" git write-tree 2>/dev/null)" || ARBRE=""
  rm -f "$INDEX"
fi
DEBUT="$(horloge)"
"$WT/${SCRIPT_GATES}" "$WT"
CODE=$?
FIN="$(horloge)"
if [ -n "$ARBRE" ]; then
  TEMPS="$DOSSIER/brigade-gates.temps.$$"
  times >"$TEMPS"
  printf '%s\\t%s\\t%s\\t%s\\n' "$ARBRE" "$CODE" "$((FIN - DEBUT))" "$(sed -n 2p "$TEMPS")" >>"$DOSSIER/${RECUS}"
  rm -f "$TEMPS"
fi
exit "$CODE"
`;

const git = (worktree: string, ...args: string[]) => execFileSync("git", ["-C", worktree, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

// Le répertoire git du worktree, où vivent ses reçus. Null : ce n'est pas un
// worktree git.
const dossierDuWorktree = (worktree: string): string | null => {
  try {
    return git(worktree, "rev-parse", "--absolute-git-dir");
  } catch {
    return null;
  }
};

// Pose le lanceur pour le cook qui entre dans ce worktree, et efface les reçus
// qu'un cook précédent y aurait laissés. Rend son chemin, ou null : le projet
// n'a pas de gates, ou le worktree n'est pas un worktree git — le cook joue
// alors les gates comme le dépôt le dit, et la pass les rejoue. Ne lève pas.
export function poserLeLanceur(worktree: string): string | null {
  if (!aDesGates(worktree)) return null;
  try {
    const dossier = git(worktree, "rev-parse", "--absolute-git-dir");
    rmSync(join(dossier, RECUS), { force: true });
    const lanceur = join(resolve(worktree, git(worktree, "rev-parse", "--git-common-dir")), LANCEUR);
    // Un autre cook le joue peut-être en ce moment : bash lit son script au fil
    // de l'eau, il ne se réécrit donc pas en place. Le même, il ne se réécrit pas.
    if (!existsSync(lanceur) || readFileSync(lanceur, "utf8") !== SCRIPT) {
      mkdirSync(join(lanceur, ".."), { recursive: true });
      const neuf = `${lanceur}.${process.pid}`;
      writeFileSync(neuf, SCRIPT, { mode: 0o755 });
      renameSync(neuf, lanceur);
    }
    return lanceur;
  } catch {
    return null;
  }
}

export type PassageDuCook = { tree: string; code: number; durationMs: number; cpuMs: number | null };

// Les reçus d'un répertoire git, dans l'ordre où ils ont été laissés. Une
// ligne illisible ne compte pas.
function lireLesRecusDe(dossier: string): PassageDuCook[] {
  let contenu: string;
  try {
    contenu = readFileSync(join(dossier, RECUS), "utf8");
  } catch {
    return [];
  }
  return contenu
    .split("\n")
    .flatMap((ligne): PassageDuCook[] => {
      const [tree = "", code = "", duree = "", temps = ""] = ligne.split("\t");
      if (!ARBRE.test(tree) || !/^\d+$/.test(code) || !/^\d+$/.test(duree)) return [];
      return [{ tree, code: Number(code), durationMs: Number(duree), cpuMs: processeurDesEnfants(temps) }];
    })
    .slice(-RECUS_MAX);
}

// Ceux d'un worktree.
export function lireLesRecus(worktree: string): PassageDuCook[] {
  const dossier = dossierDuWorktree(worktree);
  return dossier === null ? [] : lireLesRecusDe(dossier);
}

// Écrit au journal les gates que le cook a jouées par le lanceur, une fois
// son tour fini, et efface ses reçus : un cook repris dans le même worktree
// ne les fait pas compter deux fois. La configuration est lue dans le
// worktree tel que le cook le laisse. Rend le nombre de passages écrits. Ne
// lève pas : un reçu illisible n'est qu'un passage que la pass rejouera.
export function noterGatesDuCook(journal: Journal, cuisson: { projet: string; ticket: number; auteur: string; worktree: string }): number {
  const dossier = dossierDuWorktree(cuisson.worktree);
  if (dossier === null) return 0;
  const passages = lireLesRecusDe(dossier);
  try {
    rmSync(join(dossier, RECUS), { force: true });
  } catch {
    // Laissés là : le worktree part avec eux.
  }
  if (passages.length === 0) return 0;
  const config = empreinteDeConfig(cuisson.worktree);
  for (const { tree, code, durationMs, cpuMs } of passages) {
    noterCoutDesGates(journal, {
      projet: cuisson.projet,
      ticket: cuisson.ticket,
      coureur: "cook",
      auteur: cuisson.auteur,
      gates: { outcome: code === 0 ? "green" : "red", code, failures: [], tail: "" },
      cout: { durationMs, cpuMs },
      empreinte: { tree, config },
    });
  }
  return passages.length;
}
