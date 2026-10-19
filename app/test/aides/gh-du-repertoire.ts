// Le `gh` d'un test : la doublure, réglée sur le répertoire de ce test seul. Le répertoire est dit
// au script lui-même, pas à l'environnement du process — deux tests d'un même fichier peuvent donc
// courir ensemble, chacun avec ses gists.
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function ghDuRepertoire(repertoire: string, doublure: string): string {
  const gh = join(repertoire, "gh");
  writeFileSync(gh, `#!/bin/sh\nFAUX_GISTS='${repertoire}' exec '${process.execPath}' '${doublure}' "$@"\n`);
  chmodSync(gh, 0o755);
  return gh;
}
