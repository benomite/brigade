// Un projet installé par brigade est prêt pour le mode auto : la commande
// `mode-auto-cli.ts` pose dans son `.claude/settings.json` les règles des
// gestes que les rôles prévoient, étroites, sans doublon ni rien retirer au
// chef, et dit ce qu'aucune règle ne peut autoriser.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { principal } from "../src/mode-auto-cli.ts";
import { COMMANDE_DU_ROLE, DOCS_DE_LA_BOX, PAGES_DU_RUNTIME, GESTES, LECTURE_DE_LA_FILE, LECTURES_DE_L_ETAT, ROLES } from "../src/mode-auto.ts";
import { appeler, lancer, repertoireTemporaire } from "./outils.ts";

const CLI = join(import.meta.dirname, "../src/mode-auto-cli.ts");
const DEPOT = join(import.meta.dirname, "../..");
const SSH = "ssh -o BatchMode=yes -o ConnectTimeout=10 --";

// Un poste : un dossier personnel, un projet, et la déclaration de l'app qui
// le relie à sa box.
function poste(t: TestContext, projet: { nom?: string; hote?: string } | null = { nom: "espace", hote: "mabox" }) {
  const maison = repertoireTemporaire(t);
  const dossier = join(maison, "code/espace");
  mkdirSync(dossier, { recursive: true });
  const app = join(maison, ".config/brigade/app.json");
  if (projet !== null) {
    mkdirSync(join(maison, ".config/brigade"), { recursive: true });
    writeFileSync(app, JSON.stringify({ hotes: ["mabox"], projets: [{ dossier: "~/code/espace", ...projet }] }));
  }
  const reglages = join(dossier, ".claude/settings.json");
  const env = { HOME: maison, BRIGADE_APP_CONFIG: app };
  const installer = async (...args: string[]) => {
    const cli = appeler(principal, [dossier, ...args], env);
    return { code: await cli.fin, sortie: cli.sortie() };
  };
  const lus = () => JSON.parse(readFileSync(reglages, "utf8")) as { permissions: { allow: string[] } } & Record<string, unknown>;
  return { maison, dossier, reglages, installer, lus, env };
}

// Ce qu'une règle `Bash(…)` autorise, tel que la doc de Claude Code le décrit
// (« Configure permissions », « Wildcard patterns ») : sans `*`, la commande au
// caractère près ; chaque `*` vaut n'importe quel texte, et un ` *` final vaut
// aussi la commande nue. Le modèle sert à prouver qu'aucune règle posée
// n'autorise ce qu'elle ne nomme pas.
function autorise(regle: string, commande: string): boolean {
  const corps = /^Bash\((.*)\)$/s.exec(regle)?.[1];
  if (corps === undefined) return false;
  const motif = corps.replace(/:\*$/, " *");
  if (!motif.includes("*")) return motif === commande;
  const echappe = (texte: string) => texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(`^${motif.split("*").map(echappe).join("[\\s\\S]*")}$`);
  return expression.test(commande) || (motif.endsWith(" *") && motif.indexOf("*") === motif.length - 1 && commande === motif.slice(0, -2));
}

