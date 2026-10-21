// Faux `ssh` pour le transfert de port : ce qu'il faut du vrai pour éprouver le
// geste qui ouvre la page d'un worktree. La « box » est ce poste : la prise qu'il
// ouvre relaie vraiment vers le port que `-L` nomme.
//   node faux-transfert.ts <répertoire du test> <mode> <les arguments de ssh…>
// Il note ses arguments dans `appels` et son pid dans `pids`, une ligne par lancement.
//   relaie   ouvre la prise de `-L`, et relaie vers le port jusqu'à ce qu'on l'arrête
//   ouvre    ouvre la prise, et ne relaie rien : ce qui s'y présente est aussitôt fermé
//   refuse   n'a pas joint la box : il le dit comme `ssh`, et sort en 255
//   muet     n'ouvre rien, et ne sort pas
import { appendFileSync } from "node:fs";
import { connect, createServer } from "node:net";
import { join } from "node:path";

const [racine = "", mode = "", ...args] = process.argv.slice(2);
appendFileSync(join(racine, "appels"), `${args.join(" ")}\n`);
appendFileSync(join(racine, "pids"), `${process.pid}\n`);

if (mode === "refuse") {
  process.stderr.write("ssh: connect to host box port 22: Connection refused\n");
  process.exit(255);
} else if (mode === "muet") {
  setInterval(() => {}, 3_600_000);
} else {
  // `-L <prise>:127.0.0.1:<port>`, ou — sous Windows — `-L 127.0.0.1:<port local>:127.0.0.1:<port>`.
  const morceaux = (args[args.indexOf("-L") + 1] ?? "").split(":");
  const enTcp = morceaux.length === 4;
  const port = morceaux.at(-1);
  const serveur = createServer((venue) => {
    if (mode === "ouvre") return venue.destroy();
    const vers = connect({ host: "127.0.0.1", port: Number(port) });
    venue.on("error", () => vers.destroy());
    vers.on("error", () => venue.destroy());
    venue.pipe(vers).pipe(venue);
  });
  if (enTcp) serveur.listen(Number(morceaux[1]), morceaux[0]);
  else serveur.listen(morceaux[0]);
}
