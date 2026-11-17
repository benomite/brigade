// Les rôles qui écrivent pour un humain portent une seule consigne d'écriture : environ 80 % d'ASD-STE100
// (#3769). Les consignes du runtime l'importent ; les rôles en markdown portent la même phrase.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { consigneDeJugement } from "../src/juger.ts";
import { CONSIGNE_STE } from "../src/ste.ts";

const RACINE = new URL("../../", import.meta.url);

test("la consigne de jugement du manager porte la consigne ASD-STE100", () => {
  const consigne = consigneDeJugement({ depot: "o/r", issue: { number: 1, title: "t", body: "b", labels: [] }, commentaires: [] });
  assert.ok(consigne.includes(CONSIGNE_STE));
});

test("la consigne dit les cinq règles : phrases courtes, une idée, voix active, un mot par objet, rien de retiré", () => {
  for (const regle of ["ASD-STE100", "phrases courtes", "une idée par phrase", "voix active", "docs/glossary.md", "aucun fait, chiffre ni réserve"]) assert.ok(CONSIGNE_STE.includes(regle), regle);
});

test("chaque rôle qui écrit pour un humain la porte, une seule fois", () => {
  for (const role of ["commands/po.md", "commands/manager.md", "commands/dev.md", "agents/manager.md", "agents/triage.md", "agents/product.md", "agents/second-juge.md", "codex/skills/po/SKILL.md", "codex/skills/manager/SKILL.md", "codex/skills/dev/SKILL.md"]) {
    const texte = readFileSync(new URL(role, RACINE), "utf8");
    assert.equal(texte.split("**Écrire pour un humain.**").length - 1, 1, role);
    assert.ok(texte.includes("environ 80 % d'ASD-STE100"), role);
  }
});
