#!/usr/bin/env node
// Une doublure de `claude` qui se lance comme un exécutable, par son shebang,
// sur toutes les plateformes : sous macOS et Linux par le noyau, sous Windows
// par la station, qui la fait jouer par son node (`sans-invite.ts`). Aucun
// shell : rien d'elle ne suppose bash, et elle se joue telle quelle sous
// Windows — là où `faux-claude.sh` ne se joue pas encore.
//
// FAUX_COOK : son scénario.
//   - « livre » : commite un fichier dans son répertoire, puis conclut.
//   - « ecrit-brigade » : écrit `.claude/brigade/reseau` puis le commite — si
//     `claude` le lui permettait, avec le mode et les `--settings` qu'il a reçus
//     (`ecrire`, plus bas) ; sinon il est refusé, ne commite rien et conclut
//     sans livrable.
//   - « setup-brigade » : la livraison d'un ticket de setup (#2888). Il écrit
//     et édite `.claude/brigade/reseau`, `gates.sh` et `worktree-setup.sh`, les
//     rend exécutables par Bash, puis tente d'écrire hors de sa zone : sous
//     `.claude/` hors de `brigade/`, dans le `.claude/brigade/` d'un autre
//     worktree et hors de son worktree (`FAUX_COOK_DEHORS`, un répertoire), par
//     ses outils comme par Bash. Chaque essai, permis ou refusé, est écrit dans
//     `<FAUX_COOK_TEMOIN>/<pid>.ecritures.json` ; il commite ce qui est écrit.
//   - « attend » : lance un enfant, qui lance un petit-enfant, dit un tour et
//     vit — jusqu'à ce qu'on l'arrête. Sous Windows, chaque étage lance le
//     suivant détaché : sinon Node le range dans un job qui meurt avec lui, et
//     tuer le cook seul suffirait à tout tuer. Sous macOS et Linux, chacun reste
//     dans le groupe du cook.
// FAUX_COOK_TEMOIN : un répertoire, qui existe. Chaque lancement y écrit
//   `<pid>.json` (écrit d'un bloc) : ses arguments, son répertoire, et le fichier `LISEZMOI` de
//   son dépôt tel qu'il est extrait.
// FAUX_COOK_PIDS : un répertoire, qui existe, où chaque étage de l'arbre
//   (« attend ») écrit son pid.
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";

const dire = (objet: unknown) => process.stdout.write(`${JSON.stringify(objet)}\n`);
const git = (...args: string[]) => spawnSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true });

// Un étage de l'arbre d'un cook « attend » : il écrit son pid, lance le suivant
// s'il en reste, et vit.
function etage(dossier: string, reste: number): void {
  if (reste > 0) spawn(process.execPath, [import.meta.filename, "--etage", dossier, String(reste - 1)], { stdio: "ignore", detached: process.platform === "win32", windowsHide: true });
  writeFileSync(join(dossier, `${process.pid}.pid`), "");
  setInterval(() => {}, 1000);
}

