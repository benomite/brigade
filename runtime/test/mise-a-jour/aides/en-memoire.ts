// Une machine tenue en mémoire, telle que la mise à jour la touche : le paquet
// installé est noté, et la station « démarre » sur chaque version installée en
// écrivant ce qu'elle dit d'elle-même, comme la vraie (`en-service.ts`). Et un
// passage de la mise à jour sur elle, la garde sur une horloge d'essai : rien
// n'y attend en vrai.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { annoncerEnService } from "../../../src/mise-a-jour/en-service.ts";
import { passer, type Passage } from "../../../src/mise-a-jour/mettre-a-jour.ts";
import type { Publication, Publications } from "../../../src/mise-a-jour/publications.ts";
import type { Systeme } from "../../../src/mise-a-jour/systeme.ts";
import { repertoireTemporaire } from "../../outils.ts";

// Ce que fait la station relancée sur une version : elle se dit en service en
// servant ces projets — ou elle tombe, ou elle tourne sans rien dire.
export type Demarrage = { servis: string[]; refuses?: Record<string, string> } | "tombe" | "muette";

export type MachineEnMemoire = ReturnType<typeof machineEnMemoire>;

// Une machine où `version` est installée et tourne. Un paquet est un fichier
// qui dit ce qu'il est : « brigade-station 1.1.0 ».
export function machineEnMemoire(t: TestContext, version: string, demarrage: (version: string) => Demarrage = () => ({ servis: [] })) {
  let installee: string | null = version;
  const racine = repertoireTemporaire(t);
  const dossier = join(repertoireTemporaire(t), "mise-a-jour");
  const installations: string[] = [];
  let pid = 100;
  let actif = "active";
  let refus: string | null = null;
  const demarrer = (version: string) => {
    pid++;
    const quoi = demarrage(version);
    if (quoi === "tombe") return void (actif = "failed");
    actif = "active";
    if (quoi === "muette") return;
    const arreter = annoncerEnService(racine, () => ({ servis: quoi.servis, refuses: quoi.refuses ?? {} }), { version, pid });
    arreter();
  };
  demarrer(version);
  const systeme: Systeme = {
    installee: () => installee,
    lirePaquet: (fichier) => {
      const [paquet = "", version = ""] = readFileSync(fichier, "utf8").split(" ");
      return { paquet, version };
    },
    installer: (fichier) => {
      const { version } = systeme.lirePaquet(fichier) ?? { version: "" };
      installations.push(version);
      if (refus !== null) return { ok: false, motif: refus };
      installee = version;
      demarrer(version);
      return { ok: true };
    },
    service: () => ({ actif, pid: actif === "active" ? pid : 0, redemarrages: 0 }),
  };
  return {
    t,
    racine,
    dossier,
    systeme,
    installations,
    refuserLesInstallations: (motif: string | null) => void (refus = motif),
    // Ce que dpkg dit du paquet, sans rien installer : nul s'il est à moitié posé.
    dpkg: (version: string | null) => void (installee = version),
    reglages: (texte: string) => writeFileSync(join(racine, "reglages"), texte),
    configurer: (texte: string) => writeFileSync(join(racine, "projets"), texte),
  };
}

// Des versions publiées, chacune avec son paquet : un fichier qui dit ce qu'il est.
export function publiees(versions: string[], options: { illisibles?: string; autrePaquet?: string } = {}): Publications & { telecharges: string[] } {
  const telecharges: string[] = [];
  return {
    nom: "les publications d'essai",
    telecharges,
    async lister(): Promise<Publication[]> {
      if (options.illisibles) throw new Error(options.illisibles);
      return versions.map((version) => ({ version, paquet: `essai:${version}`, empreinte: null }));
    },
    async telecharger(publication, fichier) {
      telecharges.push(publication.version);
      writeFileSync(fichier, options.autrePaquet === publication.version ? `autre-chose ${publication.version}` : `brigade-station ${publication.version}`);
    },
  };
}

// Le temps laissé à la station pour se dire en service, et le pas entre deux
// regards : sur l'horloge d'essai, ils ne s'attendent pas.
const GARDE_D_ESSAI_MS = 2000;
const PAS_MS = 50;

// Un passage de la mise à jour sur la machine. L'heure et les pauses de la
// mise à jour sont celles d'une horloge d'essai (`mock.timers`), avancée d'un
// pas dès que le passage attend : une station qui ne se dit jamais en service
// épuise sa garde de 2 s en un instant.
export async function passage(m: MachineEnMemoire, publications: Publications, dites: string[] = []): Promise<Passage> {
  m.t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.now() });
  try {
    let fini = false;
    const rendu = passer({ racine: m.racine, dossier: m.dossier, systeme: m.systeme, publications, dire: (ligne) => dites.push(ligne), gardeMs: GARDE_D_ESSAI_MS, pasMs: PAS_MS });
    rendu.then(
      () => (fini = true),
      () => (fini = true),
    );
    // Ce que le passage avait à faire sans attendre est fait : l'horloge avance d'un pas.
    while (!fini) {
      await new Promise((resoudre) => setImmediate(resoudre));
      if (!fini) m.t.mock.timers.tick(PAS_MS);
    }
    return await rendu;
  } finally {
    m.t.mock.timers.reset();
  }
}
