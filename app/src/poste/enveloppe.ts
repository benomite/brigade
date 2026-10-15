// La station de l'ordinateur, telle que l'app la lance : `node enveloppe.ts <main.ts>`. Le
// point d'entrée est celui d'un serveur (runtime/src/station/main.ts), joué tel quel ; seule sa
// vie change de tenant — l'app, au lieu du système.
//
// Son entrée est un tuyau que l'app garde ouvert. Fermé — l'app quitte, ou meurt d'un coup —, la
// station reçoit ce qu'un SIGTERM lui donne sur un serveur : elle arrête ses projets et écrit sur
// GitHub l'heure de son arrêt. Le signal est émis dans son process, et non envoyé par le système :
// c'est le même geste sur toutes les plateformes, Windows compris. Joué par Node seul : rien ne
// s'importe ici hors de Node.
import { pathToFileURL } from "node:url";

const [, , principal] = process.argv;
if (principal === undefined || principal === "") {
  console.error("brigade : refus de démarrer la station — l'enveloppe attend le chemin de son point d'entrée");
  process.exit(2);
}

// L'app partie, plus personne ne lit ce que la station dit : elle s'arrête quand même, sans le dire.
for (const sortie of [process.stdout, process.stderr]) sortie.on("error", () => {});

await import(pathToFileURL(principal).href);

// Après l'import : la station a posé ce qu'elle fait d'un SIGTERM. Une entrée fermée plus tôt
// attend ici d'être lue, elle ne se perd pas.
process.stdin.on("error", () => {});
process.stdin.once("end", () => void process.emit("SIGTERM", "SIGTERM"));
process.stdin.resume();
