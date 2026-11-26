// Le rôle du second redit après l'init (#2689) : une session de l'onglet Second née sans la section des bindings la
// voit apparaître sur la branche d'intégration — la PR de `/brigade:init` mergée — et son prompt suivant porte le texte
// du rôle, la section et la file lue à neuf. Une seule fois ; une session née avec la section ne lit rien à ses prompts.
// Et ni le rôle ni la fin de l'init ne renvoient vers `brigade:po` ou un rôle V1, ni n'offrent un modèle ou un effort.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { crochetsDuRole } from "../../src/second/crochet-du-role.ts";
import { ROLE_DU_SECOND } from "../../src/second/lancement.ts";
import { debut, prompt, sectionDesBindings } from "../../src/second/role-apres-init.ts";
import type { AppelGitHub } from "../../src/tableau/client.ts";
import { ouvrirTerminaux, type Lancement } from "../../src/terminaux.ts";

const RACINE = join(import.meta.dirname, "..", "..", "..");
const SCRIPT = join(RACINE, "app", "src", "second", "role-apres-init.ts");
const SANS_SH = process.platform === "win32" ? "le faux gh est un script sh, que Windows ne lance pas" : false;

function dossier(t: TestContext): string {
  const d = mkdtempSync(join(tmpdir(), "brigade-role-"));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
}

const DEPOT = "benomite/baloo";
const SANS = "# baloo\n\nA small app.\n";
const AVEC = `${SANS}\n## Équipe multi-agents\n\n- **Branche d'intégration** : \`main\`\n- **Gates** : \`.claude/brigade/gates.sh <WT>\`\n\n## Other\n\nnot the bindings\n`;
const CHEF = [{ number: 20, title: "Ticket 20", html_url: `https://github.com/${DEPOT}/issues/20`, created_at: "2026-11-01T00:00:00Z", labels: [{ name: "chef-todo" }] }];
const TODO = [{ body: "<!-- brigade:todo kind=blocked -->\nWhich token does the box use for the registry?", author_association: "OWNER", created_at: "2026-11-05T10:00:00Z" }];

// GitHub tel que le projet le tient : le `CLAUDE.md` de la branche d'intégration (`base.claudeMd`, absent : 404), une carte
// `chef-todo` qui attend le chef. Chaque chemin demandé est noté.
function github(base: { claudeMd?: string }, demandes: string[]): AppelGitHub {
  return async (chemin) => {
    demandes.push(chemin);
    if (chemin.includes("/contents/CLAUDE.md")) return base.claudeMd === undefined ? { status: 404, data: { message: "Not Found" } } : { status: 200, data: { content: Buffer.from(base.claudeMd).toString("base64"), encoding: "base64" } };
    if (chemin.includes("labels=chef-todo")) return { status: 200, data: CHEF };
    if (chemin.includes("/issues/20/comments")) return { status: 200, data: TODO };
    return { status: 200, data: [] };
  };
}

