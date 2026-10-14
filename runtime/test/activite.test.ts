// Ce qu'un cook fait en ce moment, lu dans son flux : la nature du geste et ce
// qu'il vise — jamais ce qu'il y a dedans.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { direActivite, lecteurDActivite } from "../src/activite.ts";
import { horloge } from "./outils.ts";

const WT = "/srv/etat/worktrees/564-2bf903fa";

// Un flux de `claude`, ligne par ligne : chaque appel d'outil a son numéro.
function flux() {
  let numero = 0;
  const ligne = (objet: unknown) => JSON.stringify(objet);
  return {
    init: () => ligne({ type: "system", subtype: "init", cwd: WT, model: "claude-opus-5-5" }),
    pense: (texte = "Je regarde d'abord le module de l'état, il contient la clé sk-secrete.") => ligne({ type: "assistant", message: { id: "m", content: [{ type: "thinking", thinking: texte }] } }),
    dit: (texte: string) => ligne({ type: "assistant", message: { id: "m", content: [{ type: "text", text: texte }] } }),
    outil: (name: string, input: Record<string, unknown>) => {
      const id = `toolu_${++numero}`;
      return { id, ligne: ligne({ type: "assistant", message: { id: "m", content: [{ type: "tool_use", id, name, input }] } }) };
    },
    rendu: (id: string, contenu: string, is_error = false) => ligne({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content: contenu, is_error }] } }),
    fin: () => ligne({ type: "result", subtype: "success", result: "fini" }),
  };
}

function lecteur(masquer?: (texte: string) => string) {
  const lu = lecteurDActivite({ cwd: WT, maintenant: horloge(), ...(masquer === undefined ? {} : { masquer }) });
  const dit = () => {
    const activite = lu.activite();
    return activite === null ? null : direActivite(activite);
  };
  return { ...lu, dit };
}

