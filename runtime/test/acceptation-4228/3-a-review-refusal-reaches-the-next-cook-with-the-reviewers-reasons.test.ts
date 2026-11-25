// #4228, critère 3 : le brief du cook suivant une refusée par la relecture contient les raisons du relecteur — celles de la
// relecture, et celles du second juge, qui refuse une tête que la relecture a approuvée.
import assert from "node:assert/strict";
import { test } from "node:test";
import { briefDuRenvoi, lireLeRenvoi } from "../../src/brief-renvoi.ts";
import type { Commentaire } from "../../src/github.ts";
import { corpsDeVerdict } from "../../src/github-etat/fusion.ts";
import { corpsDuSecondJugement } from "../../src/second-juge.ts";

const SHA = "c".repeat(40);
const commentaire = (body: string, createdAt: string): Commentaire => ({ body, author: "brigade-pass", association: "OWNER", createdAt });

test("the brief of a cook sent back by a review refusal contains the reviewer's reasons, the second judge's included (#4228)", async () => {
  const relecture = corpsDeVerdict("box", SHA, { verdict: "request-changes", motif: "1. The guard in `runtime/src/a.ts` is inverted." });
  const seul = await lireLeRenvoi({ commentaires: async () => [commentaire(relecture, "2026-11-06T10:00:00Z")] }, { number: 99, sha: SHA }, [], "");
  assert.match(briefDuRenvoi(seul, "main"), /The guard in `runtime\/src\/a\.ts` is inverted\./);

  const approuvee = corpsDeVerdict("box", SHA, { verdict: "approve", motif: "" });
  const second = corpsDuSecondJugement("box", SHA, { verdict: "request-changes", motif: "The change to the gate skips the empty case, and no test says so." });
  const renvoi = await lireLeRenvoi({ commentaires: async () => [commentaire(approuvee, "2026-11-06T10:00:00Z"), commentaire(second, "2026-11-06T10:05:00Z")] }, { number: 99, sha: SHA }, [], "");
  assert.match(briefDuRenvoi(renvoi, "main"), /The change to the gate skips the empty case, and no test says so\./);
});
