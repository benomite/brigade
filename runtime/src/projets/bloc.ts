// Les lignes que l'app écrit dans la configuration de la station
// (`station/configuration.ts`), par la station : un bloc à part, entre deux
// commentaires, que la station réécrit seule. Ce qui est hors du bloc — les
// lignes que le chef a écrites à la main — n'est jamais touché.
export const DEBUT = "# — projets ajoutés depuis l'app : la station réécrit ce bloc seule, ne l'édite pas —";
export const FIN = "# — fin des projets ajoutés depuis l'app —";

// Le texte, coupé autour du bloc. Sans bloc, il est tout entier « avant ».
function couper(texte: string): { avant: string[]; dedans: string[]; apres: string[] } {
  const lignes = texte.split("\n");
  const debut = lignes.indexOf(DEBUT);
  const fin = debut === -1 ? -1 : lignes.indexOf(FIN, debut + 1);
  if (debut === -1) return { avant: lignes, dedans: [], apres: [] };
  // Un bloc sans fin court jusqu'au bout du fichier.
  const bout = fin === -1 ? lignes.length : fin;
  return { avant: lignes.slice(0, debut), dedans: lignes.slice(debut + 1, bout), apres: fin === -1 ? [] : lignes.slice(fin + 1) };
}

const utiles = (lignes: string[]) => lignes.map((ligne) => ligne.trim()).filter((ligne) => ligne !== "" && !ligne.startsWith("#"));

// Les lignes du bloc.
export const lignesDuBloc = (texte: string): string[] => utiles(couper(texte).dedans);

// Une ligne que l'app a mise de côté au lancement, parce qu'une autre station
// sert déjà le projet (#2110, `app/src/station-embarquee-cuisine-unique.ts`) :
// le commentaire garde la ligne telle quelle et nomme la station qui le sert.
const MISE_DE_COTE = /^# held-back \(served by (.+?)\): (.*)$/;
export type MiseDeCote = { ligne: string; station: string; dansLeBloc: boolean };

// Les projets mis de côté, dans le bloc ou hors du bloc, par nom. Une
// réécriture du bloc les garde : sans eux, un redémarrage de la station
// rouvrirait une seconde cuisine du projet à côté de celle de l'autre (#3703).
export function misesDeCote(texte: string): Map<string, MiseDeCote> {
  const { avant, dedans, apres } = couper(texte);
  const trouvees = new Map<string, MiseDeCote>();
  const lire = (lignes: string[], dansLeBloc: boolean) => {
    for (const brute of lignes) {
      const ligne = brute.trim();
      const lu = MISE_DE_COTE.exec(ligne);
      const nom = lu?.[2]?.split(/\s+/)[0];
      if (lu === null || nom === undefined || nom === "") continue;
      trouvees.set(nom, { ligne, station: lu[1]!, dansLeBloc });
    }
  };
  lire([...avant, ...apres], false);
  lire(dedans, true);
  return trouvees;
}

// Les lignes du bloc telles que la station les réécrit : celles qu'elle sert
// et celles que l'app a mises de côté, dans l'ordre du fichier.
export const lignesEcritesDuBloc = (texte: string): string[] =>
  couper(texte)
    .dedans.map((ligne) => ligne.trim())
    .filter((ligne) => ligne !== "" && (!ligne.startsWith("#") || MISE_DE_COTE.test(ligne)));

// Les noms de projet que le chef a écrits hors du bloc.
export const nomsHorsDuBloc = (texte: string): string[] => {
  const { avant, apres } = couper(texte);
  return utiles([...avant, ...apres]).map((ligne) => ligne.split(/\s+/)[0] ?? "");
};

// Le texte, son bloc réécrit avec ces lignes, à sa place. Sans ligne, le bloc
// disparaît ; sans bloc, il s'ajoute à la fin.
export function reecrireBloc(texte: string, lignes: string[]): string {
  const bloc = lignes.length === 0 ? [] : [DEBUT, ...lignes, FIN];
  if (texte.split("\n").includes(DEBUT)) {
    const { avant, apres } = couper(texte);
    // Le blanc qui le séparait des lignes à la main part avec lui.
    if (bloc.length === 0 && avant.at(-1) === "") avant.pop();
    const rendu = [...avant, ...bloc, ...apres].join("\n");
    return rendu.endsWith("\n") || rendu === "" ? rendu : `${rendu}\n`;
  }
  if (bloc.length === 0) return texte;
  const garde = texte.replace(/\n*$/, "");
  return `${garde}${garde === "" ? "" : "\n\n"}${bloc.join("\n")}\n`;
}