describe("lire ce que fait un cook", () => {
  test("rien n'est dit tant que le flux ne dit rien qui se lise", () => {
    const { lire, activite } = lecteur();
    lire("pas du JSON");
    lire(JSON.stringify({ type: "rate_limit_event" }));
    assert.equal(activite(), null);
  });

  test("chaque geste se dit dans des mots du chef, avec le fichier qu'il vise, relatif au worktree", () => {
    const f = flux();
    const { lire, dit } = lecteur();
    lire(f.init());
    assert.equal(dit(), "démarre");
    lire(f.outil("Read", { file_path: `${WT}/runtime/src/etat.ts` }).ligne);
    assert.equal(dit(), "lit runtime/src/etat.ts");
    lire(f.outil("Edit", { file_path: `${WT}/app/src/bon.ts`, old_string: "const a = 1;", new_string: "const a = 2;" }).ligne);
    assert.equal(dit(), "écrit app/src/bon.ts");
    lire(f.outil("Grep", { pattern: "motDePasse", path: WT }).ligne);
    assert.equal(dit(), "cherche dans le code");
    lire(f.outil("Bash", { command: "gh issue view 564 --repo benomite/brigade --comments" }).ligne);
    assert.equal(dit(), "lit le ticket");
    lire(f.outil("Bash", { command: `cd ${WT} && npm --prefix runtime run typecheck` }).ligne);
    assert.equal(dit(), "vérifie les types");
    lire(f.outil("Bash", { command: "git add -A && git commit -m \"$(cat <<'EOF'\nfeat: lance les tests (npm test)\nEOF\n)\"" }).ligne);
    assert.equal(dit(), "commite");
    lire(f.outil("Bash", { command: "gh pr create --title 'x' --body 'y'" }).ligne);
    assert.equal(dit(), "ouvre la PR");
    lire(f.outil("mcp__github__list_issues", {}).ligne);
    assert.equal(dit(), "utilise l'outil mcp__github__list_issues");
    lire(f.fin());
    assert.equal(dit(), "rend son travail");
  });

  test("un fichier hors du worktree garde son chemin entier", () => {
    const f = flux();
    const { lire, dit } = lecteur();
    lire(f.outil("Read", { file_path: "/etc/hosts" }).ligne);
    assert.equal(dit(), "lit /etc/hosts");
  });

  test("les tests se lancent, puis sont rouges ; ce qui s'écrit ensuite les corrige, jusqu'à ce qu'ils soient verts", () => {
    const f = flux();
    const { lire, dit } = lecteur();
    const tests = f.outil("Bash", { command: "npm --prefix runtime test 2>&1 | tail -40" });
    lire(tests.ligne);
    assert.equal(dit(), "lance les tests");
    lire(f.rendu(tests.id, "not ok 3 - la carte dit ce que fait le cook\nExit code 1", true));
    assert.equal(dit(), "tests rouges");
    lire(f.outil("Read", { file_path: `${WT}/app/src/bon.ts` }).ligne);
    assert.equal(dit(), "lit app/src/bon.ts");
    lire(f.outil("Edit", { file_path: `${WT}/app/src/bon.ts` }).ligne);
    assert.equal(dit(), "tests rouges, corrige app/src/bon.ts");
    const encore = f.outil("Bash", { command: "node --test test/bon.test.ts" });
    lire(encore.ligne);
    assert.equal(dit(), "lance les tests");
    lire(f.rendu(encore.id, "ok"));
    assert.equal(dit(), "tests verts");
    lire(f.outil("Edit", { file_path: `${WT}/docs/app.md` }).ligne);
    assert.equal(dit(), "écrit docs/app.md");
  });

  test("les gates rouges se disent comme telles", () => {
    const f = flux();
    const { lire, dit } = lecteur();
    const gates = f.outil("Bash", { command: `.claude/brigade/gates.sh ${WT}` });
    lire(gates.ligne);
    assert.equal(dit(), "lance les gates");
    lire(f.rendu(gates.id, "FAIL", true));
    assert.equal(dit(), "gates rouges");
    lire(f.outil("Write", { file_path: `${WT}/runtime/src/activite.ts`, content: "…" }).ligne);
    assert.equal(dit(), "gates rouges, corrige runtime/src/activite.ts");
  });

  test("un outil rendu, le cook réfléchit — sauf si un autre tourne encore", () => {
    const f = flux();
    const { lire, dit } = lecteur();
    const un = f.outil("Read", { file_path: `${WT}/a.ts` });
    const deux = f.outil("Read", { file_path: `${WT}/b.ts` });
    lire(un.ligne);
    lire(deux.ligne);
    lire(f.rendu(un.id, "contenu de a"));
    assert.equal(dit(), "lit b.ts");
    lire(f.rendu(deux.id, "contenu de b"));
    assert.equal(dit(), "réfléchit");
    lire(f.dit("Je vais maintenant écrire le test."));
    assert.equal(dit(), "réfléchit");
  });

  test("une commande quelconque se dit par son programme, et sa sous-commande s'il en a — jamais ses arguments", () => {
    const f = flux();
    const { lire, dit } = lecteur();
    const voir = (command: string) => {
      lire(f.outil("Bash", { command }).ligne);
      return dit();
    };
    assert.equal(voir(`cd ${WT} && git status --short`), "lance git status");
    assert.equal(voir("TOKEN=ghp_abcdef curl -H 'Authorization: Bearer ghp_abcdef' https://api.example.test"), "lance curl");
    assert.equal(voir("echo motdepassesecret | base64"), "lance echo");
    assert.equal(voir("/usr/bin/sed -n 1,40p runtime/src/etat.ts"), "lance sed");
    assert.equal(voir("$(echo rm) -rf /"), "lance une commande");
    assert.equal(voir("npm install --save-dev typescript"), "lance npm install");
  });

  test("rien de ce que le modèle pense, dit, ou reçoit ne sort — ni le code qu'il écrit", () => {
    const f = flux();
    const { lire, activite } = lecteur();
    const edit = f.outil("Edit", { file_path: `${WT}/src/x.ts`, old_string: "SECRET_DANS_LE_CODE", new_string: "AUTRE_SECRET" });
    lire(f.pense("je pense à PENSEE_SECRETE"));
    lire(f.dit("je dis MESSAGE_SECRET"));
    lire(edit.ligne);
    lire(f.rendu(edit.id, "RENDU_SECRET"));
    lire(f.outil("Bash", { command: "printf 'ARGUMENT_SECRET' > x" }).ligne);
    const sortie = JSON.stringify(activite());
    for (const secret of ["SECRET_DANS_LE_CODE", "AUTRE_SECRET", "PENSEE_SECRETE", "MESSAGE_SECRET", "RENDU_SECRET", "ARGUMENT_SECRET"]) assert.ok(!sortie.includes(secret), `${secret} est sorti : ${sortie}`);
  });

  test("une cible passe par le masque des secrets, et tient sur une ligne bornée", () => {
    const f = flux();
    const { lire, dit } = lecteur((texte) => texte.replaceAll("acme-prod", "***"));
    lire(f.outil("Read", { file_path: `${WT}/config/acme-prod.env` }).ligne);
    assert.equal(dit(), "lit config/***.env");
    lire(f.outil("Read", { file_path: `${WT}/a\nb.ts` }).ligne);
    assert.equal(dit(), "lit a");
    lire(f.outil("Read", { file_path: `${WT}/${"x/".repeat(100)}fin.ts` }).ligne);
    const long = dit() ?? "";
    assert.ok(long.startsWith("lit …") && long.endsWith("x/fin.ts") && long.length < 140, long);
  });

  test("le même geste qui continue garde son heure ; un autre geste prend la sienne", () => {
    const f = flux();
    const lu = lecteurDActivite({ cwd: WT, maintenant: horloge() });
    lu.lire(f.pense());
    const depuis = lu.activite()?.since;
    lu.lire(f.pense());
    lu.lire(f.dit("…"));
    assert.equal(lu.activite()?.since, depuis);
    lu.lire(f.outil("Read", { file_path: `${WT}/a.ts` }).ligne);
    assert.notEqual(lu.activite()?.since, depuis);
  });
});
