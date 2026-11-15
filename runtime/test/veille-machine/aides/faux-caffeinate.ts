// Un faux `caffeinate` (#3642) : il note son lancement dans son témoin, puis vit tant que le pid qu'on lui donne après
// `-w` vit — ce que fait le vrai, sur un Mac. Lancé : `node faux-caffeinate.ts <témoin> -i -w <pid>`.
import { appendFileSync } from "node:fs";

const [temoin = "", ...args] = process.argv.slice(2);
appendFileSync(temoin, `${JSON.stringify({ pid: process.pid, args })}\n`);
const suivi = Number(args[args.indexOf("-w") + 1]);
setInterval(() => {
  try {
    process.kill(suivi, 0);
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "ESRCH") process.exit(0);
  }
}, 20);
