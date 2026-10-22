#!/usr/bin/env node
// Une doublure de `claude` qui se lance comme un exécutable, par son shebang,
// sur toutes les plateformes : sous macOS et Linux par le noyau, sous Windows
// par la station, qui la fait jouer par son node (`sans-invite.ts`). Aucun
// shell : rien d'elle ne suppose bash, et elle se joue telle quelle sous
// Windows — là où `faux-claude.sh` ne se joue pas encore.
//
// FAUX_COOK : son scénario.
//   - « livre » : commite un fichier dans son répertoire, puis conclut.
//   - « attend » : lance un enfant, qui lance un petit-enfant, dit un tour et
//     vit — jusqu'à ce qu'on l'arrête. Sous Windows, chaque étage lance le
//     suivant détaché : sinon Node le range dans un job qui meurt avec lui, et
//     tuer le cook seul suffirait à tout tuer. Sous macOS et Linux, chacun reste
//     dans le groupe du cook.
// FAUX_COOK_TEMOIN : un répertoire, qui existe. Chaque lancement y écrit
//   `<pid>.json` : ses arguments, son répertoire, le fichier `LISEZMOI` de son
//   dépôt tel qu'il est extrait, et le `core.autocrlf` que son `git` lit.
// FAUX_COOK_PIDS : un répertoire, qui existe, où chaque étage de l'arbre
//   (« attend ») écrit son pid.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dire = (objet: unknown) => process.stdout.write(`${JSON.stringify(objet)}\n`);
const git = (...args: string[]) => spawnSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true });

// Un étage de l'arbre d'un cook « attend » : il écrit son pid, lance le suivant
// s'il en reste, et vit.
function etage(dossier: string, reste: number): void {
  if (reste > 0) spawn(process.execPath, [import.meta.filename, "--etage", dossier, String(reste - 1)], { stdio: "ignore", detached: process.platform === "win32", windowsHide: true });
  writeFileSync(join(dossier, `${process.pid}.pid`), "");
  setInterval(() => {}, 1000);
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
    const autocrlf = git("config", "--get", "core.autocrlf");
    writeFileSync(
      join(temoin, `${process.pid}.json`),
      JSON.stringify({
        args: process.argv.slice(2),
        cwd: process.cwd(),
        lisezmoi: existsSync("LISEZMOI") ? readFileSync("LISEZMOI", "utf8") : null,
        autocrlf: autocrlf.status === 0 ? autocrlf.stdout.trim() : null,
      }),
    );
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
