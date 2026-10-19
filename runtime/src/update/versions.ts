// L'ordre des versions de la station : celui de dpkg, puisque c'est dpkg qui
// les installe. Comparées ici sans lancer `dpkg --compare-versions` : la
// station choisit la plus récente des versions publiées, et c'est la même
// règle que dpkg appliquerait (`deb-version(7)`).
//
// Une version : `[époque:]amont[-révision]`. Chaque partie se compare par
// tranches — des non-chiffres, puis un nombre —, où `~` passe avant tout, même
// avant la fin, et les lettres avant les autres signes.

// Le rang d'un caractère dans une tranche de non-chiffres.
function rang(caractere: string | undefined): number {
  if (caractere === undefined) return 0;
  if (caractere === "~") return -1;
  if (/[A-Za-z]/.test(caractere)) return caractere.charCodeAt(0);
  return caractere.charCodeAt(0) + 256;
}

function comparerPartie(a: string, b: string): number {
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    // Les non-chiffres, caractère par caractère.
    while ((i < a.length && !/\d/.test(a[i] ?? "")) || (j < b.length && !/\d/.test(b[j] ?? ""))) {
      const ra = i < a.length && !/\d/.test(a[i] ?? "") ? rang(a[i]) : 0;
      const rb = j < b.length && !/\d/.test(b[j] ?? "") ? rang(b[j]) : 0;
      if (ra !== rb) return ra < rb ? -1 : 1;
      if (i < a.length && !/\d/.test(a[i] ?? "")) i++;
      if (j < b.length && !/\d/.test(b[j] ?? "")) j++;
    }
    // Puis un nombre, sans ses zéros de tête.
    let na = "";
    let nb = "";
    while (i < a.length && /\d/.test(a[i] ?? "")) na += a[i++];
    while (j < b.length && /\d/.test(b[j] ?? "")) nb += b[j++];
    na = na.replace(/^0+/, "");
    nb = nb.replace(/^0+/, "");
    if (na.length !== nb.length) return na.length < nb.length ? -1 : 1;
    if (na !== nb) return na < nb ? -1 : 1;
  }
  return 0;
}

function decouper(version: string): { epoque: number; amont: string; revision: string } {
  const deuxPoints = version.indexOf(":");
  const epoque = deuxPoints === -1 ? 0 : Number(version.slice(0, deuxPoints)) || 0;
  const reste = deuxPoints === -1 ? version : version.slice(deuxPoints + 1);
  const tiret = reste.lastIndexOf("-");
  return tiret === -1 ? { epoque, amont: reste, revision: "" } : { epoque, amont: reste.slice(0, tiret), revision: reste.slice(tiret + 1) };
}

// Négatif si `a` passe avant `b`, positif après, zéro si dpkg les tient pour
// la même version.
export function comparerVersions(a: string, b: string): number {
  const va = decouper(a);
  const vb = decouper(b);
  if (va.epoque !== vb.epoque) return va.epoque < vb.epoque ? -1 : 1;
  return comparerPartie(va.amont, vb.amont) || comparerPartie(va.revision, vb.revision);
}

// Ce que dpkg accepte d'une version sans révision — ce que la construction du
// paquet accepte aussi. Une version publiée qui n'y répond pas est ignorée.
export const VERSION = /^[0-9][A-Za-z0-9.+~]*$/;
