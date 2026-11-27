// `redact` (#1974) : une catégorie, un test — et ce qui doit rester intact.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { redact } from "../../../src/report/redaction/redact.ts";

describe("redact", () => {
  test("token GitHub : ghp_ et github_pat_ disparaissent", () => {
    const ghp = `ghp_${"aB3dE5gH7jK9mN1pQ3sT5vX7zA9cE1gI3kM5"}`;
    assert.equal(ghp.length, 40);
    const pat = "github_pat_11ABCDEFG0abcdefghij_klmnopqrstuvwxyz0123456789";
    const output = redact(`push with ${ghp} and ${pat} failed`);
    assert.ok(!output.includes(ghp) && !output.includes("ghp_") && !output.includes("github_pat_"));
    assert.match(output, /^push with .* failed$/);
  });

  test("en-tête Bearer et Authorization : la valeur disparaît", () => {
    const a = redact("curl -H 'Bearer abc123.def456-ghi' x");
    assert.ok(!a.includes("abc123"));
    const b = redact("Authorization: token s3cr3tvalue\nnext line");
    assert.ok(!b.includes("s3cr3tvalue"));
    assert.ok(b.includes("next line"));
  });

  test("affectation KEY=value : le nom reste, la valeur disparaît", () => {
    for (const name of ["API_KEY", "GITHUB_TOKEN", "CLIENT_SECRET", "DB_PASSWORD"]) {
      const output = redact(`${name}=hunter2 started`);
      assert.ok(!output.includes("hunter2"), name);
      assert.ok(output.startsWith(`${name}=`), name);
      assert.ok(output.endsWith("started"), name);
    }
    assert.ok(!redact('PASSWORD="two words"').includes("words"));
  });

  test("bloc de clé privée : tout le bloc disparaît", () => {
    const block = "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXk\nAAAA\n-----END OPENSSH PRIVATE KEY-----";
    const output = redact(`before\n${block}\nafter`);
    assert.ok(!output.includes("b3BlbnNzaC1rZXk") && !output.includes("PRIVATE KEY"));
    assert.ok(output.includes("before") && output.includes("after"));
  });

  test("URL avec identifiants : l'utilisateur et le mot de passe disparaissent, l'hôte reste", () => {
    const output = redact("clone https://bob:pa55w0rd@github.com/o/r.git failed");
    assert.ok(!output.includes("bob") && !output.includes("pa55w0rd"));
    assert.ok(output.includes("github.com/o/r.git"));
    assert.ok(!redact("https://ghs_tokenonly@example.com/x").includes("tokenonly"));
  });

  test("chaîne longue à forte entropie : masquée", () => {
    const s = "Zx9Qm4Lp2Vb7Nc1Rt8Yd3Wf6Kh5Js0Ga";
    assert.ok(!redact(`id ${s} end`).includes(s));
  });

  test("chemin personnel : Linux, macOS, Windows", () => {
    const linux = redact("/home/alice/work/app/log.txt failed");
    assert.ok(linux.includes("~/work/app/log.txt") && !linux.includes("alice"));
    const mac = redact("/Users/alice/work/app/log.txt failed");
    assert.ok(mac.includes("~/work/app/log.txt") && !mac.includes("alice"));
    const win = redact("C:\\Users\\alice\\work\\app\\log.txt failed");
    assert.ok(win.includes("~\\work\\app\\log.txt") && !win.includes("alice"));
  });

  test("corps d'issue cité : retiré, ainsi que bloc de code et citation", () => {
    const issue = redact("fetched\nissue #12 body:\nsecret roadmap line\nsecond line\n\ndone");
    assert.ok(!issue.includes("roadmap") && !issue.includes("second line"));
    assert.ok(issue.includes("fetched") && issue.includes("done"));
    const citation = redact("log\n> customer data here\n> more\nend");
    assert.ok(!citation.includes("customer") && citation.includes("end"));
    const code = redact("see\n```ts\nconst x = privateCode();\n```\nok");
    assert.ok(!code.includes("privateCode") && code.includes("ok"));
  });

  test("texte ordinaire : inchangé", () => {
    for (const s of ["station build is red: exit code 1", "", "ticket #12 passed in 3 tries"]) assert.equal(redact(s), s);
  });

  test("idempotent", () => {
    const x = [
      "ghp_aB3dE5gH7jK9mN1pQ3sT5vX7zA9cE1gI3kM5",
      "Authorization: Bearer abc.def",
      "API_KEY=hunter2",
      "https://bob:pw@example.com/x",
      "/home/alice/a C:\\Users\\alice\\b /Users/alice/c",
      "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
      "issue #3 body:\nhello\n\n> quoted\n```\ncode\n```",
      "Zx9Qm4Lp2Vb7Nc1Rt8Yd3Wf6Kh5Js0Ga",
    ].join("\n");
    assert.equal(redact(redact(x)), redact(x));
  });
});