test("après l'installation, le fichier du projet autorise la lecture de la file, de la doc et de l'état de brigade sur la box", async (t) => {
  const { installer, lus, reglages } = poste(t);

  const { code, sortie } = await installer();

  assert.equal(code, 0, sortie);
  assert.ok(existsSync(reglages));
  const allow = lus().permissions.allow;
  assert.ok(allow.includes(`Bash(${SSH} mabox brigade espace status)`), allow.join("\n"));
  for (const doc of ["installer.md", "runtime/README.md", "runtime/station.md", "runtime/exploitation.md", "app.md", "glossary.md"]) assert.ok(allow.includes(`Bash(${SSH} mabox cat /opt/brigade/docs/${doc})`), doc);
  for (const lecture of ["rail", "log", "pass", "base", "installation"]) assert.ok(allow.includes(`Bash(${SSH} mabox brigade espace ${lecture})`), lecture);
  assert.ok(allow.includes("Read(~/.config/brigade/app.json)"));
  assert.match(sortie, /mabox`, projet « espace »/);
  assert.match(sortie, /AUTORISÉ\s+Lire la file — 1 règle/);
});

test("le merge d'une PR à la demande du chef n'est pas autorisé par la configuration, et la sortie le dit avec la raison et le geste", async (t) => {
  const { installer, lus } = poste(t);

  const { sortie } = await installer();

  assert.match(sortie, /PAS AUTORISABLE Merger une PR de brigade : sur demande explicite du chef, seulement — une règle ne voit que le texte de la commande/);
  assert.match(sortie, /`! gh pr merge <N> --squash`/);
  assert.match(sortie, /aucune règle `autoMode` : Claude Code ne les lit pas depuis le dépôt/);
  assert.equal(lus().autoMode, undefined);
  assert.ok(!lus().permissions.allow.some((regle) => regle.includes("gh ")));
});

test("aucune règle ne généralise : ni un ssh vers une autre cible, ni une commande hors liste, ni un merge", async (t) => {
  const { installer, lus } = poste(t);
  await installer();
  const allow = lus().permissions.allow;

  for (const regle of allow) {
    assert.ok(!regle.includes("*"), `une règle à motif : ${regle}`);
    assert.ok(regle === "Read(~/.config/brigade/app.json)" || regle.startsWith(`Bash(${SSH} mabox `), `une règle hors de la box du projet : ${regle}`);
  }
  const passe = (commande: string) => allow.some((regle) => autorise(regle, commande));
  // Ce que les rôles prévoient passe…
  assert.ok(passe(`${SSH} mabox brigade espace status`));
  assert.ok(passe(`${SSH} mabox cat /opt/brigade/docs/installer.md`));
  assert.ok(passe(`${SSH} mabox brigade espace log`));
  // … et rien d'autre.
  for (const commande of [
    `${SSH} autre-box brigade espace status`,
    "ssh evil.example.com brigade espace status",
    `${SSH} mabox brigade autre-projet status`,
    `${SSH} mabox brigade espace grant merge`,
    `${SSH} mabox brigade espace guardrails stop`,
    `${SSH} mabox brigade espace station cooks 0`,
    `${SSH} mabox brigade espace base replay`,
    `${SSH} mabox brigade espace deploy`,
    `${SSH} mabox brigade espace status --follow`,
    `${SSH} mabox sudo -n /usr/local/bin/brigade-installer espace`,
    `${SSH} mabox cat /etc/shadow`,
    `${SSH} mabox cat /opt/brigade/docs/installer.md /home/brigade/.claude/.credentials.json`,
    `${SSH} mabox 'brigade espace status; rm -rf ~'`,
    `${SSH} mabox`,
    "ssh mabox",
    "ssh -o ProxyCommand=sh mabox brigade espace status",
    "gh pr merge 372 --squash",
    "gh pr merge 372 --admin",
    "gh pr merge --auto --squash",
    "git push --force",
  ]) {
    assert.ok(!passe(commande), `autorisé à tort : ${commande}`);
  }
});

test("un hôte ou un nom qui ferait une règle large est refusé, et rien n'est écrit", async (t) => {
  for (const [option, valeur] of [
    ["--hote", "mabox brigade espace status; rm -rf ~"],
    ["--hote", "*"],
    ["--hote", "-oProxyCommand=sh"],
    ["--hote", "mabox)"],
    ["--nom", "espace *"],
    ["--nom", "Espace"],
  ] as const) {
    const { installer, reglages } = poste(t);

    const { code, sortie } = await installer(option, valeur);

    assert.equal(code, 65, sortie);
    assert.match(sortie, /rien n'est écrit/);
    assert.ok(!existsSync(reglages), `${option} ${valeur}`);
  }
});

test("relancer l'installation ne duplique rien et ne retire aucun réglage du chef", async (t) => {
  const { installer, reglages, lus } = poste(t);
  mkdirSync(join(reglages, ".."), { recursive: true });
  const duChef = {
    env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" },
    subagentPromptCacheTtl: "1h",
    enabledPlugins: { "brigade@brigade": true },
    permissions: {
      defaultMode: "default",
      allow: ["Bash(npm test)", `Bash(${SSH} mabox brigade espace status)`],
      deny: ["Bash(rm *)"],
      ask: ["Bash(git push *)"],
    },
  };
  writeFileSync(reglages, `${JSON.stringify(duChef, null, 4)}\n`);

  const premiere = await installer();
  const apres = readFileSync(reglages, "utf8");
  const seconde = await installer();

  assert.equal(premiere.code, 0, premiere.sortie);
  assert.equal(seconde.code, 0, seconde.sortie);
  assert.equal(readFileSync(reglages, "utf8"), apres, "la seconde passe a réécrit le fichier");
  assert.match(seconde.sortie, /33 règle\(s\), toutes déjà là : rien n'est écrit/);
  assert.match(premiere.sortie, /31 règle\(s\) ajoutée\(s\), 1 déjà là/);
  // L'indentation du chef est gardée : le diff ne montre que les règles.
  assert.match(apres, /^ {4}"env"/m);

  const { permissions, ...reste } = lus() as typeof duChef;
  const { permissions: siennes, ...sesAutres } = duChef;
  assert.deepEqual(reste, sesAutres);
  assert.equal(permissions.defaultMode, "default");
  assert.deepEqual(permissions.deny, siennes.deny);
  assert.deepEqual(permissions.ask, siennes.ask);
  assert.deepEqual(permissions.allow.slice(0, 2), siennes.allow);
  assert.equal(new Set(permissions.allow).size, permissions.allow.length, "une règle en double");
});

test("un fichier de réglages illisible n'est pas réécrit", async (t) => {
  for (const contenu of ['{ "permissions": { "allow": [ } }', '{ "permissions": { "allow": "Bash(npm test)" } }', "[]"]) {
    const { installer, reglages } = poste(t);
    mkdirSync(join(reglages, ".."), { recursive: true });
    writeFileSync(reglages, contenu);

    const { code, sortie } = await installer();

    assert.equal(code, 65, sortie);
    assert.match(sortie, /rien n'est écrit ; corrige-le, puis relance/);
    assert.equal(readFileSync(reglages, "utf8"), contenu);
  }
});

test("sans hôte déclaré, les lectures de la box ne sont pas posées, et la sortie dit pourquoi et quoi faire", async (t) => {
  const { installer, lus } = poste(t, null);

  const { code, sortie } = await installer();

  assert.equal(code, 0, sortie);
  assert.deepEqual(lus().permissions.allow, ["Read(~/.config/brigade/app.json)"]);
  assert.match(sortie, /AUCUN HÔTE — ni nom ni hôte pour ce projet \(.*app\.json n'existe pas\)/);
  assert.match(sortie, /ou passe --hote et --nom, puis relance/);
  assert.match(sortie, /NON POSÉ\s+Lire la file — il faut l'hôte et le nom du projet/);
});

test("--hote et --nom remplacent ce que l'app déclare", async (t) => {
  const { installer, lus } = poste(t, { nom: "espace" });

  const { code, sortie } = await installer("--hote", "chef@box.example.org", "--nom", "atelier");

  assert.equal(code, 0, sortie);
  assert.ok(lus().permissions.allow.includes(`Bash(${SSH} chef@box.example.org brigade atelier status)`));
});

test("chaque geste que les rôles prévoient a sa ligne : autorisé, sans règle, ou pas autorisable — et sa raison", async (t) => {
  const { installer } = poste(t);
  const { sortie } = await installer();

  for (const role of ROLES) {
    // La source unique : la section « Gestes prévus » du fichier de rôle.
    const fichier = readFileSync(join(DEPOT, `commands/${COMMANDE_DU_ROLE[role]}.md`), "utf8");
    const section = /^## Gestes prévus[^\n]*\n([\s\S]*?)(?=^\*\*Un refus)/m.exec(fichier)?.[1] ?? "";
    const prevus = [...section.matchAll(/^- \*\*(.+?)\*\*/gm)].map(([, libelle]) => libelle);
    assert.ok(prevus.length > 0, `aucun geste lu dans commands/${COMMANDE_DU_ROLE[role]}.md`);
    assert.deepEqual(
      GESTES.filter((geste) => geste.role === role).map(({ libelle }) => libelle),
      prevus,
      `les gestes de ${role} ne sont plus ceux de son rôle : mettre mode-auto.ts à jour`,
    );
    for (const libelle of prevus) {
      const ligne = sortie.split("\n").find((l) => l.includes(` ${libelle} — `));
      assert.match(ligne ?? "", /^ {2}(AUTORISÉ|SANS RÈGLE|PAS AUTORISABLE) +.+ — .{20,}/, `${role} : ${libelle}`);
    }
  }
});

test("les lectures autorisées existent : des commandes du runtime, et des docs de brigade", () => {
  const scripts = Object.keys((JSON.parse(readFileSync(join(DEPOT, "runtime/package.json"), "utf8")) as { scripts: Record<string, string> }).scripts);
  for (const commande of [LECTURE_DE_LA_FILE, ...LECTURES_DE_L_ETAT]) assert.ok(scripts.includes(commande), commande);
  for (const doc of DOCS_DE_LA_BOX) assert.ok(existsSync(join(DEPOT, "docs", doc)), doc);
  const pages = readdirSync(join(DEPOT, "docs/runtime")).filter((page) => page.endsWith(".md")).map((page) => `runtime/${page}`).sort();
  assert.deepEqual([...PAGES_DU_RUNTIME].sort(), pages, "chaque page de docs/runtime/ est lisible par le second");
});

test("lancée par son fichier, la commande écrit les règles et rend 0", async (t) => {
  const { dossier, env, lus } = poste(t);

  const cli = lancer(t, CLI, [dossier], env);

  assert.equal(await cli.fin, 0, cli.sortie());
  assert.ok(lus().permissions.allow.includes(`Bash(${SSH} mabox brigade espace status)`));
});
