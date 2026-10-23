// Le lancement de l'onglet Second : `claude` reçoit le rôle du second dans son prompt système, depuis le fichier
// que l'app livre, à la reprise comme dans une session neuve — et rien d'autre ne le reçoit. Contre de faux pty :
// le vrai `claude` n'est jamais lancé.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ligneDeCmd } from "../../../runtime/src/sans-invite.ts";
import { crochetsDesTours, ouvrirTours, reglages } from "../../src/saisie.ts";
import { argumentsDuSecond, reglagesDuSecond, ROLE_DU_SECOND } from "../../src/second/lancement.ts";
import { ouvrirTerminaux, type Lancement } from "../../src/terminaux.ts";

const SRC = join(import.meta.dirname, "..", "..", "src");
const OPTION_DU_ROLE = "--append-system-prompt-file";

function dossier(t: TestContext, prefixe = "brigade-second-"): string {
  const cree = realpathSync(mkdtempSync(join(tmpdir(), prefixe)));
  t.after(() => rmSync(cree, { recursive: true, force: true }));
  return cree;
}

// Un registre comme celui de l'app, contre de faux pty : chaque lancement est relevé. `tours` : les fichiers où
// les seconds disent leurs tours — sans eux, l'app ne les suit pas.
function registre(tours?: ReturnType<typeof ouvrirTours>) {
  const lances: Lancement[] = [];
  const terminaux = ouvrirTerminaux({
    claude: "claude",
    shell: "/bin/zsh",
    ouvrirPty(lancement) {
      lances.push(lancement);
      return { ecrire: () => {}, redimensionner: () => {}, tuer: () => {} };
    },
    surSortie: () => {},
    surEtat: () => {},
    ...(tours === undefined ? {} : { tours: (id: number) => tours.de(id) }),
  });
  const lance = (rang: number): Lancement => lances.at(rang) ?? assert.fail(`aucun lancement au rang ${rang}`);
  return { terminaux, lances, lance };
}

// Ce qui suit l'option du rôle, et l'option elle-même : absent, `undefined`.
const roleDe = (args: readonly string[]) => {
  const rang = args.indexOf(OPTION_DU_ROLE);
  return rang === -1 ? undefined : args[rang + 1];
};
const reglagesDe = (args: readonly string[]) => {
  const rangs = args.flatMap((arg, rang) => (arg === "--settings" ? [rang] : []));
  assert.equal(rangs.length, 1, `un seul --settings : ${args.join(" ")}`);
  return JSON.parse(args[(rangs[0] ?? 0) + 1] ?? "") as { hooks?: Record<string, unknown[]> };
};
// Une invocation de skill ou de commande de `claude` : un argument qui commence par `/`, ou le rôle de la V1.
const invoque = (args: readonly string[]) => args.filter((arg, rang) => args[rang - 1] !== OPTION_DU_ROLE && (arg.startsWith("/") || arg.includes("brigade:po")));

const BRIGADE = { nom: "brigade", dossier: "/projets/brigade" };

describe("le rôle du second, livré avec l'app", () => {
  test("il vit sous app/src/second/, et porte les règles du rôle — sans dépendre du plugin", () => {
    assert.equal(relative(SRC, ROLE_DU_SECOND), join("second", "role.md"));
    const texte = readFileSync(ROLE_DU_SECOND, "utf8");
    // Les règles du rôle : la file lue à l'ouverture, pas de code, pas de merge, pas de secrets, et le relais d'un refus.
    for (const regle of ["brigade <nom> status", "you write no application code", "You never merge a pull request", "`.env.local`", "BRIGADE_CLAUDE_TOKEN_FILE", "A refusal is said, in one sentence", "waiting set"]) {
      assert.ok(texte.includes(regle), regle);
    }
    // Rien qui renvoie au skill du plugin : ni `/brigade:po`, ni `$ARGUMENTS`, ni le workflow que le skill Codex relit.
    for (const plugin of ["/brigade:po", "$ARGUMENTS", "references/workflow.md", "/brigade:manager"]) assert.ok(!texte.includes(plugin), plugin);
  });
});