// Ce que `claude` (2.1.300) décide d'une écriture, d'après le mode et les
// `--settings` qu'il a reçus — les deux couches, telles qu'un vrai `claude`
// les a montrées (#2888).
type Reglages = {
  permissions?: { allow?: string[]; deny?: string[] };
  hooks?: { PermissionRequest?: Array<{ matcher: string; hooks: Array<{ command: string }> }> };
  sandbox?: { filesystem?: { allowWrite?: string[]; denyWrite?: string[] } };
};
type Decision = { permis: boolean; refus: string | null };
const argument = (nom: string) => {
  const rang = process.argv.indexOf(nom);
  return rang === -1 ? undefined : process.argv[rang + 1];
};
const reglagesRecus = (): Reglages => JSON.parse(argument("--settings") ?? "{}") as Reglages;
const sousLieu = (lieu: string, chemin: string) => chemin === lieu || chemin.startsWith(`${lieu}/`);
// Les lieux d'une règle `Edit(//lieu)` ou `Edit(//lieu/**)` : `**` couvre ce
// qui est dessous, sans lui le seul chemin nommé.
const lieuxEdit = (regles: string[] = []) => regles.flatMap((regle) => {
  const m = /^Edit\(\/(\/.*?)(\/\*\*)?\)$/.exec(regle);
  return m === null ? [] : [{ lieu: m[1]!, dessous: m[2] !== undefined }];
});
const couvert = (regles: string[] | undefined, chemin: string) => lieuxEdit(regles).some(({ lieu, dessous }) => (dessous ? chemin.startsWith(`${lieu}/`) : chemin === lieu));
// Un fichier sensible pour les outils de `claude` : sous un `.git`, `.vscode`,
// `.idea`, `.husky`, ou un `.claude/` hors de `skills`, `agents`, `commands`,
// `worktrees`. Il le demande toujours, avant de lire les règles `allow`.
const SENSIBLES = [".git", ".vscode", ".idea", ".husky"];
const sensible = (chemin: string) => {
  const morceaux = chemin.toLowerCase().split("/");
  return morceaux.some((morceau, rang) => SENSIBLES.includes(morceau) || (morceau === ".claude" && !["skills", "agents", "commands", "worktrees"].includes(morceaux[rang + 1] ?? "")));
};

// Write et Edit, outils de `claude`, hors du bac à sable : une règle `deny`
// refuse ; un fichier sensible est demandé, quelles que soient les règles
// `allow` ; sinon une règle `Edit(...)` permet (elle vaut aussi pour Write) ;
// sinon il est demandé. Une demande : refusée en `dontAsk`, sans même un
// crochet ; hors `dontAsk`, posée aux crochets PermissionRequest des
// réglages — joués pour de bon —, refusée si aucun ne la permet (`-p`).
function outil(nom: "Write" | "Edit", fichier: string): Decision {
  const reglages = reglagesRecus();
  const chemin = posix.normalize(fichier);
  if (couvert(reglages.permissions?.deny, chemin)) return { permis: false, refus: `Permission to use ${nom} has been denied.` };
  if (!sensible(chemin) && couvert(reglages.permissions?.allow, chemin)) return { permis: true, refus: null };
  if (argument("--permission-mode") === "dontAsk") return { permis: false, refus: `Permission to use ${nom} has been denied because Claude Code is running in don't ask mode.` };
  for (const { matcher, hooks } of reglages.hooks?.PermissionRequest ?? []) {
    if (!new RegExp(`^(?:${matcher})$`).test(nom)) continue;
    for (const { command } of hooks) {
      const entree = JSON.stringify({ hook_event_name: "PermissionRequest", tool_name: nom, tool_input: { file_path: fichier }, cwd: process.cwd() });
      const sortie = spawnSync(command, { shell: true, input: entree, encoding: "utf8" }).stdout.trim();
      let reponse: { hookSpecificOutput?: { decision?: { behavior?: string } } } = {};
      try {
        reponse = JSON.parse(sortie || "{}") as typeof reponse;
      } catch {
        // Une réponse illisible ne permet rien.
      }
      if (reponse.hookSpecificOutput?.decision?.behavior === "allow") return { permis: true, refus: null };
    }
  }
  return { permis: false, refus: `Claude requested permissions to write to ${fichier}, but you haven't granted it yet.` };
}

// Une commande Bash qui écrit `fichier`, dans le bac à sable : permise sous un
// lieu de `allowWrite` ou d'une règle `Edit(...)` permise, hors de `denyWrite`,
// d'une règle `Edit(...)` refusée, et de ce que le bac à sable refuse toujours
// sous le répertoire courant (réglages et crochets de `claude`, de git).
const TOUJOURS_REFUSES = [".claude/commands", ".claude/agents", ".claude/settings.json", ".claude/settings.local.json", ".git/hooks", ".git/config", ".gitmodules", ".vscode", ".idea", ".mcp.json"];
function bacASable(fichier: string): Decision {
  const { sandbox, permissions } = reglagesRecus();
  const chemin = posix.normalize(fichier);
  const permis = [...(sandbox?.filesystem?.allowWrite ?? []), ...lieuxEdit(permissions?.allow).map(({ lieu }) => lieu)];
  const refuses = [...(sandbox?.filesystem?.denyWrite ?? []), ...lieuxEdit(permissions?.deny).map(({ lieu }) => lieu), ...TOUJOURS_REFUSES.map((relatif) => posix.join(process.cwd(), relatif))];
  const ok = permis.some((lieu) => sousLieu(lieu, chemin)) && !refuses.some((lieu) => sousLieu(lieu, chemin));
  return ok ? { permis: true, refus: null } : { permis: false, refus: `${fichier}: Operation not permitted` };
}

