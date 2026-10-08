#!/usr/bin/env node
// Doublure de `claude` : rejoue un flux `stream-json` choisi par la variable
// FAUX_CLAUDE, sans réseau ni quota. Exécutable, pour servir tel quel de
// BRIGADE_CLAUDE_BIN : ses arguments sont ignorés.
import { spawn } from "node:child_process";

const dire = (objet: unknown) => process.stdout.write(`${JSON.stringify(objet)}\n`);

let numero = 0;
const assistant = (usage: Record<string, number> = { input_tokens: 3, output_tokens: 7 }, id = `msg_${++numero}`) =>
  dire({ type: "assistant", message: { id, role: "assistant", usage } });
const resultat = () => dire({ type: "result", subtype: "success", is_error: false, num_turns: numero });
const rester = () => setInterval(() => {}, 1000);
const parlerSansFin = () => setInterval(() => assistant(), 2);

const scenarios: Record<string, () => void> = {
  // Deux tours, un résultat, code 0.
  fini() {
    assistant();
    assistant();
    resultat();
  },
  echec() {
    assistant();
    process.exitCode = 1;
  },
  // Un même message livré en trois lignes (une par bloc de contenu), dont
  // l'usage grossit : un seul tour, et seul le dernier usage compte.
  morcele() {
    assistant({ input_tokens: 3, output_tokens: 1 }, "msg_a");
    assistant({ input_tokens: 3, output_tokens: 5 }, "msg_a");
    assistant({ input_tokens: 3, output_tokens: 9 }, "msg_a");
    resultat();
  },
  // Les lectures de cache ne comptent pas, les écritures si.
  cache() {
    assistant({ input_tokens: 1, output_tokens: 2, cache_creation_input_tokens: 4, cache_read_input_tokens: 100_000 });
    dire({ type: "user", message: { usage: { output_tokens: 999 } } });
    process.stdout.write("ceci n'est pas du JSON\n");
    resultat();
  },
  bavard: parlerSansFin,
  muet: rester,
  "muet-apres-un-tour"() {
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
  // Écrit sur la sortie d'erreur, puis réussit.
  plaintif() {
    process.stderr.write("attention\n");
    assistant();
    resultat();
  },
};

// Filet : une suite de tests tuée en plein vol ne laisse pas de faux cook
// derrière elle. SIGKILL, parce que certains scénarios n'entendent pas SIGTERM.
setTimeout(() => process.kill(process.pid, "SIGKILL"), 30_000).unref();

const scenario = scenarios[process.env.FAUX_CLAUDE ?? ""];
if (!scenario) {
  console.error(`faux claude : scénario inconnu « ${process.env.FAUX_CLAUDE} »`);
  process.exit(64);
}
scenario();
