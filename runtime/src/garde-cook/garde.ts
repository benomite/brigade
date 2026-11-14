// La garde des appels d'outil d'un cook (#3506). Le cook part sans demande de
// permission, sur la station : son worktree isole son code, pas le disque, ni
// le `gh` de la station, qui agit en chef. Avant chaque appel, le crochet
// PreToolUse (`crochet.ts`) le juge ici :
//   - Write, Edit, MultiEdit, NotebookEdit n'écrivent que sous son worktree et
//     les dossiers temporaires ;
//   - une commande Bash qui efface, déplace ou écrit (`rm`, `mv`, `cp`, une
//     redirection…) ne vise que là, chemins résolus — absolus, `..`, liens ;
//   - `gh` ne sert que son ticket (`gh.ts`).
// Un refus dit pourquoi au cook ; ce qui passe ne reçoit aucune décision, et
// suit son cours : la garde n'ajoute jamais de demande de permission. Rien
// n'est demandé au réseau, aucun process n'est lancé : la décision se prend sur
// l'appel et le disque.
import { tmpdir } from "node:os";
import { basename, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { lieu, reel, sous } from "./chemins.ts";
import { jugerGh } from "./gh.ts";
import { deplier, lireShell, type Deplie } from "./shell.ts";

// Le cook gardé : son worktree, les dossiers temporaires où il écrit aussi,
// son ticket, son dépôt (`owner/nom`) et sa branche.
export type Garde = { worktree: string; temporaires: string[]; ticket: number; depot: string; branche: string };
export type Appel = { tool_name?: unknown; tool_input?: unknown; cwd?: unknown };

const PREFIXE = "garde du cook — ";
const refus = (raison: string) => `${PREFIXE}${raison}`;

// Les outils de `claude` qui écrivent un fichier, et où ils le nomment.
const OUTILS_QUI_ECRIVENT: Record<string, string> = { Write: "file_path", Edit: "file_path", MultiEdit: "file_path", NotebookEdit: "notebook_path" };
export const OUTILS_GARDES = [...Object.keys(OUTILS_QUI_ECRIVENT), "Bash"];

// Ce qu'une redirection écrit sans rien toucher sur le disque.
const SANS_DISQUE = /^\/dev\/(?:null|stdout|stderr|tty|fd\/\d+)$/;

type Lieux = { racines: string[]; garde: Garde };

const ouAutorise = (garde: Garde) => `ton worktree (${garde.worktree}) et les dossiers temporaires (${garde.temporaires.join(", ")})`;

// `cible` (déjà dépliée), visée par `quoi` depuis `cwd` : null si elle reste
// sous le worktree ou un dossier temporaire, la raison du refus sinon.
// `efface` : la racine elle-même est refusée — effacer son worktree, ou tout
// le dossier temporaire de la machine, n'est pas effacer dessous.
function juger(lieux: Lieux, cible: Deplie, cwd: string | null, quoi: string, efface: boolean): string | null {
  if (cible.incertain) return refus(`${quoi} « ${cible.texte || "…"} » : la garde ne sait pas où mène ce chemin (variable inconnue ou substitution). Écris-le en clair.`);
  if (cible.texte === "" || SANS_DISQUE.test(cible.texte)) return null;
  // Un motif se juge par le dossier qui le porte.
  const brut = cible.motif === -1 ? cible.texte : cible.texte.slice(0, cible.texte.lastIndexOf("/", cible.motif) + 1) || ".";
  if (!isAbsolute(brut) && cwd === null) return refus(`${quoi} « ${cible.texte} » : la garde ne sait plus dans quel dossier la commande se trouve (un \`cd\` qu'elle ne lit pas). Donne un chemin absolu.`);
  const chemin = reel(brut, cwd ?? lieux.garde.worktree);
  const racine = lieux.racines.find((r) => sous(r, chemin));
  if (racine === undefined) return refus(`${quoi} « ${cible.texte} » mène à ${chemin}, hors de ${ouAutorise(lieux.garde)} : un cook n'écrit ni n'efface rien ailleurs.`);
  if (efface && cible.motif === -1 && chemin === racine) return refus(`${quoi} « ${cible.texte} » vise ${racine} tout entier : un cook n'efface que ce qui est dessous.`);
  return null;
}

// Les mots d'une commande sans ses options : tout après `--`.
const argumentsDe = (mots: Deplie[]) => {
  const fin = mots.findIndex((mot) => mot.texte === "--" && !mot.incertain);
  return [...(fin === -1 ? mots : mots.slice(0, fin)).filter((mot) => mot.incertain || !mot.texte.startsWith("-") || mot.texte === "-"), ...(fin === -1 ? [] : mots.slice(fin + 1))];
};
// La valeur de `-t X`, `--target-directory=X`.
const repertoireCible = (mots: Deplie[]) => {
  const t = mots.findIndex((mot) => mot.texte === "-t");
  if (t !== -1 && mots[t + 1] !== undefined) return mots[t + 1];
  const long = mots.find((mot) => mot.texte.startsWith("--target-directory="));
  return long === undefined ? undefined : { ...long, texte: long.texte.slice("--target-directory=".length) };
};

// Ce qu'une commande efface ou écrit, d'après son nom : les mots à juger, et
// si elle efface.
function cibles(nom: string, mots: Deplie[]): { vises: Deplie[]; efface: boolean } | null {
  const args = argumentsDe(mots);
  switch (nom) {
    case "rm":
    case "rmdir":
    case "unlink":
    case "shred":
    case "srm":
    case "trash":
    case "trash-put":
      return { vises: args, efface: true };
    case "mv": {
      const t = repertoireCible(mots);
      return { vises: t === undefined ? args : [...args.filter((mot) => mot !== t), t], efface: true };
    }
    case "cp":
    case "ln":
    case "install": {
      const t = repertoireCible(mots);
      const vise = t ?? (args.length > 1 ? args.at(-1) : undefined);
      return { vises: vise === undefined ? [] : [vise], efface: false };
    }
    case "truncate":
    case "tee":
      return { vises: args, efface: false };
    case "chmod":
    case "chown":
    case "chgrp":
      return { vises: mots.some((mot) => mot.texte.startsWith("--reference")) ? args : args.slice(1), efface: false };
    case "dd":
      return { vises: mots.filter((mot) => mot.texte.startsWith("of=")).map((mot) => ({ ...mot, texte: mot.texte.slice(3) })), efface: false };
    case "find": {
      const efface = mots.some((mot, rang) => mot.texte === "-delete" || ((mot.texte === "-exec" || mot.texte === "-execdir" || mot.texte === "-ok") && ["rm", "mv", "shred", "unlink", "rmdir"].includes(basename(mots[rang + 1]?.texte ?? ""))));
      if (!efface) return null;
      // Les dossiers de départ : ce qui précède la première expression.
      const premiere = mots.findIndex((mot) => /^[-(!]/.test(mot.texte));
      const depart = premiere === -1 ? mots : mots.slice(0, premiere);
      return { vises: depart.length === 0 ? [{ texte: ".", incertain: false, motif: -1 }] : depart, efface: true };
    }
    default:
      return null;
  }
}

// Ce qui précède une commande sans en être une : mots du shell, enveloppes.
const MOTS_DU_SHELL = new Set(["if", "then", "else", "elif", "do", "while", "until", "!", "{", "}", "time", "fi", "done"]);
const ENVELOPPES = new Set(["sudo", "env", "command", "exec", "nohup", "nice", "ionice", "stdbuf", "timeout", "builtin", "doas", "xargs"]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);
const AFFECTATION = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s;
// Au-delà, un `bash -c` dans un `bash -c`… est refusé.
const PROFONDEUR_MAX = 8;

function jugerBash(lieux: Lieux, commande: string, cwdDeDepart: string | null, env: Record<string, string | undefined>, profondeur: number): string | null {
  if (profondeur > PROFONDEUR_MAX) return refus("la commande s'imbrique trop (`sh -c` dans `sh -c`…) pour que la garde la lise : écris-la à plat.");
  const lu = lireShell(commande);
  for (const interne of lu.substitutions) {
    const dit = jugerBash(lieux, interne, cwdDeDepart, env, profondeur + 1);
    if (dit !== null) return dit;
  }
  const variables: Record<string, string | undefined> = { ...env };
  let cwd = cwdDeDepart;
  for (const simple of lu.commandes) {
    for (const cible of simple.ecritures) {
      const dit = juger(lieux, deplier(cible, variables, env.HOME), cwd, "la redirection vers", false);
      if (dit !== null) return dit;
    }
    let mots = simple.mots.map((mot) => deplier(mot, variables, env.HOME));
    const locales: Record<string, string | undefined> = {};
    while (mots.length > 0) {
      const premier = mots[0] as Deplie;
      const affectation = AFFECTATION.exec(premier.texte);
      if (MOTS_DU_SHELL.has(premier.texte)) mots = mots.slice(1);
      else if (affectation !== null) {
        locales[affectation[1] as string] = premier.incertain ? undefined : affectation[2];
        mots = mots.slice(1);
      } else if (ENVELOPPES.has(basename(premier.texte))) {
        const enveloppe = basename(premier.texte);
        mots = mots.slice(1);
        while (mots.length > 0 && ((mots[0] as Deplie).texte.startsWith("-") || (enveloppe === "env" && AFFECTATION.test((mots[0] as Deplie).texte)))) {
          const option = mots[0] as Deplie;
          const env2 = AFFECTATION.exec(option.texte);
          if (env2 !== null) locales[env2[1] as string] = option.incertain ? undefined : env2[2];
          mots = mots.slice(1);
        }
        if (enveloppe === "timeout" && mots.length > 0) mots = mots.slice(1);
        if (enveloppe === "xargs" && mots.length > 0) {
          const nom = basename((mots[0] as Deplie).texte);
          if (nom === "gh" || cibles(nom, mots.slice(1)) !== null) return refus(`\`xargs ${nom}\` : la garde ne voit pas les arguments qu'il recevra. Nomme-les dans la commande.`);
        }
      } else break;
    }
    if (mots.length === 0) {
      Object.assign(variables, locales);
      continue;
    }
    const nom = basename((mots[0] as Deplie).texte);
    const reste = mots.slice(1);
    // Une commande dont le nom vient d'une variable ou d'une substitution :
    // ce qu'elle lance n'est pas lisible ici, la substitution a été jugée.
    if ((mots[0] as Deplie).incertain) continue;
    if (nom === "cd" || nom === "pushd") {
      const vers = argumentsDe(reste)[0];
      if (vers === undefined) cwd = env.HOME ?? null;
      else if (vers.incertain || vers.texte === "-") cwd = null;
      else cwd = isAbsolute(vers.texte) ? reel(vers.texte, "/") : cwd === null ? null : reel(vers.texte, cwd);
    } else if (nom === "export" || nom === "declare" || nom === "typeset" || nom === "local" || nom === "readonly") {
      for (const mot of reste) {
        const affectation = AFFECTATION.exec(mot.texte);
        if (affectation !== null) variables[affectation[1] as string] = mot.incertain ? undefined : affectation[2];
      }
    } else if (nom === "unset") {
      for (const mot of reste) delete variables[mot.texte];
    } else if (SHELLS.has(nom) || nom === "eval" || nom === "source" || nom === ".") {
      if (nom === "eval") {
        if (reste.some((mot) => mot.incertain)) return refus("`eval` d'un texte que la garde ne lit pas (variable inconnue ou substitution) : écris la commande en clair.");
        const dit = jugerBash(lieux, reste.map((mot) => mot.texte).join(" "), cwd, { ...variables, ...locales }, profondeur + 1);
        if (dit !== null) return dit;
      } else if (SHELLS.has(nom)) {
        const c = reste.findIndex((mot) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(mot.texte));
        const texte = c === -1 ? undefined : reste[c + 1];
        if (texte !== undefined) {
          if (texte.incertain) return refus(`\`${nom} -c\` d'un texte que la garde ne lit pas (variable inconnue ou substitution) : écris la commande en clair.`);
          const dit = jugerBash(lieux, texte.texte, cwd, { ...variables, ...locales }, profondeur + 1);
          if (dit !== null) return dit;
        }
      }
    } else if (nom === "gh") {
      const dit = jugerGh(
        reste.map((mot) => mot.texte),
        { GH_REPO: Object.hasOwn(locales, "GH_REPO") ? locales.GH_REPO : variables.GH_REPO },
        lieux.garde,
      );
      if (dit !== null) return dit;
    } else {
      const vises = cibles(nom, reste);
      for (const vise of vises?.vises ?? []) {
        const dit = juger(lieux, vise, cwd, `\`${nom}\``, vises?.efface ?? false);
        if (dit !== null) return dit;
      }
    }
  }
  return null;
}

// Le jugement d'un appel d'outil du cook : null s'il passe, la raison du refus
// sinon — elle va au cook telle quelle. `env` : celui où le cook tourne (ses
// variables, son `HOME`, `GH_REPO`).
export function jugerAppel(garde: Garde, appel: Appel, env: Record<string, string | undefined>): string | null {
  const outil = typeof appel.tool_name === "string" ? appel.tool_name : "";
  const entree = typeof appel.tool_input === "object" && appel.tool_input !== null ? (appel.tool_input as Record<string, unknown>) : {};
  const cwd = typeof appel.cwd === "string" && isAbsolute(appel.cwd) ? appel.cwd : garde.worktree;
  const lieux: Lieux = { racines: [garde.worktree, ...garde.temporaires].map(lieu), garde };
  const champ = OUTILS_QUI_ECRIVENT[outil];
  if (champ !== undefined) {
    const fichier = entree[champ];
    if (typeof fichier !== "string" || fichier === "") return refus(`${outil} sans chemin lisible : la garde ne sait pas où il écrit.`);
    const chemin = reel(fichier, cwd);
    return lieux.racines.some((racine) => sous(racine, chemin)) ? null : refus(`${outil} de ${fichier} : ce chemin mène à ${chemin}, hors de ${ouAutorise(garde)}. Un cook n'écrit que là.`);
  }
  if (outil === "Bash") {
    const commande = entree.command;
    if (typeof commande !== "string") return refus("une commande Bash sans texte lisible : la garde ne sait pas ce qu'elle fait.");
    return jugerBash(lieux, commande, cwd, env, 0);
  }
  return null;
}

// Les dossiers temporaires d'un cook : celui de la station, que le cook
// hérite (`TMPDIR`), et `/tmp`.
export function temporairesDuCook(): string[] {
  return [...new Set([tmpdir(), ...(process.platform === "win32" ? [] : ["/tmp"])])];
}

// Le crochet, et la commande qui le lance pour un cook. Le node de la
// station, sous son modèle de permissions : il lit le disque, et rien
// d'autre — ni réseau, ni process, ni écriture. La garde de ce cook passe en
// argument, encodée : la commande est lue par un shell.
const CROCHET = fileURLToPath(new URL("./crochet.ts", import.meta.url));
export function commandeDuCrochet(garde: Garde): string {
  return `"${process.execPath}" --permission "--allow-fs-read=*" "${CROCHET}" "${encodeURIComponent(JSON.stringify(garde))}"`;
}

type Crochet = { matcher: string; hooks: Array<{ type: "command"; command: string }> };

// Les arguments d'un cook, gardés : le crochet de la garde posé dans ses
// réglages (`--settings`). S'il en a déjà — le bac à sable d'un Mac —, il
// s'ajoute à leurs crochets PreToolUse, qui gardent les leurs ; sinon les
// réglages se posent avant `--disallowedTools`, qui avale tout ce qui le suit.
// Rien d'autre ne change : ni le mode de permission, ni les outils.
export function garderLeCook(args: readonly string[], cook: Omit<Garde, "temporaires">): string[] {
  const garde: Garde = { ...cook, temporaires: temporairesDuCook() };
  const crochet: Crochet = { matcher: OUTILS_GARDES.join("|"), hooks: [{ type: "command", command: commandeDuCrochet(garde) }] };
  const place = args.indexOf("--settings");
  if (place !== -1 && place + 1 < args.length) {
    const reglages = JSON.parse(args[place + 1] as string) as { hooks?: { PreToolUse?: Crochet[] } };
    const hooks = { ...reglages.hooks, PreToolUse: [...(reglages.hooks?.PreToolUse ?? []), crochet] };
    return [...args.slice(0, place + 1), JSON.stringify({ ...reglages, hooks }), ...args.slice(place + 2)];
  }
  const fin = args.indexOf("--disallowedTools");
  const reglages = ["--settings", JSON.stringify({ hooks: { PreToolUse: [crochet] } })];
  return fin === -1 ? [...args, ...reglages] : [...args.slice(0, fin), ...reglages, ...args.slice(fin)];
}
