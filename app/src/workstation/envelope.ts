// La station de l'ordinateur, telle que l'app la lance : `node envelope.ts <main.ts>`. Le
// point d'entrée est celui d'un serveur (`PRINCIPAL`, role.ts), joué tel quel ; seule sa
// vie change de tenant — l'app, au lieu du système.
//
// Son entrée est un tuyau que l'app garde ouvert. Fermé — l'app quitte, ou meurt d'un coup —, la
// station reçoit ce qu'un SIGTERM lui donne sur un serveur : elle arrête ses projets et écrit sur
// GitHub l'heure de son arrêt. Le signal est émis dans son process, et non envoyé par le système :
// c'est le même geste sur toutes les plateformes, Windows compris. Joué par Node seul : rien ne
// s'importe ici hors de Node.
import { spawn } from "node:child_process";
import { mustSurvive } from "../update-background/survival.ts";

const [, , principal] = process.argv;
if (principal === undefined || principal === "") {
  console.error("brigade : refus de démarrer la station — l'enveloppe attend le chemin de son point d'entrée");
  process.exit(2);
}

// L'app partie, plus personne ne lit ce que la station dit : elle s'arrête quand même, sans le dire.
for (const output of [process.stdout, process.stderr]) output.on("error", () => {});

// Le point d'entrée est un process à lui, comme sur un serveur : la cuisine (runtime/src/kitchen/main.ts) ne tourne que
// lancée ainsi, et un SIGTERM la tue. Il hérite de l'environnement et de la sortie de l'enveloppe.
const station = spawn(process.execPath, [principal], { stdio: ["ignore", "inherit", "inherit"], env: process.env });
station.once("error", (error) => {
  console.error(`brigade : refus de démarrer la station — ${error.message}`);
  process.exit(2);
});
station.once("exit", (code, signal) => process.exit(code ?? (signal === null ? 1 : 0)));
const stop = () => void station.kill("SIGTERM");
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, stop);

// Une entrée fermée — l'app quitte, ou meurt d'un coup — arrête la station comme un SIGTERM, le même geste sur toutes les
// plateformes, Windows compris. Sauf quand l'app se ferme pour sa mise à jour : la station continue, ses cooks aussi (#3632).
process.stdin.on("error", () => {});
process.stdin.once("end", () => {
  if (!mustSurvive(process.env.BRIGADE_STATION_DIR)) stop();
});
process.stdin.resume();
