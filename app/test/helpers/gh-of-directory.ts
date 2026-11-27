// Le `gh` d'un test : la doublure, réglée sur le répertoire de ce test seul. Le répertoire est dit
// au script lui-même, pas à l'environnement du process — deux tests d'un même fichier peuvent donc
// courir ensemble, chacun avec ses gists.
//
// Le `gh` est un vrai programme, que le code essayé lance comme le vrai — lui-même ou une station
// lancée par le test : ses arguments, son entrée, sa sortie, ses erreurs et son code de sortie. Mais
// la doublure répond dans le process du test : un Node lancé par appel coûtait plus de cent
// millisecondes de processeur, et un fichier de tests en fait des centaines. Le script, en shell,
// dépose son appel dans un dossier à lui, le nomme sur un tube que le test lit, puis attend son code
// de sortie sur son propre tube.
//
// Tubes et appels sont dans un dossier du process, pas dans celui du test : un `gh` lancé pendant
// que le test se termine — une station qui écrit son arrêt — a toujours sa réponse, même quand le
// répertoire de ses gists n'est plus là (la doublure échoue alors, comme elle échouait seule). Le
// tube du test reste lu jusqu'à la fin du process, sans le retenir. Le dossier part avec lui : un
// `gh` qui attend encore sa réponse reçoit un échec, un `gh` lancé après ne trouve plus de tube et
// sort en erreur — aucun n'attend sans fin.
import { execFileSync } from "node:child_process";
import { chmodSync, closeSync, constants, existsSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Rendered } from "../stations/fake-gh-gists.ts";

// Le code d'un `gh` qui n'a pas pu poser sa demande, ou dont le process du test est parti avant de répondre.
const WITHOUT_TEST = 70;

export type StandIn = (directory: string, args: readonly string[], entry: () => string) => Rendered;

let pipes: { dossier: string; ouverts: number } | undefined;
function folderOfPipes(): { dossier: string; ouverts: number } {
  if (pipes !== undefined) return pipes;
  const folder = mkdtempSync(join(tmpdir(), "brigade-app-gh-"));
  process.on("exit", () => {
    const queued = readdirSync(folder).flatMap((name) => {
      try {
        return name.startsWith("appel.") ? [openSync(join(folder, name, "reponse"), constants.O_WRONLY | constants.O_NONBLOCK)] : [];
      } catch {
        return [];
      }
    });
    rmSync(folder, { recursive: true, force: true });
    for (const answer of queued) {
      writeSync(answer, `${WITHOUT_TEST}\n`);
      closeSync(answer);
    }
  });
  pipes = { dossier: folder, ouverts: 0 };
  return pipes;
}

export function ghOfDirectory(directory: string, reply: StandIn): string {
  const pipesOfProcess = folderOfPipes();
  const requests = join(pipesOfProcess.dossier, `demandes-${++pipesOfProcess.ouverts}`);
  execFileSync("mkfifo", [requests]);
  // Ouvert en lecture et en écriture : le tube ne voit jamais sa fin quand un `gh` a fini d'y écrire.
  const pipe = new Socket({ fd: openSync(requests, constants.O_RDWR | constants.O_NONBLOCK), readable: true, writable: false });
  pipe.unref();
  let readOne = "";
  pipe.setEncoding("utf8");
  pipe.on("data", (piece: string) => {
    readOne += piece;
    for (let end = readOne.indexOf("\n"); end !== -1; end = readOne.indexOf("\n")) {
      serve(readOne.slice(0, end));
      readOne = readOne.slice(end + 1);
    }
  });

  const serve = (call: string) => {
    let rendered: Rendered;
    try {
      const args = readFileSync(join(call, "args"), "utf8").split("\0").slice(0, -1);
      rendered = reply(directory, args, () => (existsSync(join(call, "entree")) ? readFileSync(join(call, "entree"), "utf8") : ""));
    } catch (error) {
      // Comme un Node qui meurt d'une exception : code 1, et ce qui l'a tué sur sa sortie d'erreur.
      rendered = { code: 1, sortie: "", erreurs: `${error instanceof Error ? error.stack : String(error)}\n` };
    }
    try {
      writeFileSync(join(call, "sortie"), rendered.sortie);
      writeFileSync(join(call, "erreurs"), rendered.erreurs);
      const answer = openSync(join(call, "reponse"), constants.O_WRONLY | constants.O_NONBLOCK);
      writeSync(answer, `${rendered.code}\n`);
      closeSync(answer);
    } catch {
      // Le `gh` a été tué avant sa réponse : personne ne l'attend plus.
    }
  };

  const gh = join(directory, "gh");
  writeFileSync(
    gh,
    `#!/bin/sh
d='${pipesOfProcess.dossier}'/appel.$$
[ -e "$d" ] && rm -rf "$d"
mkdir "$d" && mkfifo "$d/reponse" || exit ${WITHOUT_TEST}
exec 3<>"$d/reponse"
: >"$d/args"
avant=
for arg; do
  printf '%s\\000' "$arg" >>"$d/args"
  [ "$avant" = --input ] && [ "$arg" = - ] && cat >"$d/entree"
  avant=$arg
done
printf '%s\\n' "$d" >'${requests}' || exit ${WITHOUT_TEST}
read -r code <&3
cat "$d/sortie"
cat "$d/erreurs" >&2
rm -rf "$d"
exit "$code"
`,
  );
  chmodSync(gh, 0o755);
  return gh;
}
