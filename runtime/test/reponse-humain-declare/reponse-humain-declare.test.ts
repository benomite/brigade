// La réponse d'un humain déclaré sans l'écriture (#2762) : appliquée sur une
// carte qui lui est assignée, ignorée ailleurs ; un membre de confiance
// (#2619) n'y gagne ni n'y perd rien. Par le vrai client, sous un faux transport.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ouvrirGitHub, type Transport } from "../../src/github.ts";
import { ouvrirLimitesDuCompte } from "../../src/github-limite.ts";
import { ouvrirLimite } from "../../src/limite-github.ts";
import { reponseDUnHumainDeclare, type HumainDeclare } from "../../src/reponse-humain-declare/reponse-humain-declare.ts";

const DEPOT = "o/r";
const HUMAINS: HumainDeclare[] = [{ login: "lea", roles: ["design"] }];

const reponse = (statut: number, corps: unknown) => ({ erreur: null, stdout: `HTTP/2.0 ${statut} X\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(corps)}`, stderr: "" });

// Une carte assignée à `assigne`, où chacun de `poseurs` a posé un label à son nom.
// `chef` a l'écriture ; personne d'autre.
let rang = 0;
function client(assigne: string, poseurs: string[], humains: HumainDeclare[] = HUMAINS) {
  const chemins: string[] = [];
  const transport: Transport = async (args) => {
    const chemin = args[args.length - 1] as string;
    chemins.push(chemin);
    if (chemin.includes("/events")) return reponse(200, poseurs.map((login) => ({ event: "labeled", label: { name: `de-${login}` }, actor: { login } })));
    const permission = /collaborators\/([^/]+)\/permission/.exec(chemin);
    if (permission) return permission[1] === "chef" ? reponse(200, { permission: "write" }) : reponse(404, { message: "Not Found" });
    if (chemin === `repos/${DEPOT}/issues/7`) return reponse(200, { number: 7, assignees: [{ login: assigne }] });
    return reponse(404, { message: "Not Found" });
  };
  const github = ouvrirGitHub({ depot: DEPOT, bin: `faux-gh-2762-${rang++}`, transport, limite: ouvrirLimite(), limitesDuCompte: ouvrirLimitesDuCompte(), humains });
  return { github, chemins };
}

test("un login déclaré sans l'écriture, sur une carte qui lui est assignée : sa réponse est appliquée", async () => {
  const { github } = client("lea", ["lea"]);
  assert.deepEqual(await github.labelsPosesParDeConfiance?.(7), ["de-lea"]);
});

test("le même login sur une carte assignée à un autre : ignoré", async () => {
  const { github } = client("max", ["lea"]);
  assert.deepEqual(await github.labelsPosesParDeConfiance?.(7), []);
});

test("un login non déclaré sans l'écriture : ignoré, comme avant, sans lire la carte", async () => {
  const { github, chemins } = client("intrus", ["intrus"]);
  assert.deepEqual(await github.labelsPosesParDeConfiance?.(7), []);
  assert.ok(!chemins.includes(`repos/${DEPOT}/issues/7`));
});

test("un membre de confiance (#2619) : appliqué comme avant, déclaré ou non, sans lire la carte", async () => {
  const { github, chemins } = client("lea", ["chef", "lea"], []);
  assert.deepEqual(await github.labelsPosesParDeConfiance?.(7), ["de-chef"]);
  assert.ok(!chemins.includes(`repos/${DEPOT}/issues/7`));
});

test("la règle seule : déclaré et assigné, la casse du login ne compte pas ; sinon, rien", async () => {
  const assignes = (logins: string[]) => async () => logins;
  assert.equal(await reponseDUnHumainDeclare("Lea", HUMAINS, assignes(["lea"])), true);
  assert.equal(await reponseDUnHumainDeclare("lea", HUMAINS, assignes(["max"])), false);
  assert.equal(await reponseDUnHumainDeclare("intrus", HUMAINS, assignes(["intrus"])), false);
  assert.equal(await reponseDUnHumainDeclare("lea", [], assignes(["lea"])), false);
});
