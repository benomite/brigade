// Ce que l'app sait de la saisie du second : ses tours, dits par ses crochets ;
// son titre ; ce que le chef y a tapé ; et la preuve du mode shell. Les signes
// sont ceux du vrai `claude` (2.1.296), relevés dans un pty le 2026-10-13 — ce
// fichier les rejoue, il ne lance aucun `claude`.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { SAYS, openTurns, PROOF, settingsFile, followInput } from "../src/input.ts";

// Les titres que `claude` donne à son terminal : au repos, et au travail (deux images d'une même roue).
const REPOS = "\x1b]0;✳ Claude Code\x07";
const WORK = ["\x1b]0;◐ Claude Code\x07", "\x1b]0;◑ Claude Code\x07"];

// Une saisie suivie, et ce que le second a dit de ses tours.
function tracked(saidOnes = "") {
  const turns = { dits: saidOnes };
  return { tours: turns, saisie: followInput(() => turns.dits) };
}

// Un second à son invite, saisie vide : un tour fini, le titre du repos.
function free() {
  const { tours: turns, saisie: input } = tracked("tour\nfin\n");
  input.sortie(REPOS);
  assert.deepEqual(input.etat(), { libre: true });
  return { tours: turns, saisie: input };
}

describe("les tours du second, dits par ses crochets", () => {
  function folder(t: TestContext, name: string): string {
    const root = mkdtempSync(join(tmpdir(), name));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    return root;
  }

  test("les réglages donnés à `claude` posent trois crochets : un tour commence à `UserPromptSubmit` ou `PreToolUse`, finit à `Stop`", () => {
    const { hooks } = JSON.parse(settingsFile("/tmp/essai/second-1.tours")) as { hooks: Record<string, { hooks: { type: string; command: string }[] }[]> };

    assert.deepEqual(hooks, {
      UserPromptSubmit: [{ hooks: [{ type: "command", command: "printf 'tour\\n' >> '/tmp/essai/second-1.tours'" }] }],
      PreToolUse: [{ hooks: [{ type: "command", command: "printf 'tour\\n' >> '/tmp/essai/second-1.tours'" }] }],
      Stop: [{ hooks: [{ type: "command", command: "printf 'fin\\n' >> '/tmp/essai/second-1.tours'" }] }],
    });
  });

  test("sous Windows, le chemin des tours part avec des barres obliques : `claude` y joue ses crochets par le `bash` de Git", () => {
    const { hooks } = JSON.parse(settingsFile("C:\\Users\\chef\\AppData\\Local\\Temp\\brigade-app-x\\second-1.tours", "\\")) as { hooks: Record<string, { hooks: { command: string }[] }[]> };
    assert.equal(hooks.Stop?.[0]?.hooks[0]?.command, "printf 'fin\\n' >> 'C:/Users/chef/AppData/Local/Temp/brigade-app-x/second-1.tours'");
  });

  test("joués par un vrai `sh`, les crochets écrivent ce que l'app relit — dans un dossier dont le nom porte une espace et une apostrophe, sans rien sur leur sortie", (t) => {
    const turns = openTurns(folder(t, "brigade l'app "));
    t.after(turns.fermer);
    const file = turns.de(7);
    const { hooks } = JSON.parse(settingsFile(file.chemin)) as { hooks: Record<string, { hooks: { command: string }[] }[]> };
    const play = (hook: string) => execFileSync("sh", ["-c", hooks[hook]?.[0]?.hooks[0]?.command ?? assert.fail(hook)], { encoding: "utf8" });
    const { saisie: input } = { saisie: followInput(file.lire) };
    input.sortie(REPOS);

    // Rien n'est encore écrit : le fichier n'existe pas, et ce n'est pas « libre ».
    assert.equal(file.lire(), "");
    assert.deepEqual(input.etat(), { libre: false, dit: SAYS.demarre });

    // `claude` lirait la sortie d'un crochet : celle de `UserPromptSubmit` entrerait dans le contexte du second.
    assert.deepEqual(["UserPromptSubmit", "PreToolUse"].map(play), ["", ""]);
    assert.equal(file.lire(), "tour\ntour\n");
    assert.deepEqual(input.etat(), { libre: false, dit: SAYS.attend });

    assert.equal(play("Stop"), "");
    assert.equal(file.lire(), "tour\ntour\nfin\n");
    assert.deepEqual(input.etat(), { libre: true });

    // Relancé, le second repart d'un fichier vide : les tours d'avant ne valent plus.
    file.vider();
    assert.deepEqual(input.etat(), { libre: false, dit: SAYS.demarre });
  });

  test("chaque second a son fichier, et l'app retire le dossier en fermant", (t) => {
    const root = folder(t, "brigade-tours-");
    const turns = openTurns(root);

    const [oneOf, two] = [turns.de(1), turns.de(2)];
    assert.notEqual(oneOf.chemin, two.chemin);
    assert.ok(oneOf.chemin.startsWith(root));
    oneOf.vider();
    assert.ok(existsSync(oneOf.chemin));

    turns.fermer();
    assert.ok(!existsSync(oneOf.chemin));
    assert.equal(oneOf.lire(), "");
  });
});

