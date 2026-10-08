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
  // Commite, puis s'arrête sans conclure : en erreur, en silence, ou sans fin.
  "commite-puis-echoue"() {
    commiter();
    assistant();
    process.exitCode = 1;
  },
  "commite-puis-se-tait"() {
    commiter();
    assistant();
    rester();
  },
  // Commite, puis ne conclut que quand le test le lui dit, en posant le fichier
  // FAUX_CLAUDE_FEU : ce qui doit arriver « pendant la cuisson » ne court pas
  // contre un minuteur.
  "commite-puis-attend"() {
    commiter();
    assistant();
    const attente = setInterval(() => {
      if (!existsSync(process.env.FAUX_CLAUDE_FEU ?? "")) return;
      clearInterval(attente);
      resultat("J'ai ajouté `travail.txt`.");
    }, 5);
  },
  "commite-puis-bavarde"() {
    commiter();
    parlerSansFin();
  },
  // Commite, puis bute sur le quota.
  "commite-puis-quota"() {
    commiter();
    rejouer("quota-epuise", 1);
  },
  // Commite, puis essuie le refus du modèle.
  "commite-puis-refuse"() {
    commiter();
    rejouer("refuse", 1);
  },
  // Les flux de test/aides/flux.
  "fini-sans-commit": () => rejouer("fini", 0),
  "non-connecte": () => rejouer("non-connecte", 1),
  quota: () => rejouer("quota-epuise", 1),
  refuse: () => rejouer("refuse", 1),
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
  // Les jugements du manager : un tour, et une décision — ou pas.
  "juge-ticket"() {
    assistant();
    resultat(
      `Ma décision.\n\n${JSON.stringify({ nature: "ticket", motif: "Un livrable, vérifiable par un test.", modele: "haiku", effort: "low", calibrage: "Correctif dont le test est déjà écrit." })}`,
    );
  },
  // Le même, qui prend son temps : le chef a le temps d'agir avant la décision.
  "juge-ticket-lent"() {
    setTimeout(() => scenarios["juge-ticket"]?.(), 150);
  },
  "juge-epique"() {
    assistant();
    resultat(JSON.stringify({ nature: "epic", motif: "Trois livrables distincts.", manque: "La découper en tickets." }));
  },
  "juge-incomplet"() {
    assistant();
    resultat(JSON.stringify({ nature: "incomplete", motif: "Rien ne dit comment vérifier que c'est fait.", manque: "Un critère d'acceptation." }));
  },
  // Les découpages du manager : trois tickets qui se suivent, une question, une
  // épique déjà découpée, ou un découpage dont un ticket ne se lit pas.
  "decoupe-tickets"() {
    assistant();
    resultat(
      `Voici le découpage.\n\n${JSON.stringify({
        reponse: "tickets",
        motif: "Un livrable par module touché.",
        ordre: "Le rail d'abord : la pass et la doc lisent ce qu'il expose.",
        tickets: [
          { titre: "Le rail compte ses tickets", contexte: "Le compte n'existe nulle part.", criteres: ["`run rail` affiche le nombre de tickets en attente"], attend: [], zone: ["runtime/src/rail.ts"], modele: "sonnet", effort: "low", calibrage: "Un module, un test." },
          { titre: "La pass lit le compte", criteres: ["`run pass` affiche le compte", "Un test le couvre"], attend: [1], zone: ["runtime/src/pass.ts"], modele: "sonnet", effort: "medium", calibrage: "Critères précis." },
          { titre: "La doc dit le compte", contexte: "Doc vivante.", criteres: ["`docs/runtime.md` décrit le compte"], attend: [1, 2], zone: ["docs/runtime.md"], modele: "haiku", effort: "low", calibrage: "De la doc." },
        ],
      })}`,
    );
  },
  // Le même, qui prend son temps : le chef a le temps d'agir avant le découpage.
  "decoupe-tickets-lent"() {
    setTimeout(() => scenarios["decoupe-tickets"]?.(), 150);
  },
  // Deux tickets qui ne s'attendent pas possèdent le même fichier.
  "decoupe-recouvre"() {
    assistant();
    resultat(
      JSON.stringify({
        reponse: "tickets",
        motif: "Un livrable par écran.",
        ordre: "Indifférent.",
        tickets: [
          { titre: "Le rail compte", criteres: ["`run rail` affiche le compte"], attend: [], zone: ["runtime/src", "docs/runtime.md"], modele: "sonnet", effort: "low", calibrage: "Un module." },
          { titre: "Le rail trie", criteres: ["`run rail` trie"], attend: [], zone: ["runtime/src/rail.ts", "docs/runtime.md"], modele: "sonnet", effort: "low", calibrage: "Un module." },
          { titre: "La doc suit", criteres: ["La doc le dit"], attend: [], zone: ["docs/runtime.md"], modele: "haiku", effort: "low", calibrage: "De la doc." },
        ],
      }),
    );
  },
  "decoupe-question"() {
    assistant();
    resultat(JSON.stringify({ reponse: "question", question: "« Plus rapide » : sur quel écran, et mesuré comment ?" }));
  },
  "decoupe-deja"() {
    assistant();
    resultat(JSON.stringify({ reponse: "deja-decoupee", motif: "Son corps liste déjà #68 à #74." }));
  },
  "decoupe-illisible"() {
    assistant();
    resultat(JSON.stringify({ reponse: "tickets", motif: "Un livrable.", ordre: "Un seul.", tickets: [{ titre: "Sans critère", attend: [], zone: ["docs/"], modele: "haiku", effort: "low", calibrage: "Doc." }] }));
  },
  // Les réactions du manager à un ticket resté rouge : monter le calibrage, le
  // redécouper, ou le remonter au chef.
  "reagit-monte"() {
    assistant();
    resultat(`Je monte.\n\n${JSON.stringify({ choix: "monter", motif: "Le ticket est bien posé : le cook cale sur le raisonnement." })}`);
  },
  "reagit-redecoupe"() {
    assistant();
    resultat(JSON.stringify({ choix: "redecouper", motif: "Deux livrables dans un seul ticket." }));
  },
  "reagit-remonte"() {
    assistant();
    resultat(
      JSON.stringify({ choix: "remonter", motif: "Le critère d'acceptation n° 2 se contredit.", proposition: "Trancher le critère n° 2, puis rendre le ticket." }),
    );
  },
  "juge-illisible"() {
    assistant();
    resultat("Je dirais que c'est faisable.");
  },
  // Conclut sans rien commiter : son compte-rendu est son livrable.
  "rapporte-sans-commit"() {
    assistant();
    resultat("Audit : la CI passe douze minutes dans l'installation des dépendances, faute de cache.");
  },
  // Écrit un fichier, oublie de le commiter, et dit avoir fini.
  "ecrit-sans-commiter"() {
    writeFileSync("brouillon.txt", "le travail du cook, jamais commité\n");
    assistant();
    resultat("C'est fait : j'ai écrit `brouillon.txt`.");
  },
  // Les relectures du reviewer : un tour, et des constats — ou pas.
  "relit-vert"() {
    assistant();
    resultat(`Relu.\n\n${JSON.stringify({ verdict: "vert", resume: "Le diff fait ce que le ticket demande.", constats: [] })}`);
  },
  "relit-remarque"() {
    assistant();
    resultat(
      JSON.stringify({
        verdict: "vert",
        resume: "Le diff fait ce que le ticket demande.",
        constats: [{ gravite: "remarque", fichier: "travail.txt", constat: "Le fichier gagnerait un titre." }],
      }),
    );
  },
  "relit-rouge"() {
    assistant();
    resultat(
      JSON.stringify({
        verdict: "rouge",
        resume: "Le critère d'acceptation n° 2 n'est pas couvert.",
        constats: [
          { gravite: "bloquant", fichier: "travail.txt", constat: "Le cas d'erreur est avalé : rien ne remonte." },
          { gravite: "remarque", fichier: null, constat: "Un test de plus ne nuirait pas." },
        ],
      }),
    );
  },
  // Le même, qui prend son temps : le chef a le temps d'agir avant la relecture.
  "relit-vert-lent"() {
    setTimeout(() => scenarios["relit-vert"]?.(), 150);
  },
  "relit-illisible"() {
    assistant();
    resultat("Ça m'a l'air bien.");
  },
  // Vert, mais avec un constat bloquant : ni l'un ni l'autre.
  "relit-incoherent"() {
    assistant();
    resultat(JSON.stringify({ verdict: "vert", resume: "Tout va bien.", constats: [{ gravite: "bloquant", fichier: null, constat: "Sauf ceci." }] }));
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
