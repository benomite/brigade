// Un worktree ne survit pas à la fermeture de son ticket, par quelque voie qu'elle soit (#4658).
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { removeWorktreesOfClosedTickets, ticketOfWorktree } from "../src/station/closed-worktrees.ts";
import { repertoireTemporaire } from "./outils.ts";

test("le ticket d'un worktree se lit de son nom, une PR externe n'en a pas (#4658)", () => {
  assert.equal(ticketOfWorktree("4658-github"), 4658);
  assert.equal(ticketOfWorktree("gates-12-github"), 12);
  assert.equal(ticketOfWorktree("attente-longue-7-github"), 7);
  assert.equal(ticketOfWorktree("review-pr-9-github"), null);
  assert.equal(ticketOfWorktree("gates-pr-9-github"), null);
  assert.equal(ticketOfWorktree("essais"), null);
});

test("worktrees/ ne garde que les worktrees des tickets ouverts (#4658)", async (t) => {
  const dossier = join(repertoireTemporaire(t), "worktrees");
  const noms = ["1-github", "2-github", "3-github", "4-github", "gates-2-github", "review-pr-2-github", "essais"];
  for (const nom of noms) mkdirSync(join(dossier, nom, "node_modules"), { recursive: true });
  const fermes = new Set([2, 3, 4]);
  const retires: string[] = [];
  const dits: string[] = [];
  const faits = await removeWorktreesOfClosedTickets({
    dossier,
    ferme: async (ticket) => {
      if (ticket === 4) throw new Error("GitHub illisible");
      return fermes.has(ticket);
    },
    enCuisine: (ticket) => ticket === 3,
    retirer: (chemin) => {
      retires.push(chemin);
      if (chemin.endsWith("gates-2-github")) throw new Error("git ne le connaît plus");
    },
    avertir: (m) => dits.push(m),
  });
  // 1 ouvert, 3 en cuisine, 4 illisible, une PR externe et `essais` ne sont pas à lui.
  assert.deepEqual(readdirSync(dossier).sort(), ["1-github", "3-github", "4-github", "essais", "review-pr-2-github"]);
  assert.deepEqual(faits.map((c) => c.slice(dossier.length + 1)).sort(), ["2-github", "gates-2-github"]);
  assert.equal(retires.length, 2);
  assert.equal(dits.length, 1);
  assert.match(dits[0] ?? "", /4-github/);
});

test("un dossier de worktrees absent n'est pas une erreur (#4658)", async (t) => {
  const faits = await removeWorktreesOfClosedTickets({ dossier: join(repertoireTemporaire(t), "absent"), ferme: async () => true, enCuisine: () => false, retirer: () => {} });
  assert.deepEqual(faits, []);
  assert.ok(!existsSync(join(repertoireTemporaire(t), "absent")));
});

test("l'unité de la station a son /tmp, et chaque mise à jour la redémarre (#4658)", () => {
  const unite = readFileSync(new URL("../paquet/systemd/brigade-station.service", import.meta.url), "utf8");
  assert.match(unite, /^PrivateTmp=yes$/m);
  // The .deb is a bridge now: the archive's install.sh is what restarts the units, on every install.
  const installer = readFileSync(new URL("../archive/install.sh", import.meta.url), "utf8");
  assert.match(installer, /systemctl restart brigade-station-porte\.service brigade-station\.service/);
});