// Filet : une suite de tests tuée en plein vol ne laisse pas d'arbre derrière
// elle — pas avant les deux minutes d'un test.
setTimeout(() => process.kill(process.pid, "SIGKILL"), 120_000).unref();

const [premier, ...suite] = process.argv.slice(2);
if (premier === "--etage") {
  etage(suite[0] ?? "", Number(suite[1] ?? 0));
} else {
  const temoin = process.env.FAUX_COOK_TEMOIN;
  if (temoin) {
    // Écrit à côté puis renommé : un test qui lit le répertoire n'y voit jamais un fichier à moitié écrit.
    const ecrit = join(temoin, `${process.pid}.json.tmp`);
    writeFileSync(
      ecrit,
      JSON.stringify({
        args: process.argv.slice(2),
        cwd: process.cwd(),
        lisezmoi: existsSync("LISEZMOI") ? readFileSync("LISEZMOI", "utf8") : null,
      }),
    );
    renameSync(ecrit, join(temoin, `${process.pid}.json`));
  }
  dire({ type: "system", subtype: "init", cwd: process.cwd() });
  const scenario = process.env.FAUX_COOK ?? "";
  if (scenario === "livre") {
    writeFileSync("travail.txt", "le travail du cook\n");
    for (const args of [["add", "travail.txt"], ["commit", "-q", "-m", "le travail du cook"]]) {
      const fait = git("-c", "commit.gpgsign=false", ...args);
      if (fait.status !== 0) {
        console.error(`faux cook : git ${args[0]} — ${fait.stderr}`);
        process.exit(1);
      }
    }
    const texte = "J'ai ajouté `travail.txt`.\n\n<livrable>\nJ'ai ajouté `travail.txt`, commité sur ma branche.\n</livrable>";
    dire({ type: "assistant", message: { id: "msg_1", role: "assistant", usage: { input_tokens: 3, output_tokens: 7 }, content: [{ type: "text", text: texte }] } });
    dire({ type: "result", subtype: "success", is_error: false, num_turns: 1, result: texte });
  } else if (scenario === "ecrit-brigade") {
    const fichier = join(process.cwd(), ".claude/brigade/reseau");
    const ecriture = outil("Write", fichier);
    let texte: string;
    if (ecriture.permis) {
      mkdirSync(dirname(fichier), { recursive: true });
      writeFileSync(fichier, "registry.npmjs.org\n");
      for (const args of [["add", ".claude/brigade/reseau"], ["commit", "-q", "-m", "la liste réseau"]]) {
        const fait = git("-c", "commit.gpgsign=false", ...args);
        if (fait.status !== 0) {
          console.error(`faux cook : git ${args[0]} — ${fait.stderr}`);
          process.exit(1);
        }
      }
      texte = "J'ai ajouté `.claude/brigade/reseau`.\n\n<livrable>\nJ'ai ajouté `.claude/brigade/reseau`, commité sur ma branche.\n</livrable>";
    } else {
      texte = ecriture.refus ?? "";
    }
    dire({ type: "assistant", message: { id: "msg_1", role: "assistant", usage: { input_tokens: 3, output_tokens: 7 }, content: [{ type: "text", text: texte }] } });
    dire({ type: "result", subtype: "success", is_error: false, num_turns: 1, result: texte });
  } else if (scenario === "setup-brigade") {
    const ici = process.cwd();
    const brigade = (nom: string) => join(ici, ".claude/brigade", nom);
    const dehors = process.env.FAUX_COOK_DEHORS ?? "";
    const essais: Array<{ par: string; chemin: string } & Decision> = [];
    const essayer = (par: string, chemin: string, decision: Decision, faire: () => void) => {
      if (decision.permis) {
        mkdirSync(dirname(chemin), { recursive: true });
        faire();
      }
      essais.push({ par, chemin, ...decision });
    };
    const ecrire = (chemin: string, texte: string) => essayer("Write", chemin, outil("Write", chemin), () => writeFileSync(chemin, texte));
    const editer = (chemin: string, avant: string, apres: string) => essayer("Edit", chemin, outil("Edit", chemin), () => writeFileSync(chemin, readFileSync(chemin, "utf8").replace(avant, apres)));
    const bash = (chemin: string, faire: () => void) => essayer("Bash", chemin, bacASable(chemin), faire);
    ecrire(brigade("reseau"), "registry.npmjs.org\n");
    editer(brigade("reseau"), "registry.npmjs.org", "registry.npmjs.org\ngithub.com");
    for (const script of ["gates.sh", "worktree-setup.sh"]) {
      ecrire(brigade(script), "#!/bin/sh\nexit 1\n");
      editer(brigade(script), "exit 1", "exit 0");
      // Le bac à sable permet ; sans fichier écrit, `chmod` n'a rien à changer.
      bash(brigade(script), () => existsSync(brigade(script)) && chmodSync(brigade(script), 0o755));
    }
    ecrire(join(ici, ".claude/settings.json"), "{}\n");
    editer(join(ici, ".claude/brigade/../settings.local.json"), "", "{}");
    ecrire(join(dehors, "autre-worktree/.claude/brigade/reseau"), "evil.example\n");
    ecrire(join(dehors, "dehors.txt"), "dehors\n");
    bash(join(dehors, "par-bash.txt"), () => writeFileSync(join(dehors, "par-bash.txt"), "dehors\n"));
    bash(join(ici, ".claude/settings.json"), () => writeFileSync(join(ici, ".claude/settings.json"), "{}\n"));
    const temoin = process.env.FAUX_COOK_TEMOIN;
    if (temoin) {
      writeFileSync(join(temoin, `${process.pid}.ecritures.tmp`), JSON.stringify(essais));
      renameSync(join(temoin, `${process.pid}.ecritures.tmp`), join(temoin, `${process.pid}.ecritures.json`));
    }
    const ecrits = [...new Set(essais.filter((essai) => essai.permis && essai.chemin.startsWith(`${ici}/`)).map((essai) => posix.relative(ici, essai.chemin)))];
    for (const args of [["add", "--", ...ecrits], ["commit", "-q", "-m", "le setup du dépôt"]]) {
      const fait = git("-c", "commit.gpgsign=false", ...args);
      if (fait.status !== 0) {
        console.error(`faux cook : git ${args[0]} — ${fait.stderr}`);
        process.exit(1);
      }
    }
    const texte = `J'ai livré ${ecrits.join(", ")}.\n\n<livrable>\nJ'ai livré ${ecrits.join(", ")}, commités sur ma branche.\n</livrable>`;
    dire({ type: "assistant", message: { id: "msg_1", role: "assistant", usage: { input_tokens: 3, output_tokens: 7 }, content: [{ type: "text", text: texte }] } });
    dire({ type: "result", subtype: "success", is_error: false, num_turns: 1, result: texte });
  } else if (scenario === "attend") {
    const pids = process.env.FAUX_COOK_PIDS ?? "";
    // Le cook est la racine : l'enfant et le petit-enfant viennent de lui.
    etage(pids, 2);
    dire({ type: "assistant", message: { id: "msg_1", role: "assistant", usage: { input_tokens: 3, output_tokens: 7 } } });
  } else {
    console.error(`faux cook : scénario inconnu « ${scenario} »`);
    process.exit(64);
  }
}