describe("l'onglet Second lance `claude` avec le rôle dans son prompt système", () => {
  test("à l'ouverture : `claude --continue`, le rôle ajouté au prompt système depuis le fichier livré — et aucune invocation de skill", () => {
    const { terminaux, lance } = registre();

    terminaux.espace(BRIGADE);

    const { commande, args, dossier: ou } = lance(0);
    assert.deepEqual([commande, ou], ["claude", "/projets/brigade"]);
    assert.deepEqual(args, ["--continue", OPTION_DU_ROLE, ROLE_DU_SECOND, "--settings", "{}"]);
    assert.deepEqual(invoque(args), []);
  });

  test("la reprise et la session neuve portent les mêmes drapeaux du rôle — et la relance par une touche aussi", () => {
    const { terminaux, lances, lance } = registre();
    const [second] = terminaux.espace(BRIGADE);
    assert.ok(second);

    // `claude --continue` n'a rien repris : la session neuve part avec le rôle.
    lance(0).surFin(1);
    // Elle s'arrête : une touche relance la reprise, avec le rôle.
    lance(1).surFin(0);
    terminaux.ecrire(second.id, "x");

    assert.deepEqual(
      lances.map(({ args }) => args),
      [
        ["--continue", OPTION_DU_ROLE, ROLE_DU_SECOND, "--settings", "{}"],
        [OPTION_DU_ROLE, ROLE_DU_SECOND, "--settings", "{}"],
        ["--continue", OPTION_DU_ROLE, ROLE_DU_SECOND, "--settings", "{}"],
      ],
    );
    for (const { args } of lances) assert.deepEqual(invoque(args), []);
  });

  test("un geste qui trouve le second arrêté le relance avec le rôle", async () => {
    const { terminaux, lances, lance } = registre();
    terminaux.espace(BRIGADE);
    lance(0).surFin(0);

    terminaux.inscrire(BRIGADE, "!git status");
    lance(1).surFin(0);
    await terminaux.envoyer(BRIGADE, "!git status");

    assert.equal(lances.length, 3);
    for (const { args } of lances) assert.equal(roleDe(args), ROLE_DU_SECOND);
  });

  test("les réglages de ce lancement sont un seul `--settings`, donné sur la ligne de commande : les crochets des tours y sont, à la reprise comme dans la session neuve", (t) => {
    const tours = ouvrirTours(dossier(t));
    const { terminaux, lance } = registre(tours);
    const [second] = terminaux.espace(BRIGADE);
    assert.ok(second);
    lance(0).surFin(1);

    const attendus = JSON.parse(reglages(tours.de(second.id).chemin));
    for (const rang of [0, 1]) {
      assert.equal(roleDe(lance(rang).args), ROLE_DU_SECOND);
      assert.deepEqual(reglagesDe(lance(rang).args), attendus);
    }
  });

  test("les réglages réunissent les crochets de chaque part, événement par événement, dans l'ordre donné", () => {
    const tours = crochetsDesTours("/tmp/essai/second-1.tours");
    const ouverture = { SessionStart: [{ matcher: "startup|resume|compact", hooks: [{ type: "command" as const, command: "lire la file" }] }] };
    const refus = { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command" as const, command: "refuser" }] }] };

    const { hooks } = reglagesDuSecond(tours, ouverture, refus);

    assert.deepEqual(Object.keys(hooks ?? {}), ["UserPromptSubmit", "PreToolUse", "Stop", "SessionStart"]);
    assert.deepEqual(hooks?.PreToolUse, [...tours.PreToolUse, ...refus.PreToolUse]);
    assert.deepEqual(hooks?.SessionStart, ouverture.SessionStart);
    assert.deepEqual(reglagesDuSecond(), {});
  });

  test("sous Windows, un `claude.cmd` reçoit ces arguments : le texte du rôle ne passe pas par la ligne de commande, qui ne porte aucun saut de ligne", () => {
    const args = argumentsDuSecond({
      reprise: true,
      reglages: reglagesDuSecond(crochetsDesTours("C:\\Users\\chef\\AppData\\Local\\Temp\\brigade-app-x\\second-1.tours", "\\")),
      role: "C:\\Users\\chef\\AppData\\Local\\Programs\\Brigade\\resources\\app\\src\\second\\role.md",
    });

    assert.ok(args.every((arg) => !/[\r\n]/.test(arg)));
    const ligne = ligneDeCmd("C:\\Users\\chef\\AppData\\Roaming\\npm\\claude.cmd", args);
    assert.ok(ligne.includes("role.md"));
    assert.ok(ligne.length < 8191, `la ligne de cmd.exe tient sous sa limite : ${ligne.length}`);
  });
});

describe("le rôle n'existe que dans l'onglet Second", () => {
  test("un shell ouvert à côté, et une session ouverte sur une commande de `claude` (`/brigade:init`), ne reçoivent pas le rôle", () => {
    const { terminaux, lance } = registre();
    terminaux.session(BRIGADE, "/brigade:init");
    terminaux.shell(BRIGADE);

    assert.deepEqual(lance(0).args, ["/brigade:init"]);
    assert.equal(roleDe(lance(0).args), undefined);
    assert.equal(lance(1).commande, "/bin/zsh");
    assert.equal(roleDe(lance(1).args), undefined);
  });

  // La vérification que le ticket demande : rien n'est écrit dans le dossier du projet — ni `.claude/`, ni aucun
  // fichier qu'une session de `claude` y lirait —, le rôle et les réglages n'existant que dans les arguments du
  // lancement. Un `claude` lancé à la main dans ce dossier n'a donc rien d'où tenir le rôle.
  test("le dossier du projet reste tel quel : le rôle est un fichier de l'app, les réglages une valeur de la ligne de commande, les tours hors du projet", (t) => {
    const projet = dossier(t, "brigade-projet-");
    mkdirSync(join(projet, ".claude"));
    writeFileSync(join(projet, ".claude", "settings.json"), '{"permissions":{}}\n');
    writeFileSync(join(projet, "CLAUDE.md"), "# Projet\n");
    const avant = arbre(projet);
    const tours = ouvrirTours(dossier(t, "brigade-tours-"));
    const { terminaux, lances, lance } = registre(tours);

    const [second] = terminaux.espace({ nom: "projet", dossier: projet });
    assert.ok(second);
    lance(0).surFin(1);
    terminaux.session({ nom: "projet", dossier: projet }, "/brigade:init");

    assert.deepEqual(arbre(projet), avant);
    for (const { args } of lances.slice(0, 2)) {
      const role = roleDe(args) ?? assert.fail("le second a son rôle");
      assert.ok(!role.startsWith(projet + sep), role);
      assert.ok(existsSync(role));
      // `--settings` porte l'objet lui-même, pas un fichier à lire.
      assert.ok(reglagesDe(args).hooks !== undefined);
      for (const arg of args) assert.ok(!arg.startsWith(projet + sep), arg);
    }
  });
});

// Chaque fichier du dossier, avec son contenu.
function arbre(racine: string, sous = ""): Record<string, string> {
  const vu: Record<string, string> = {};
  for (const entree of readdirSync(join(racine, sous), { withFileTypes: true })) {
    const chemin = join(sous, entree.name);
    if (entree.isDirectory()) Object.assign(vu, arbre(racine, chemin));
    else vu[chemin] = readFileSync(join(racine, chemin), "utf8");
  }
  return vu;
}
