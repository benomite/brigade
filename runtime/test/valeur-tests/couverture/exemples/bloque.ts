// Un process qui ne rend jamais la main, comme un test bloqué dans du code
// synchrone : aucun minuteur n'y tourne plus. Il écrit d'abord son pid dans le
// fichier qu'on lui donne, puis attend sans rien consommer.
import { writeFileSync } from "node:fs";

writeFileSync(process.argv[2] ?? "", String(process.pid));
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
