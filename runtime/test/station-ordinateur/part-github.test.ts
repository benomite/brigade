// Un projet au-delà de sa part GitHub ne retient que lui-même sur la station de
// l'ordinateur (#3705). Le 2026-11-16 à 07:48 UTC, brigade avait fait sa part de
// l'heure : son tour attendait dans la file, et la station, qui attendait ce
// tour avant de passer au suivant, ne servait plus aucun projet — secondes ne
// prenait pas #50. Ici, deux projets de la même station : celui qui est sous sa
// part prend son ticket, celui qui l'a faite ne prend rien jusqu'à ce que sa part
// le laisse repartir, puis reprend ; le journal de la station dit, pour lui seul,
// qu'il est retenu par sa part et à quelle heure il reprend.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { PART_D_UN_PROJET } from "../../src/budget-github/part-des-projets.ts";
import { etiquetteDe, ouvrirLimite, prendreUnAppel } from "../../src/limite-github.ts";
import { lieuxDuProjet } from "../../src/station/configuration.ts";
import { ajouterProjetServi } from "../../src/station-ordinateur/projets-servis.ts";
import { ouvrirLeService, type ProjetAServir } from "../../src/station-ordinateur/servir.ts";
import { ENV_GIT, jusqua, repertoireTemporaire } from "../outils.ts";

const STATION = "mac/claude";
const lectureDe = (projet: string) => etiquetteDe([`repos/benomite/${projet}/issues`], { projet });

test("two projects on one station: the one under its GitHub share takes its ready ticket, the one over it alone is held until its share allows it, then resumes", async (t) => {
  const racine = repertoireTemporaire(t);
  for (const depot of ["benomite/brigade", "benomite/secondes"]) {
    ajouterProjetServi(racine, depot);
    const { clone } = lieuxDuProjet(racine, depot.split("/")[1]!, racine);
    mkdirSync(join(clone, ".git"), { recursive: true });
    writeFileSync(join(clone, "CLAUDE.md"), "- **Branche d'intégration** : `main`\n");
  }

  // brigade fait sa part de l'heure à partir de 06:52 UTC : elle le laisse repartir à 07:52 UTC.
  const debut = Date.UTC(2026, 10, 16, 6, 52, 0);
  const h = { instant: debut };
  const maintenant = () => h.instant;
  const limite = ouvrirLimite({ maintenant, alerter: () => {} });
  for (let i = 0; i < PART_D_UN_PROJET; i++) {
    h.instant += 200;
    limite.prendre("cuisine", undefined, lectureDe("brigade"));
  }
  h.instant = Date.UTC(2026, 10, 16, 7, 48, 0);

  // Le réveil de la file, que le test sonne quand il avance l'horloge.
  const reveils: Array<() => void> = [];
  const attendre = () => new Promise<void>((sonner) => reveils.push(sonner));
  // Le tour d'un projet : un appel GitHub sous le compteur, puis la prise de son ticket prêt.
  const prets: Record<string, number> = { brigade: 3700, secondes: 50 };
  const prises: string[] = [];
  const ouvrirLeTour = (projet: ProjetAServir) => ({
    tour: async () => {
      await prendreUnAppel(limite, { gh: "gh", etiquette: lectureDe(projet.nom), maintenant, attendre });
      prises.push(`${projet.nom} #${prets[projet.nom]}`);
    },
    enCuisine: () => [],
    calme: async () => {},
  });
  const dits: string[] = [];
  const service = ouvrirLeService({ racine, station: STATION, env: ENV_GIT, maison: racine, gh: "gh-absent", claude: "claude-absent", dire: (ligne) => dits.push(ligne), ouvrirLeTour });

  // 07:48 UTC : secondes prend #50 ; brigade ne prend rien, et le journal dit jusqu'à quand.
  let fini = false;
  void service.tourner().then(() => (fini = true));
  await jusqua(() => fini, 1500);
  assert.deepEqual(prises, ["secondes #50"]);
  const tours = (depot: string) => dits.filter((ligne) => ligne.includes(`GitHub-only turn on ${depot}`));
  assert.deepEqual(tours("benomite/brigade"), [`brigade : station ${STATION} — GitHub-only turn on benomite/brigade — held back for its GitHub share, resumes at 07:52 UTC`]);
  assert.deepEqual(tours("benomite/secondes"), [`brigade : station ${STATION} — GitHub-only turn on benomite/secondes: no ticket cooking here`]);

  // Le tour suivant : brigade attend toujours sa part — son appel n'a pas été compté —, secondes reprend son ticket.
  await service.tourner();
  assert.equal(limite.repartition().parProjet.find(({ nom }) => nom === "brigade")?.appels, PART_D_UN_PROJET);
  assert.deepEqual(prises, ["secondes #50", "secondes #50"]);

  // 08:00 UTC : les appels de brigade sont sortis de l'heure, son tour finit et prend son ticket.
  h.instant = Date.UTC(2026, 10, 16, 8, 0, 0);
  for (const sonner of reveils.splice(0)) sonner();
  await jusqua(() => prises.includes("brigade #3700"), 1500);
  assert.equal(tours("benomite/brigade").at(-1), `brigade : station ${STATION} — GitHub-only turn on benomite/brigade: no ticket cooking here`);
  await service.tourner();
  assert.deepEqual(prises, ["secondes #50", "secondes #50", "brigade #3700", "brigade #3700", "secondes #50"]);
  assert.equal(dits.filter((ligne) => ligne.includes("held back")).length, 1);

  await service.arreter();
  limite.fermer();
});