describe("le second est dit libre quand ses tours, son titre et sa saisie s'accordent", () => {
  test("aucun tour fini depuis son lancement : il démarre — même si son titre est déjà celui du repos", () => {
    const { tours: turns, saisie: input } = tracked();
    input.sortie(REPOS);
    assert.deepEqual(input.etat(), { libre: false, dit: SAYS.demarre });

    // Des crochets qui écriraient autre chose ne disent rien non plus.
    turns.dits = "n'importe quoi\n";
    assert.deepEqual(input.etat(), { libre: false, dit: SAYS.demarre });
  });

  test("un tour en cours, le titre au travail : il est occupé", () => {
    const { saisie: input } = tracked("tour\nfin\ntour\n");
    for (const image of WORK) {
      input.sortie(image);
      assert.deepEqual(input.etat(), { libre: false, dit: SAYS.occupe });
    }
  });

  test("le titre au travail sans tour annoncé — une commande `!`, un tour qu'il lance de lui-même : occupé aussi", () => {
    const { saisie: input } = free();
    input.sortie(WORK[0] ?? "");
    assert.deepEqual(input.etat(), { libre: false, dit: SAYS.occupe });
    input.sortie(REPOS);
    assert.deepEqual(input.etat(), { libre: true });
  });

  test("un tour en cours, le titre au repos : il attend une réponse du chef — c'est ce que `claude` montre devant un dialogue de permission", () => {
    const { tours: turns, saisie: input } = free();
    turns.dits += "tour\ntour\n";
    assert.deepEqual(input.etat(), { libre: false, dit: SAYS.attend });

    // Le dialogue validé, le tour reprend, puis finit.
    input.sortie(WORK[1] ?? "");
    assert.deepEqual(input.etat(), { libre: false, dit: SAYS.occupe });
    turns.dits += "fin\n";
    input.sortie(REPOS);
    // Le chef a validé d'une Entrée : rien n'est resté dans sa saisie.
    input.frappe("\r");
    assert.deepEqual(input.etat(), { libre: true });
  });

  test("aucun titre, ou un titre que l'app ne connaît pas : elle ne sait pas, et le dit avec ce titre", () => {
    const { saisie: input } = tracked("tour\nfin\n");
    assert.deepEqual(input.etat(), { libre: false, dit: SAYS.sansTitre });

    input.sortie("\x1b]0;claude — brigade\x07");
    assert.deepEqual(input.etat(), { libre: false, dit: SAYS.titre("claude — brigade") });
    assert.match(SAYS.titre("claude — brigade"), /“claude — brigade”/);
  });

  test("le titre se lit dans la sortie telle que le pty la coupe, fermé par BEL ou par ST — et rien d'autre n'en est un", () => {
    const { saisie: input } = tracked("tour\nfin\n");

    // Coupé en plein milieu, à chaque endroit possible.
    const title = "\x1b]0;◐ Comptage de 1 à 600\x07";
    for (let cut = 1; cut < title.length; cut++) {
      input.sortie(`du texte${REPOS}`);
      assert.deepEqual(input.etat(), { libre: true }, `avant la coupe ${cut}`);
      input.sortie(`encore${title.slice(0, cut)}`);
      assert.deepEqual(input.etat(), { libre: true }, `titre ouvert, coupe ${cut}`);
      input.sortie(`${title.slice(cut)}la suite`);
      assert.deepEqual(input.etat(), { libre: false, dit: SAYS.occupe }, `titre fermé, coupe ${cut}`);
    }

    // `OSC 2`, fermé par ST, coupé dans le ST.
    input.sortie("\x1b]2;✳ Brouillon horodaté\x1b");
    assert.deepEqual(input.etat(), { libre: false, dit: SAYS.occupe });
    input.sortie("\\");
    assert.deepEqual(input.etat(), { libre: true });

    // Une autre séquence OSC — un lien, une couleur — n'est pas un titre ; ni un « ◐ » dans le texte.
    input.sortie("\x1b]8;;https://exemple.test\x07◐ lien\x1b]8;;\x07\x1b]11;rgb:0000/0000/0000\x07 ◐ au travail");
    assert.deepEqual(input.etat(), { libre: true });
  });
});