describe("le rôle du second, redit après l'init", () => {
  test("la section des bindings, de son titre au titre suivant ; rien sans elle", () => {
    assert.equal(sectionDesBindings(AVEC), "## Équipe multi-agents\n\n- **Branche d'intégration** : `main`\n- **Gates** : `.claude/brigade/gates.sh <WT>`");
    assert.equal(sectionDesBindings(SANS), undefined);
  });

  test("dès que CLAUDE.md porte la section sur la branche d'intégration, le prompt suivant de la session Second porte le rôle et la file — une fois", async (t) => {
    const projet = dossier(t);
    const notes = dossier(t);
    writeFileSync(join(projet, "CLAUDE.md"), SANS);
    const entree = { session_id: "second-1", cwd: projet };
    const cible = { nom: "baloo", depot: DEPOT, base: "main" };
    const base: { claudeMd?: string } = {};
    const demandes: string[] = [];
    debut(entree, notes);

    // `/brigade:init` tourne, sa PR n'est pas mergée : rien n'est ajouté au prompt.
    assert.equal(await prompt(entree, cible, github(base, demandes), notes), "");
    assert.deepEqual(demandes, [`/repos/${DEPOT}/contents/CLAUDE.md?ref=main`]);
    base.claudeMd = SANS;
    assert.equal(await prompt(entree, cible, github(base, demandes), notes), "");

    // La PR mergée : le prompt suivant porte le rôle, les bindings lus sur GitHub, et la file lue à neuf.
    base.claudeMd = AVEC;
    const sortie = JSON.parse(await prompt(entree, cible, github(base, demandes), notes)) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
    assert.equal(sortie.hookSpecificOutput.hookEventName, "UserPromptSubmit");
    const contexte = sortie.hookSpecificOutput.additionalContext;
    assert.ok(contexte.includes(readFileSync(ROLE_DU_SECOND, "utf8").trim()), "le texte du rôle, entier");
    assert.ok(contexte.includes("- **Branche d'intégration** : `main`"), "les bindings");
    assert.doesNotMatch(contexte, /not the bindings/);
    assert.match(contexte, /^awaiting/m);
    assert.match(contexte, /#20/);
    assert.match(contexte, /^end awaiting/m);
    assert.ok(demandes.some((chemin) => chemin.includes("labels=chef-todo")), "la file est lue à ce prompt");

    // Redit une fois : les prompts suivants ne lisent plus rien.
    const avant = demandes.length;
    assert.equal(await prompt(entree, cible, github(base, demandes), notes), "");
    assert.equal(demandes.length, avant);
  });

  test("une session née avec la section : ses prompts ne lisent rien et n'ajoutent rien", async (t) => {
    const projet = dossier(t);
    const notes = dossier(t);
    writeFileSync(join(projet, "CLAUDE.md"), AVEC);
    const demandes: string[] = [];
    debut({ session_id: "second-2", cwd: projet }, notes);
    assert.equal(await prompt({ session_id: "second-2", cwd: projet }, { nom: "baloo", depot: DEPOT }, github({ claudeMd: AVEC }, demandes), notes), "");
    assert.deepEqual(demandes, []);
  });

  test("le lancement de l'onglet Second déclare les deux crochets, avec la branche d'intégration du projet", () => {
    const lances: Lancement[] = [];
    const terminaux = ouvrirTerminaux({
      claude: "claude",
      shell: "/bin/zsh",
      node: "/usr/bin/node",
      ouvrirPty(l) {
        lances.push(l);
        return { ecrire: () => {}, redimensionner: () => {}, tuer: () => {} };
      },
      surSortie: () => {},
      surEtat: () => {},
    });
    terminaux.espace({ nom: "baloo", dossier: "/projets/baloo", depot: DEPOT, base: "main" });
    const args = lances.at(0)?.args ?? assert.fail("aucun lancement");
    const { hooks } = JSON.parse(args[args.indexOf("--settings") + 1] ?? "") as { hooks: Record<string, { matcher?: string; hooks: { command: string }[] }[]> };
    const commandes = (evenement: string) => (hooks[evenement] ?? []).flatMap((c) => c.hooks.map((h) => h.command));
    assert.ok(commandes("UserPromptSubmit").some((c) => /role-apres-init\.ts' 'prompt' 'baloo' 'benomite\/baloo' 'main' 'gh'$/.test(c)));
    assert.ok(commandes("SessionStart").some((c) => /role-apres-init\.ts' 'debut' 'baloo' 'benomite\/baloo' 'main' 'gh'$/.test(c)));
    assert.deepEqual(crochetsDuRole({ node: "node", gh: "gh", cible: { nom: "baloo" } }).SessionStart?.[0]?.matcher, "startup|resume|compact");
  });

  test("joué par `claude` : l'entrée du crochet sur stdin, le gh du poste, la sortie au format du contexte additionnel", { skip: SANS_SH }, (t) => {
    const projet = dossier(t);
    const d = dossier(t);
    writeFileSync(join(d, "claude.json"), JSON.stringify({ content: Buffer.from(AVEC).toString("base64"), encoding: "base64" }));
    const gh = join(d, "gh");
    writeFileSync(gh, `#!/bin/sh\necho "$@" >> '${join(d, "recu")}'\ncase "$2" in\n  *contents/CLAUDE.md*) /bin/cat '${join(d, "claude.json")}' ;;\n  *) echo '[]' ;;\nesac\n`);
    chmodSync(gh, 0o755);
    const jouer = (moment: string) =>
      spawnSync(process.execPath, [SCRIPT, moment, "baloo", DEPOT, "main", gh], { encoding: "utf8", cwd: projet, input: JSON.stringify({ session_id: "second-3", cwd: projet }), env: { PATH: d, HOME: d, TMPDIR: d } });
    const ouverture = jouer("debut");
    assert.equal(ouverture.status, 0);
    assert.equal(ouverture.stdout, "");
    const r = jouer("prompt");
    assert.equal(r.status, 0);
    const sortie = JSON.parse(r.stdout) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
    assert.equal(sortie.hookSpecificOutput.hookEventName, "UserPromptSubmit");
    assert.match(sortie.hookSpecificOutput.additionalContext, /You are \*\*the second\*\* of this project/);
    assert.match(readFileSync(join(d, "recu"), "utf8"), /^api repos\/benomite\/baloo\/contents\/CLAUDE\.md\?ref=main$/m);
  });
});

// Les deux textes qui parlent au chef autour de l'init : le rôle du second, et la fin de `/brigade:init` — celle du
// plugin de l'app comme celle du plugin V1.
const FIN_DE_L_INIT = [
  ["app/src/plugin/init.md", "## 4. Résume"],
  ["commands/init.md", "## 8. Résume"],
] as const;
const TEXTES: [string, string][] = [
  ["app/src/second/role.md", readFileSync(join(RACINE, "app", "src", "second", "role.md"), "utf8")],
  ...FIN_DE_L_INIT.map(([chemin, titre]): [string, string] => {
    const texte = readFileSync(join(RACINE, chemin), "utf8");
    const debutDeLaFin = texte.indexOf(titre);
    assert.ok(debutDeLaFin >= 0, `${chemin} : « ${titre} » introuvable`);
    return [`${chemin} (${titre})`, texte.slice(debutDeLaFin)];
  }),
];

describe("ni brigade:po, ni rôle V1, ni offre de modèle ou d'effort", () => {
  for (const [nom, texte] of TEXTES) {
    test(nom, () => {
      assert.doesNotMatch(texte, /brigade:po\b/);
      assert.doesNotMatch(texte, /\/brigade:(?:manager|dev|designer|sync|ask)\b/);
      assert.doesNotMatch(texte, /\b(?:model|effort):(?:opus|sonnet|haiku|fable|low|medium|high|xhigh|max)\b/);
      // Une phrase qui parle de modèle ou d'effort dit qu'ils sont au manager, et rien d'autre.
      for (const phrase of texte.split(/(?<=[.;!?])\s+|\n/)) if (/\b(?:model|modèle|effort)s?\b/i.test(phrase)) assert.match(phrase, /manager/, `${nom} : « ${phrase.trim()} »`);
    });
  }
  test("le rôle dit que modèle et effort sont au manager", () => {
    assert.match(TEXTES[0]?.[1] ?? "", /\*\*Model and effort are the manager's\*\*/);
  });
});
