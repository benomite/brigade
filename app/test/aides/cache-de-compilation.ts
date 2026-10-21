// Chargé par `npm test` avant tout fichier de tests (`--import`) : le cache de compilation de
// Node, celui que le runtime partage (`brigade-runtime-compile-cache`), dans le dossier
// temporaire du poste — sauf si `NODE_COMPILE_CACHE` en nomme déjà un. Posé ici et non dans la
// ligne de `package.json` : `cmd.exe`, qui joue les scripts de npm sous Windows, ne lit pas
// `VAR=… commande`. Chaque fichier de tests est un process à part, qui hérite de la variable.
import { enableCompileCache } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.NODE_COMPILE_CACHE ||= join(tmpdir(), "brigade-runtime-compile-cache");
enableCompileCache(process.env.NODE_COMPILE_CACHE);