describe("la saisie du second n'est dite vide qu'après l'Entrée du chef", () => {
  test("une touche qui n'est pas Entrée entame la saisie : une lettre, une flèche, Échap, un collage — même s'il finit par un retour", () => {
    for (const key of ["a", "é", "\x1b[A", "\x1b", "\x7f", "\x03", "\t", "\x1b[200~du texte\r\x1b[201~", "abc\r", "/"]) {
      const { saisie: input } = free();
      input.frappe(key);
      assert.deepEqual(input.etat(), { libre: false, dit: SAYS.frappe }, JSON.stringify(key));
    }
  });

  test("une Entrée seule la dit vide : elle a envoyé la frappe, ou n'a rien fait d'une saisie vide", () => {
    const { saisie: input } = free();
    for (const key of ["l", "s", "\r"]) input.frappe(key);
    assert.deepEqual(input.etat(), { libre: true });
  });

  test("ce que le terminal de la vue répond de lui-même à `claude` n'est pas une frappe : focus, curseur, couleurs, ce qu'il est", () => {
    const answers = ["\x1b[I", "\x1b[O", "\x1b[24;80R", "\x1b[?1;2c", "\x1b[>0;276;0c", "\x1b[0n", "\x1b[?2026;2$y", "\x1b[?0u", "\x1b[8;24;80t", "\x1b]11;rgb:1212/1414/1818\x07", "\x1b]10;rgb:ffff/ffff/ffff\x1b\\", "\x1bP>|xterm.js(6.0.0)\x1b\\", "\x1b[I\x1b[24;80R"];
    for (const answer of answers) {
      const { saisie: input } = free();
      input.frappe(answer);
      assert.deepEqual(input.etat(), { libre: true }, JSON.stringify(answer));
    }
    // Mais une réponse suivie d'une touche en est une.
    const { saisie: input } = free();
    input.frappe("\x1b[Ia");
    assert.deepEqual(input.etat(), { libre: false, dit: SAYS.frappe });
  });

  test("un texte que l'app y écrit sans l'envoyer l'entame aussi, et le refus le dit — jusqu'à l'Entrée du chef", () => {
    const { saisie: input } = free();
    input.entamer();
    assert.deepEqual(input.etat(), { libre: false, dit: SAYS.ecrit });
    input.frappe("\r");
    assert.deepEqual(input.etat(), { libre: true });
  });
});

describe("l'Entrée de l'app attend la preuve du mode shell", () => {
  test("`claude` se montre en mode shell : la preuve est rendue une fois, où que le pty coupe sa sortie", () => {
    for (let cut = 0; cut <= PROOF.length; cut++) {
      const { saisie: input } = free();
      const issues: boolean[] = [];
      input.ecrit((proof) => void issues.push(proof));

      // Tant qu'elle n'est pas venue, une commande est en route.
      assert.deepEqual(input.etat(), { libre: false, dit: SAYS.route });
      input.sortie(`\x1b[2C\x1b[1B${PROOF.slice(0, cut)}`);
      input.sortie(`${PROOF.slice(cut)}\x1b[39m\x1b[K`);
      input.sortie(PROOF);

      assert.deepEqual(issues, [true], `coupe ${cut}`);
    }
  });

  test("ce que le second affichait avant l'écriture ne prouve rien", () => {
    const { saisie: input } = free();
    input.sortie(PROOF);
    const issues: boolean[] = [];
    input.ecrit((proof) => void issues.push(proof));
    input.sortie("autre chose");
    assert.deepEqual(issues, []);
  });

  test("l'app renonce : sans preuve, sa commande est quelque part dans ce que le second montre — sa saisie n'est plus dite vide", () => {
    const { saisie: input } = free();
    const issues: boolean[] = [];
    input.ecrit((proof) => void issues.push(proof));

    input.renoncer();
    input.renoncer();
    input.sortie(PROOF);

    assert.deepEqual(issues, [false]);
    assert.deepEqual(input.etat(), { libre: false, dit: SAYS.ecrit });
  });

  test("le chef tape avant la preuve : l'app renonce à son Entrée — et si c'est la sienne qu'il a faite, la saisie est vide", () => {
    const { saisie: input } = free();
    const issues: boolean[] = [];
    input.ecrit((proof) => void issues.push(proof));
    input.frappe("x");
    assert.deepEqual(issues, [false]);
    assert.deepEqual(input.etat(), { libre: false, dit: SAYS.frappe });

    input.ecrit((proof) => void issues.push(proof));
    input.frappe("\r");
    assert.deepEqual(issues, [false, false]);
    assert.deepEqual(input.etat(), { libre: true });
  });

  test("partie, la commande est en route jusqu'à ce que `claude` se montre au travail — puis il est occupé, puis libre", () => {
    const { tours: turns, saisie: input } = free();
    input.parti();
    assert.deepEqual(input.etat(), { libre: false, dit: SAYS.route });

    input.sortie(WORK[0] ?? "");
    assert.deepEqual(input.etat(), { libre: false, dit: SAYS.occupe });
    // Le second tire un tour de la sortie de la commande, que `Stop` ferme.
    turns.dits += "fin\n";
    input.sortie(REPOS);
    assert.deepEqual(input.etat(), { libre: true });
  });

  test("une commande si brève que le travail et le repos arrivent d'un bloc — ou que le titre n'en montre rien : elle n'est pas dite en route pour toujours", () => {
    const brief = free();
    brief.saisie.parti();
    brief.saisie.sortie(`${WORK[0]}! echo ok${REPOS}`);
    assert.deepEqual(brief.saisie.etat(), { libre: true });

    const silent = free();
    silent.saisie.parti();
    assert.deepEqual(silent.saisie.etat(), { libre: false, dit: SAYS.route });
    silent.tours.dits += "fin\n";
    assert.deepEqual(silent.saisie.etat(), { libre: true });
  });
});
