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
import type { Rendu } from "../stations/faux-gh-gists.ts";

// Le code d'un `gh` qui n'a pas pu poser sa demande, ou dont le process du test est parti avant de répondre.
const SANS_TEST = 70;

export type Doublure = (repertoire: string, args: readonly string[], entree: () => string) => Rendu;

let tubes: { dossier: string; ouverts: number } | undefined;
function dossierDesTubes(): { dossier: string; ouverts: number } {
  if (tubes !== undefined) return tubes;
  const dossier = mkdtempSync(join(tmpdir(), "brigade-app-gh-"));
  process.on("exit", () => {
    const enAttente = readdirSync(dossier).flatMap((nom) => {
      try {
        return nom.startsWith("appel.") ? [openSync(join(dossier, nom, "reponse"), constants.O_WRONLY | constants.O_NONBLOCK)] : [];
      } catch {
        return [];
      }
    });
    rmSync(dossier, { recursive: true, force: true });
    for (const reponse of enAttente) {
      writeSync(reponse, `${SANS_TEST}\n`);
      closeSync(reponse);
    }
  });
  tubes = { dossier, ouverts: 0 };
  return tubes;
}

export function ghDuRepertoire(repertoire: string, repondre: Doublure): string {
  const tubesDuProcess = dossierDesTubes();
  const demandes = join(tubesDuProcess.dossier, `demandes-${++tubesDuProcess.ouverts}`);
  execFileSync("mkfifo", [demandes]);
  // Ouvert en lecture et en écriture : le tube ne voit jamais sa fin quand un `gh` a fini d'y écrire.
  const tube = new Socket({ fd: openSync(demandes, constants.O_RDWR | constants.O_NONBLOCK), readable: true, writable: false });
  tube.unref();
  let lu = "";
  tube.setEncoding("utf8");
  tube.on("data", (morceau: string) => {
    lu += morceau;
    for (let fin = lu.indexOf("\n"); fin !== -1; fin = lu.indexOf("\n")) {
      servir(lu.slice(0, fin));
      lu = lu.slice(fin + 1);
    }
  });

  const servir = (appel: string) => {
    let rendu: Rendu;
    try {
      const args = readFileSync(join(appel, "args"), "utf8").split("\0").slice(0, -1);
      rendu = repondre(repertoire, args, () => (existsSync(join(appel, "entree")) ? readFileSync(join(appel, "entree"), "utf8") : ""));
    } catch (erreur) {
      // Comme un Node qui meurt d'une exception : code 1, et ce qui l'a tué sur sa sortie d'erreur.
      rendu = { code: 1, sortie: "", erreurs: `${erreur instanceof Error ? erreur.stack : String(erreur)}\n` };
    }
    try {
      writeFileSync(join(appel, "sortie"), rendu.sortie);
      writeFileSync(join(appel, "erreurs"), rendu.erreurs);
      const reponse = openSync(join(appel, "reponse"), constants.O_WRONLY | constants.O_NONBLOCK);
      writeSync(reponse, `${rendu.code}\n`);
      closeSync(reponse);
    } catch {
      // Le `gh` a été tué avant sa réponse : personne ne l'attend plus.
    }
  };

  const gh = join(repertoire, "gh");
  writeFileSync(
    gh,
    `#!/bin/sh
d='${tubesDuProcess.dossier}'/appel.$$
[ -e "$d" ] && rm -rf "$d"
mkdir "$d" && mkfifo "$d/reponse" || exit ${SANS_TEST}
exec 3<>"$d/reponse"
: >"$d/args"
avant=
for arg; do
  printf '%s\\000' "$arg" >>"$d/args"
  [ "$avant" = --input ] && [ "$arg" = - ] && cat >"$d/entree"
  avant=$arg
done
printf '%s\\n' "$d" >'${demandes}' || exit ${SANS_TEST}
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
