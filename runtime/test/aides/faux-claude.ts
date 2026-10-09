#!/usr/bin/env node
// Les scénarios de la doublure de `claude` qui vivent : parler sans fin,
// entendre un signal, attendre le test. C'est faux-claude.sh qui la lance, une
// fois le scénario choisi — FAUX_CLAUDE le nomme — et le lancement noté ; tout
// ce qui se termine seul est écrit là-bas.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const dire = (objet: unknown) => process.stdout.write(`${JSON.stringify(objet)}\n`);

let numero = 0;
const assistant = () => dire({ type: "assistant", message: { id: `msg_${++numero}`, role: "assistant", usage: { input_tokens: 3, output_tokens: 7 } } });
const resultat = (result = "") => dire({ type: "result", subtype: "success", is_error: false, num_turns: numero, result });
const rester = () => setInterval(() => {}, 1000);
const parlerSansFin = () => setInterval(() => assistant(), 2);

const scenarios: Record<string, () => void> = {
  // Un tour, puis ne conclut que quand le test le lui dit, en posant le fichier
  // FAUX_CLAUDE_FEU : ce qui doit arriver « pendant la cuisson » ne court pas
  // contre un minuteur.
  attend() {
    assistant();
    const attente = setInterval(() => {
      if (!existsSync(process.env.FAUX_CLAUDE_FEU ?? "")) return;
      clearInterval(attente);
      resultat("J'ai ajouté `travail.txt`.");
    }, 5);
  },
  bavard: parlerSansFin,
  // Un tour une fois prêt, puis un tour à chaque SIGUSR1 : c'est le test qui
  // bat la mesure.
  "au-signal"() {
    process.on("SIGUSR1", () => assistant());
    assistant();
    rester();
  },
  // Parle sans fin et n'entend pas SIGTERM.
  sourd() {
    process.on("SIGTERM", () => {});
    parlerSansFin();
  },
  // Meurt sur SIGTERM, mais laisse un petit-enfant qui ne l'entend pas.
  "petit-enfant-sourd"() {
    // Le petit-enfant s'annonce lui-même dans le flux, une fois devenu sourd.
    const sourd = "process.on('SIGTERM', () => {}); console.log(JSON.stringify({ type: 'system', petitEnfant: process.pid })); setInterval(() => {}, 1000);";
    spawn(process.execPath, ["-e", sourd], { stdio: "inherit" });
    rester();
  },
  // Se plaint plus que ne contient un tube, puis réussit — s'il n'est pas
  // resté bloqué sur une sortie d'erreur que personne ne lit.
  "plaintif-abondant"() {
    process.stderr.write("attention\n".repeat(30_000), () => {
      assistant();
      resultat();
    });
  },
};

// Filet : une suite de tests tuée en plein vol ne laisse pas de faux cook
// derrière elle. SIGKILL, parce que certains scénarios n'entendent pas SIGTERM.
setTimeout(() => process.kill(process.pid, "SIGKILL"), 30_000).unref();

const nom = process.env.FAUX_CLAUDE ?? "";
const scenario = scenarios[nom];
if (!scenario) {
  console.error(`faux claude : scénario inconnu « ${nom} »`);
  process.exit(64);
}
scenario();
