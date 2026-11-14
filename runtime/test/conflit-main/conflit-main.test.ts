// Un conflit avec la base revient au cook du ticket lui-même (#3476). Les
// tests de bout en bout passent par la station (`stationDuDepot`) sur le vrai
// dépôt d'un projet (`ouvrirDepot`, une origine nue et le clone de la
// station) : seuls GitHub, `gh` et `claude` sont faux. Le faux cook lit ce que
// son worktree porte, commite, et finit livré ou bloqué.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { test, type TestContext } from "node:test";
import { MARQUE_D_ATTENTE_DE_TICKET } from "../../src/attente-ticket/attente-ticket.ts";
import { MARQUE_DE_LA_CONSULTATION } from "../../src/blocage-au-manager.ts";
import { A_LA_MAIN, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { degelerLesConflits, partirSurLaBase, renvoisPourLaBase, suiteDuConflitBloque } from "../../src/conflit-main/conflit-main.ts";
import { carteDeGesteGit, cibleDuTravail, demandeUnGesteGit, fichiersNommes, MARQUE_DU_CONFLIT_MAIN, refusDeLaCreation } from "../../src/conflit-main/renvoi.ts";
import { ouvrirDepot } from "../../src/depot.ts";
import { reparationDuGeste } from "../../src/garde-todo/geste-git.ts";
import { marqueDeFix } from "../../src/github-seul/renvois/renvois.ts";
import { ouvrirGitHub, type GitHub } from "../../src/github.ts";
import { SUJET_DE_SAUVEGARDE } from "../../src/mise-a-jour/attente/attente.ts";
import { FauxGitHub, STATION_DU_DEPOT, fauxClient } from "../faux-github.ts";
import { BASE, commiter, DEPOT, depotGit, ENV_GIT, fauxGh, git, repertoireTemporaire } from "../outils.ts";

const CALIBRE = ["fire", "model:opus", "effort:medium"];
const FICHIER = "LISEZMOI";
// Les gestes qu'une carte du chef ne demande jamais (#3476).
const GESTES = /\bgit\b|merg|rebas|\bpush|resolv|conflict/i;

// Pose sur la base de l'origine un commit qui écrit `fichier`, sans que le
// clone de la station l'ait vu (comme mise-a-jour-branche.test.ts).
function avancerLOrigine(origine: string, fichier: string, contenu: string): string {
  const donnees = (texte: string) => `data ${Buffer.byteLength(texte)}\n${texte}\n`;
  const flux = [`commit refs/heads/${BASE}\n`, "mark :1\n", "committer cook <cook@brigade.test> now\n", donnees(`merge de ${fichier}`), `from refs/heads/${BASE}^0\n`, `M 100644 inline ${fichier}\n${donnees(contenu)}`, "get-mark :1\n"];
  return execFileSync("git", ["fast-import", "--quiet", "--force", "--date-format=now"], { cwd: origine, env: ENV_GIT, input: flux.join(""), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

// La branche d'un cook, dans le clone, qui écrit `FICHIER` autrement que la
// base, comme la laisse un cook arrêté bloqué : elle ne prendra pas sans conflit la base que `avancerLOrigine` avance.
function brancheDuCook(clone: string, ticket: number): void {
  const branche = `cook/${ticket}-github`;
  git(clone, "branch", branche, BASE);
  git(clone, "checkout", "-q", branche);
  writeFileSync(join(clone, FICHIER), "the ticket's readme\n");
  git(clone, "add", ".");
  // Le travail d'un cook arrêté bloqué : sauvé sur sa branche, sans PR.
  git(clone, "commit", "-q", "-m", SUJET_DE_SAUVEGARDE);
  git(clone, "checkout", "-q", BASE);
}

function brancheEnConflit({ origine, clone }: { origine: string; clone: string }, ticket: number): void {
  brancheDuCook(clone, ticket);
  avancerLOrigine(origine, FICHIER, "the base's own readme\n");
}

type Cook = (rang: number, worktree: string, consigne: string) => string;

// La station d'un projet sur un vrai dépôt. `cook` joue chaque cook de
// `ticket` ; `manager` rend l'avis du manager consulté sur un blocage.
function station(t: TestContext, { ticket, cook, manager, avant }: { ticket: number; cook: Cook; manager?: string; avant?: (depot: { origine: string; clone: string }, faux: FauxGitHub) => void }) {
  const lieux = depotGit(t);
  const faux = new FauxGitHub();
  faux.feu(ticket, CALIBRE, "## Context\n\nThe timer screen.");
  avant?.(lieux, faux);
  const worktrees = join(repertoireTemporaire(t), "worktrees");
  const depot = ouvrirDepot({ clone: lieux.clone, base: BASE, worktrees, env: ENV_GIT });
  let cooks = 0;
  const consultations: string[] = [];
  const lancer: Lancer = ({ args, cwd, flux }) => {
    const consulte = args.some((arg) => arg.startsWith(MARQUE_DE_LA_CONSULTATION));
    let message = manager ?? JSON.stringify({ issue: "geste", geste: "merge the branch" });
    if (consulte) consultations.push(args.join("\n"));
    else if (!args.includes("--tools")) message = basename(cwd) === `${ticket}-github` ? cook(++cooks, cwd, args.join("\n")) : "Done.\n<livrable>\nNothing.\n</livrable>";
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const avertissements: string[] = [];
  const github: GitHub = { ...fauxClient(faux), creerIssue: faux.pour("box").creerIssue };
  const ouverte = stationDuDepot({
    ...STATION_DU_DEPOT,
    base: BASE,
    github,
    depot,
    manager: () => ({ model: "opus", effort: "high" }),
    flux: repertoireTemporaire(t),
    lancer,
    avertir: (texte) => void avertissements.push(texte),
  });
  if ("refus" in ouverte) throw new Error(ouverte.refus);
  const tour = async () => {
    await ouverte.tour();
    await ouverte.calme();
  };
  const commentaires = (numero = ticket) => (faux.commentaires.get(numero) ?? []).map((c) => c.body);
  return { ...lieux, faux, tour, cooks: () => cooks, consultations, avertissements, commentaires };
}

// Les cartes du chef qu'une station a posées sur l'issue.
const cartes = (commentaires: string[]) => commentaires.filter((c) => /^\*\*(?:Gesture|Question) for the chef\b/.test(c.trimStart()));

test("a branch that conflicts with the base goes back to its own cook with the conflicting files listed, and no new ticket is created", async (t) => {
  const TICKET = 18;
  const BESOIN = `I need the commits merged on \`origin/${BASE}\` but not on my branch: \`git merge origin/${BASE}\` was denied by the sandbox.`;
  const vus: Array<{ marqueurs: boolean; consigne: string }> = [];
  let origine = "";
  const s = station(t, {
    ticket: TICKET,
    avant: (lieux) => {
      origine = lieux.origine;
      brancheDuCook(lieux.clone, TICKET);
    },
    cook: (rang, worktree, consigne) => {
      if (rang === 1) {
        // Le premier cook ne voit pas le conflit : la base bouge pendant qu'il cuisine.
        avancerLOrigine(origine, FICHIER, "the base's own readme\n");
        return `I stopped.\n<livrable>\n<bloque>${BESOIN}</bloque>\n</livrable>`;
      }
      vus.push({ marqueurs: readFileSync(join(worktree, FICHIER), "utf8").includes("<<<<<<<"), consigne });
      writeFileSync(join(worktree, FICHIER), "the ticket's readme, on top of the base's own\n");
      git(worktree, "add", FICHIER);
      git(worktree, "commit", "-q", "--no-edit");
      return "Done.\n<livrable>\nThe conflict is resolved.\n</livrable>";
    },
  });
  await s.tour();
  assert.equal(s.cooks(), 1);
  assert.equal(s.faux.creations.length, 0, "no new ticket");
  const renvoi = s.commentaires().find((c) => c.startsWith(MARQUE_DU_CONFLIT_MAIN));
  assert.ok(renvoi !== undefined, s.commentaires().join("\n---\n"));
  assert.match(renvoi, new RegExp(`conflicts in \`${FICHIER}\``));
  assert.match(renvoi, /goes back to its own cook/);
  assert.equal(s.faux.ticket(TICKET).labels.has(A_LA_MAIN), false);
  assert.deepEqual(cartes(s.commentaires()), [], "no chef card");

  await s.tour();
  assert.equal(s.cooks(), 2, "the ticket's own cook resumes it");
  assert.equal(vus.length, 1);
  assert.equal(vus[0]?.marqueurs, true, "the cook finds the conflict markers in its branch");
  assert.match(vus[0]?.consigne ?? "", new RegExp(`- \`${FICHIER}\``), "its brief lists the conflicting files");
  assert.equal(s.faux.creations.length, 0, "still no new ticket");
  assert.ok(s.faux.ticket(TICKET).labels.has("in-pass"), [...s.faux.ticket(TICKET).labels].join(", "));
  git(s.clone, "merge-base", "--is-ancestor", `origin/${BASE}`, `cook/${TICKET}-github`);
});

test("the kitchen never opens a ticket whose work is to change another ticket's branch: GitHub's client refuses it before any call", async (t) => {
  const gh = fauxGh(t);
  const github = ouvrirGitHub({ depot: DEPOT, bin: gh.bin });
  // Le `fix` que la station ouvrait avant #3476, et le geste git d'une carte.
  const ancienFix = { titre: "The kitchen could not bring `cook/18-github` up to date with `origin/main` for #18", corps: `${marqueDeFix(18)}\n\nThe merge stopped on conflicts in \`MainActivity.kt\`.`, labels: ["fire", "fix"] };
  await assert.rejects(github.creerIssue(ancienFix), /change the branch of #18/);
  const geste = reparationDuGeste("merge", { enonce: "Merge origin/main into cook/18-github and resolve the conflicts." }, 18);
  await assert.rejects(github.creerIssue(geste), /change the branch of #18/);
  assert.deepEqual(gh.appels(), [], "nothing reaches GitHub");
  // Un ticket qui raconte l'incident sans avoir pour travail de toucher la branche s'ouvre.
  assert.equal(refusDeLaCreation({ titre: "A conflict with main goes back to the ticket's own cook", corps: "The station could not merge origin/main into cook/18-github." }), null);
  assert.equal(cibleDuTravail({ numero: 18, titre: "Bring `cook/18-github` up to date", corps: "" }), null, "a ticket's own branch is its own work");
  assert.equal(refusDeLaCreation({ titre: "Do the git gesture of #18 (merge) — no decision is asked of the chef", corps: "merge PR #20" }), null);
});

test("on the conflict path, a cook blocked on a git gesture goes back to its own cook: no chef card asks to merge, rebase, resolve or push", async (t) => {
  const TICKET = 18;
  const s = station(t, {
    ticket: TICKET,
    avant: (lieux) => brancheEnConflit(lieux, TICKET),
    cook: () => `I stopped.\n<livrable>\n<bloque>Please run \`git merge origin/${BASE}\` on \`cook/${TICKET}-github\`, resolve the conflicts in ${FICHIER} and push: I cannot.</bloque>\n</livrable>`,
  });
  await s.tour();
  assert.equal(s.cooks(), 1);
  assert.deepEqual(s.consultations, [], "a git gesture never reaches the manager, who could put a card");
  assert.equal(s.faux.ticket(TICKET).labels.has(A_LA_MAIN), false, "never blocked-on-human");
  assert.deepEqual(cartes(s.commentaires()), [], "no chef card");
  const renvoi = s.commentaires().find((c) => c.startsWith(MARQUE_DU_CONFLIT_MAIN));
  assert.ok(renvoi?.includes(`\`${FICHIER}\``), s.commentaires().join("\n---\n"));
  assert.equal(s.faux.creations.length, 0);
  // Rien des marqueurs n'est récolté sur la branche du cook arrêté.
  assert.doesNotMatch(git(s.clone, "show", `cook/${TICKET}-github:${FICHIER}`), /<<<<<<<|>>>>>>>/);
});

test("on the conflict path, the manager's gesture is never a chef card either: the ticket goes back to its own cook", async (t) => {
  const TICKET = 18;
  const s = station(t, {
    ticket: TICKET,
    manager: JSON.stringify({ issue: "geste", geste: "rebase the branch on main and push it", question_en: "I cannot go on." }),
    avant: (lieux) => brancheEnConflit(lieux, TICKET),
    cook: () => "I stopped.\n<livrable>\n<bloque>I cannot go on.</bloque>\n</livrable>",
  });
  await s.tour();
  assert.equal(s.consultations.length, 1);
  assert.equal(s.faux.ticket(TICKET).labels.has(A_LA_MAIN), false);
  assert.deepEqual(cartes(s.commentaires()), []);
  assert.ok(s.commentaires().some((c) => c.startsWith(MARQUE_DU_CONFLIT_MAIN)), s.commentaires().join("\n---\n"));
});

test("when the conflict hides a product choice, the chef's card asks that choice in product terms, never a git gesture", async (t) => {
  const TICKET = 18;
  const choix = "Which name should the timer screen show: “Seconds”, as main has it, or “Timer”, as this ticket has it?";
  const s = station(t, {
    ticket: TICKET,
    manager: JSON.stringify({ issue: "produit", question: choix, question_en: "Main names the screen Seconds and my work names it Timer: which one?" }),
    avant: (lieux) => brancheEnConflit(lieux, TICKET),
    cook: () => "I stopped.\n<livrable>\n<bloque>The base names the screen “Seconds” and my work names it “Timer”: which one does the product keep?</bloque>\n</livrable>",
  });
  await s.tour();
  assert.equal(s.consultations.length, 1);
  assert.ok(s.faux.ticket(TICKET).labels.has(A_LA_MAIN), "the ticket waits for the chef's choice");
  const [carte, ...autres] = cartes(s.commentaires());
  assert.deepEqual(autres, []);
  assert.ok(carte?.startsWith(`**Question for the chef (product):** ${choix}`), carte ?? "no card");
  assert.match(carte ?? "", new RegExp(`\`${FICHIER}\``));
  assert.doesNotMatch(carte ?? "", GESTES);
});

test("a cook blocked off the conflict path, whose question the manager reads as a git gesture, gets no chef card: back to its own cook", async (t) => {
  const TICKET = 7;
  const s = station(t, {
    ticket: TICKET,
    manager: JSON.stringify({ issue: "geste", geste: "merge PR #12 into the branch", question_en: "I am stuck." }),
    cook: () => "I stopped.\n<livrable>\n<bloque>I am stuck.</bloque>\n</livrable>",
  });
  await s.tour();
  assert.equal(s.consultations.length, 1);
  assert.equal(s.faux.ticket(TICKET).labels.has(A_LA_MAIN), false);
  assert.deepEqual(cartes(s.commentaires()), []);
  assert.ok(s.commentaires().some((c) => c.startsWith(MARQUE_DU_CONFLIT_MAIN)), s.commentaires().join("\n---\n"));
});

test("the secondes #18/#28 state moves again in one station cycle: the fix ticket is gone, the chef card withdrawn, #18 back with its cook and the conflict to resolve", async (t) => {
  const PROPRIETAIRE = 18;
  const FIX = 28;
  const vus: boolean[] = [];
  const s = station(t, {
    ticket: PROPRIETAIRE,
    avant: (lieux, faux) => {
      brancheEnConflit(lieux, PROPRIETAIRE);
      faux.poster(PROPRIETAIRE, "box", `${MARQUE_D_ATTENTE_DE_TICKET} #${FIX} -->\nStation \`box\`: the station could not merge \`origin/${BASE}\` into \`cook/${PROPRIETAIRE}-github\` and opened the \`fix\` ticket #${FIX}.`);
      faux.feu(FIX, ["fire", "fix", "prio:1", "model:sonnet", "effort:medium", A_LA_MAIN], `${marqueDeFix(PROPRIETAIRE)}\n\n## Context\n\nThe kitchen fetched and tried to merge \`origin/${BASE}\` into the branch itself, and could not: the merge stopped on conflicts in \`${FICHIER}\`.`);
      faux.ticket(FIX).title = `The kitchen could not bring \`cook/${PROPRIETAIRE}-github\` up to date with \`origin/${BASE}\` for #${PROPRIETAIRE}`;
      faux.poster(FIX, "box", `**Gesture for the chef:** run \`git merge origin/${BASE}\` in \`cook/${PROPRIETAIRE}-github\`, resolve the conflicts in \`${FICHIER}\`, then \`git push\`.\n\nStation \`box\`: the cook stopped, blocked.`);
    },
    cook: (_rang, worktree, consigne) => {
      vus.push(readFileSync(join(worktree, FICHIER), "utf8").includes("<<<<<<<") && consigne.includes(`\`${FICHIER}\``));
      return "I stopped.\n<livrable>\n<bloque>Please merge it for me.</bloque>\n</livrable>";
    },
  });
  await s.tour();
  assert.equal(s.faux.ticket(FIX).state, "closed", "the fix ticket is gone");
  assert.equal(s.faux.ticket(FIX).labels.has(A_LA_MAIN), false, "its chef card is withdrawn");
  assert.ok(s.commentaires(FIX).some((c) => c.includes(`folded into #${PROPRIETAIRE}'s send-back`)), s.commentaires(FIX).join("\n---\n"));
  const renvoi = s.commentaires(PROPRIETAIRE).find((c) => c.startsWith(MARQUE_DU_CONFLIT_MAIN));
  assert.ok(renvoi?.includes(`conflicts in \`${FICHIER}\``), s.commentaires(PROPRIETAIRE).join("\n---\n"));
  assert.deepEqual(vus, [true], "#18's own cook took it in the same cycle, with the conflict markers and their files");
  assert.equal(s.faux.creations.length, 0);
  assert.equal(s.faux.ticket(PROPRIETAIRE).labels.has(A_LA_MAIN), false);
});

test("a chef card asking for git commands on the ticket's own branch is withdrawn, and the ticket goes back to its own cook", async (t) => {
  const TICKET = 18;
  let cooks = 0;
  const s = station(t, {
    ticket: TICKET,
    avant: (_lieux, faux) => {
      faux.ticket(TICKET).labels.add(A_LA_MAIN);
      faux.poster(TICKET, "box", `**Gesture for the chef:** rebase \`cook/${TICKET}-github\` on \`origin/${BASE}\` and push it.`);
    },
    cook: (_rang, worktree) => {
      cooks += 1;
      commiter(worktree, "livraison.txt");
      return "Done.\n<livrable>\nDelivered.\n</livrable>";
    },
  });
  await s.tour();
  assert.equal(s.faux.ticket(TICKET).labels.has(A_LA_MAIN), false, "the card is withdrawn");
  assert.ok(s.commentaires().some((c) => c.includes("The card is withdrawn")), s.commentaires().join("\n---\n"));
  assert.ok(s.commentaires().some((c) => c.startsWith(MARQUE_DU_CONFLIT_MAIN)));
  assert.equal(cooks, 1, "its own cook takes it in the same cycle");
});

test("a chef card asking a product question stays with the chef", async (t) => {
  const TICKET = 18;
  let cooks = 0;
  const s = station(t, {
    ticket: TICKET,
    avant: (_lieux, faux) => {
      faux.ticket(TICKET).labels.add(A_LA_MAIN);
      faux.poster(TICKET, "box", "**Question for the chef (product):** Which name should the screen show?");
    },
    cook: () => {
      cooks += 1;
      return "Done.";
    },
  });
  await s.tour();
  assert.ok(s.faux.ticket(TICKET).labels.has(A_LA_MAIN));
  assert.equal(s.commentaires().length, 1);
  assert.equal(cooks, 0);
});

test("a chef card asking a product question about push notifications stays with the chef, its ticket not sent back", async (t) => {
  const TICKET = 18;
  let cooks = 0;
  const s = station(t, {
    ticket: TICKET,
    avant: (_lieux, faux) => {
      faux.ticket(TICKET).labels.add(A_LA_MAIN);
      faux.poster(TICKET, "box", "**Question for the chef (product):** should we enable push notifications, and should we merge the two settings screens?");
    },
    cook: () => {
      cooks += 1;
      return "Done.";
    },
  });
  await s.tour();
  assert.ok(s.faux.ticket(TICKET).labels.has(A_LA_MAIN), "the card stays with the chef");
  assert.equal(s.commentaires().length, 1, s.commentaires().join("\n---\n"));
  assert.equal(cooks, 0);
});

test("on the conflict path, a product question about push notifications reaches the manager and the chef, never sent back as a git gesture", async () => {
  const faux = new FauxGitHub();
  faux.feu(18);
  const github = faux.pour("box");
  const question = "Should we enable push notifications when the timer ends?";
  const consultees: string[] = [];
  const suite = await suiteDuConflitBloque(github, {
    station: "box",
    ticket: 18,
    base: "main",
    branche: "cook/18-github",
    fichiers: [FICHIER],
    question,
    consulter: async (lue) => {
      consultees.push(lue);
      return { avis: { issue: "produit", question } };
    },
  });
  assert.deepEqual(consultees, [question], "the manager reads it");
  assert.ok("suite" in suite && suite.suite === "retenue", JSON.stringify(suite));
  assert.ok(faux.ticket(18).labels.has(A_LA_MAIN));
  assert.ok((faux.commentaires.get(18) ?? []).some((c) => c.body.startsWith(`**Question for the chef (product):** ${question}`)), JSON.stringify(faux.commentaires.get(18)));
});

test("send-backs to the ticket's own cook that cannot be read stop the ticket as a cook without delivery, never a loop", async () => {
  const faux = new FauxGitHub();
  faux.feu(18);
  const github = { ...faux.pour("box"), commentaires: async () => Promise.reject(new Error("HTTP 502")) };
  const lu = await renvoisPourLaBase(github, 18);
  assert.ok(typeof lu !== "number" && /HTTP 502/.test(lu.echec), JSON.stringify(lu));
  const suite = await suiteDuConflitBloque(github, { station: "box", ticket: 18, base: "main", branche: "cook/18-github", fichiers: [FICHIER], question: "Run git merge for me." });
  assert.ok("echec" in suite && /HTTP 502/.test(suite.echec), JSON.stringify(suite));
  assert.deepEqual(faux.commentaires.get(18) ?? [], [], "nothing is posted");
});

test("a cook blocked off the conflict path on a git gesture counts its send-backs like the conflict path: past the tries, no new send-back", async (t) => {
  const TICKET = 7;
  const s = station(t, {
    ticket: TICKET,
    manager: JSON.stringify({ issue: "geste", geste: "merge PR #12 into the branch", question_en: "I am stuck." }),
    avant: (_lieux, faux) => {
      for (let n = 0; n < 3; n++) faux.poster(TICKET, "box", `${MARQUE_DU_CONFLIT_MAIN} origin/${BASE}:  -->`);
    },
    cook: () => "I stopped.\n<livrable>\n<bloque>I am stuck.</bloque>\n</livrable>",
  });
  await s.tour();
  assert.equal(s.commentaires().filter((c) => c.startsWith(MARQUE_DU_CONFLIT_MAIN)).length, 3, s.commentaires().join("\n---\n"));
  assert.deepEqual(cartes(s.commentaires()), []);
});

test("a sandbox refusal is not worded as a git gesture, a failed git operation is", () => {
  const refus = "The build stopped on cook/21-github: java.net.SocketException: Operation not permitted, the sandbox refuses a local port; resolve it in MainActivity.kt";
  assert.equal(demandeUnGesteGit(refus), false);
  assert.equal(carteDeGesteGit(`**Gesture for the chef:** ${refus}`), false);
  assert.equal(carteDeGesteGit("**Question for the chef (product):** `git merge origin/main` got Operation not permitted in the sandbox"), false);
  const echec = "fatal: Operation not permitted — git merge origin/main failed, resolve the conflict in MainActivity.kt";
  assert.equal(demandeUnGesteGit(echec), true);
  assert.equal(carteDeGesteGit(`**Gesture for the chef:** ${echec}`), true);
  assert.equal(demandeUnGesteGit("merge PR #12 into the branch"), true);
});

test("what reads a git gesture, a ticket's target and the files a text names", () => {
  assert.equal(demandeUnGesteGit("Should we enable push notifications?"), false, "a product question");
  assert.equal(demandeUnGesteGit("Should we merge the two screens into one?"), false, "a product question");
  assert.equal(demandeUnGesteGit("Do we fetch the weather every hour?"), false, "a product question");
  assert.equal(demandeUnGesteGit("merge PR #12 into the branch"), true);
  assert.equal(carteDeGesteGit("**Question for the chef (product):** should we enable push notifications?"), false);
  assert.equal(carteDeGesteGit("**Gesture for the chef:** enable push notifications in the store console"), false);
  assert.equal(carteDeGesteGit("**Gesture for the chef:** rebase the branch on main and push it"), true);
  assert.equal(carteDeGesteGit("**Question for the chef (product):** run `git merge origin/main`?"), true);
  assert.equal(carteDeGesteGit("**Question for the chef (product):** which screen does `cook/18-github` keep?"), true);
  assert.equal(cibleDuTravail({ numero: 40, titre: "Wrong naming of `cook/12-github` in the logs", corps: "" }), null, "a title that only cites a branch");
  assert.equal(refusDeLaCreation({ titre: "Wrong naming of `cook/12-github` in the logs", corps: "" }), null);
  assert.equal(cibleDuTravail({ numero: 40, titre: "Resolve the conflict of `cook/12-github` with main", corps: "" }), 12);
  assert.equal(demandeUnGesteGit("Run git merge origin/main"), true);
  assert.equal(demandeUnGesteGit("Please resolve the conflicts in strings.xml"), true);
  assert.equal(demandeUnGesteGit("Rebase the branch"), true);
  assert.equal(demandeUnGesteGit("Which title should the screen show?"), false);
  assert.deepEqual(fichiersNommes("the merge stopped on conflicts in `MainActivity.kt`, `res/values/strings.xml`. The attempt"), ["MainActivity.kt", "res/values/strings.xml"]);
  assert.deepEqual(fichiersNommes("nothing named"), []);
});

test("a second merge attempt that no longer stops on a conflict is undone, and the cook starts from its branch as is", async () => {
  const appels: string[] = [];
  let fetchs = 0;
  const lancer = async (args: string[]) => {
    appels.push(args.join(" "));
    if (args[0] === "fetch") return ++fetchs === 1 ? { code: 0, stdout: "", stderr: "" } : { code: 128, stdout: "", stderr: "fatal: unable to access" };
    if (args[0] === "merge-base") return { code: 1, stdout: "", stderr: "" };
    if (args[0] === "merge" && args[1] === "--no-edit") return { code: 1, stdout: "", stderr: "CONFLICT (content)" };
    if (args[0] === "diff") return { code: 0, stdout: `${FICHIER}\n`, stderr: "" };
    return { code: 0, stdout: "", stderr: "" };
  };
  assert.deepEqual(await partirSurLaBase(lancer, "/nulle-part", "main"), { etat: "echec", etape: "merge", detail: "CONFLICT (content)", fichiers: [FICHIER] });
  assert.ok(!appels.includes("merge --no-commit --no-ff FETCH_HEAD"), appels.join("\n"));
});

test("a manager that cannot be read on the conflict path sends the ticket back to its own cook, never to the chef", async () => {
  const faux = new FauxGitHub();
  faux.feu(18);
  const github = faux.pour("box");
  const suite = await suiteDuConflitBloque(github, {
    station: "box",
    ticket: 18,
    base: "main",
    branche: "cook/18-github",
    fichiers: [FICHIER],
    question: "I am not sure what to keep.",
    consulter: async () => {
      throw new Error("the manager timed out");
    },
  });
  assert.ok("suite" in suite && suite.suite === "liberee", JSON.stringify(suite));
  assert.match(suite.dit, /the manager timed out/);
  assert.equal(faux.ticket(18).labels.has(A_LA_MAIN), false);
  // Au-delà des essais, le cook compte pour un cook sans livraison.
  for (let n = 0; n < 3; n++) faux.poster(18, "box", `${MARQUE_DU_CONFLIT_MAIN} origin/main: ${FICHIER} -->`);
  const usee = await suiteDuConflitBloque(github, { station: "box", ticket: 18, base: "main", branche: "cook/18-github", fichiers: [FICHIER], question: "Run git merge for me." });
  assert.ok("echec" in usee, JSON.stringify(usee));
});

test("a thaw GitHub refuses is said and retried next round, and does not hold the other tickets", async () => {
  const faux = new FauxGitHub();
  faux.feu(18);
  faux.feu(28, ["fire", "fix"], `the merge stopped on conflicts in \`${FICHIER}\``);
  faux.ticket(28).title = "The kitchen could not bring `cook/18-github` up to date with `origin/main` for #18";
  faux.feu(30, ["fire", "fix"], "");
  faux.ticket(30).title = "The kitchen could not bring `cook/7-github` up to date with `origin/main` for #7";
  const github = faux.pour("box");
  const avertissements: string[] = [];
  const tickets = [...faux.tickets.values()].map((t) => ({ number: t.number, title: t.title, labels: [...t.labels], state: t.state }));
  const { fermes } = await degelerLesConflits(
    {
      ...github,
      commenter: async (numero, corps) => {
        if (numero === 28) throw new Error("HTTP 502");
        return github.commenter(numero, corps);
      },
    },
    { station: "box", base: "main", tickets, enVol: new Set(), examinees: new Set(), avertir: (texte) => void avertissements.push(texte) },
  );
  assert.equal(faux.ticket(28).state, "open", "retried next round");
  assert.ok(avertissements.some((a) => a.includes("#28") && a.includes("HTTP 502")), avertissements.join("\n"));
  assert.deepEqual([...fermes], [30], "the other ticket is closed all the same");
});
