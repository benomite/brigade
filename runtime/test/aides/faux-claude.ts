#!/usr/bin/env node
// Doublure de `claude` : rejoue un flux `stream-json` choisi par la variable
// FAUX_CLAUDE, sans réseau ni quota. Exécutable, pour servir tel quel de
// BRIGADE_CLAUDE_BIN. Ses arguments ne changent pas ce qu'elle joue, sauf
// `auth status` ; elle les note, avec son répertoire et son environnement, dans
// le fichier FAUX_CLAUDE_TEMOIN s'il est donné.
//
// FAUX_CLAUDE_SUITE : un fichier d'un scénario par ligne. Chaque lancement en
// consomme la première ; la suite épuisée, c'est FAUX_CLAUDE qui joue.
import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);

// `claude auth status` : la session de la machine, sans appel au modèle.
if (args[0] === "auth" && args[1] === "status") {
  const loggedIn = process.env.FAUX_CLAUDE_SESSION !== "absente";
  console.log(JSON.stringify({ loggedIn, authMethod: loggedIn ? "claude.ai" : "none" }));
  process.exit(loggedIn ? 0 : 1);
}

if (process.env.FAUX_CLAUDE_TEMOIN) {
  appendFileSync(process.env.FAUX_CLAUDE_TEMOIN, `${JSON.stringify({ args, cwd: process.cwd(), env: process.env })}\n`);
}

// Un flux de test/aides/flux, rejoué tel quel.
const rejouer = (nom: string, code: number) => {
  process.stdout.write(readFileSync(join(import.meta.dirname, "flux", `${nom}.jsonl`)));
  process.exitCode = code;
};

const dire = (objet: unknown) => process.stdout.write(`${JSON.stringify(objet)}\n`);

let numero = 0;
const assistant = (usage: Record<string, number> = { input_tokens: 3, output_tokens: 7 }, id = `msg_${++numero}`) =>
  dire({ type: "assistant", message: { id, role: "assistant", usage } });
const resultat = (result = "") => dire({ type: "result", subtype: "success", is_error: false, num_turns: numero, result });
// Ce que fait un cook qui travaille : un commit dans son répertoire.
const commiter = () => {
  writeFileSync("travail.txt", "le travail du cook\n");
  // Hors d'un dépôt (un worktree de test sans git), le fichier vaut commit.
  if (!existsSync(".git")) return;
  const git = (...commande: string[]) =>
    execFileSync("git", ["-c", "user.name=cook", "-c", "user.email=cook@brigade.test", "-c", "commit.gpgsign=false", ...commande]);
  git("add", "travail.txt");
  git("commit", "-q", "-m", "le travail du cook");
};
const rester = () => setInterval(() => {}, 1000);
const parlerSansFin = () => setInterval(() => assistant(), 2);

const scenarios: Record<string, () => void> = {
  // Commite son travail, puis rend son compte-rendu.
  livre() {
    commiter();
    assistant();
    resultat("J'ai ajouté `travail.txt` et vérifié qu'il se lit.");
  },
  // Les trois flux de test/aides/flux.
  "fini-sans-commit": () => rejouer("fini", 0),
  "non-connecte": () => rejouer("non-connecte", 1),
  quota: () => rejouer("quota-epuise", 1),
  // Le quota épuisé, sans rien qui dise quand il revient.
  "quota-sans-heure"() {
    const lignes = readFileSync(join(import.meta.dirname, "flux/quota-epuise.jsonl"), "utf8").split("\n");
    process.stdout.write(lignes.filter((ligne) => !ligne.includes("rate_limit_event")).join("\n"));
    process.exitCode = 1;
  },
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

let nom = process.env.FAUX_CLAUDE ?? "";
const suite = process.env.FAUX_CLAUDE_SUITE;
if (suite && existsSync(suite)) {
  const [premier, ...reste] = readFileSync(suite, "utf8").split("\n").filter(Boolean);
  if (premier) {
    nom = premier;
    writeFileSync(suite, reste.join("\n"));
  }
}
const scenario = scenarios[nom];
if (!scenario) {
  console.error(`faux claude : scénario inconnu « ${nom} »`);
  process.exit(64);
}
scenario();
