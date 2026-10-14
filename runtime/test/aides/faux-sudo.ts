// La doublure de `sudo` (`faux-sudo.sh`), pour le geste de mise en service
// que le runtime lance : liée sous un `bin` que le test met en tête du `PATH`
// du runtime, elle note ce qu'elle a reçu à chaque lancement et joue un scénario.
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { repertoireTemporaire } from "../outils.ts";

const FAUX_SUDO = join(import.meta.dirname, "faux-sudo.sh");

// Ce qu'elle a reçu à chaque lancement, et le scénario qu'elle joue.
export function fauxSudo(t: TestContext, scenario = "rend 0") {
  const racine = repertoireTemporaire(t);
  for (const repertoire of ["bin", "temoin"]) mkdirSync(join(racine, repertoire));
  symlinkSync(FAUX_SUDO, join(racine, "bin/sudo"));
  const regler = (joue: string) => writeFileSync(join(racine, "scenario"), `${joue}\n`);
  regler(scenario);
  // Les lignes qu'elle écrit, mot pour mot, avant de sortir en `fin` — ou
  // d'attendre qu'on la libère.
  const dire = (fin: number | "attend", lignes: string[]) => {
    writeFileSync(join(racine, "sortie"), `${lignes.join("\n")}\n`);
    regler(`dit ${fin}`);
  };
  const pids = () => (existsSync(join(racine, "temoin/ordre")) ? readFileSync(join(racine, "temoin/ordre"), "utf8").split("\n").slice(0, -1) : []);
  const liberer = () => writeFileSync(join(racine, "feu"), "");
  return {
    env: { PATH: `${join(racine, "bin")}:${process.env.PATH ?? ""}` },
    regler,
    dire,
    // Une doublure qui attend encore ne survit pas au test. À jouer une fois le
    // runtime arrêté : il n'a plus rien à écrire de ce qu'elle rend.
    finir() {
      liberer();
      for (const pid of pids()) {
        try {
          process.kill(Number(pid), "SIGKILL");
        } catch {
          // Déjà sortie.
        }
      }
    },
    // Laisse finir une doublure qui joue « attend ».
    liberer,
    // Retient de nouveau les suivantes, après un `liberer`.
    retenir: () => rmSync(join(racine, "feu"), { force: true }),
    // Chaque lancement, dans l'ordre : son pid, qui l'a lancé, son groupe de
    // process, ses arguments, les noms de ce qu'il a reçu d'environnement.
    lancements: () =>
      pids().map((pid) => {
        const [parent = "", groupe = "", combien = "0", ...suite] = readFileSync(join(racine, "temoin", pid), "utf8").split("\0").slice(0, -1);
        return { pid: Number(pid), parent: Number(parent), groupe: Number(groupe), args: suite.slice(0, Number(combien)), env: suite.slice(Number(combien)).map((affectation) => affectation.split("=", 1)[0] ?? "") };
      }),
  };
}
