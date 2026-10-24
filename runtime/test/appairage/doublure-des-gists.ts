// La doublure de `gh` pour les gists du compte, à donner pour `gh` : son
// frontal shell, qui lit un gist sans démarrer de Node (faux-gh-gists.sh,
// #1635) et cède le reste à faux-gh-gists.ts. Sous Windows, faux-gh-gists.ts
// lui-même, que le runtime y lance par son shebang.
import { join } from "node:path";

export const FAUX_GH_GISTS = join(import.meta.dirname, process.platform === "win32" ? "faux-gh-gists.ts" : "faux-gh-gists.sh");
