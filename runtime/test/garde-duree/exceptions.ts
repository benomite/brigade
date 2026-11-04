// Les fautes d'aujourd'hui contre la règle des 2 s (#2129) : une ligne par fautif, avec son fichier. Un ticket
// suivant la vide ; en attendant, la règle ne bloque que ce qui s'y ajoute. Une ligne dont la faute a disparu
// (test retiré, garde ramenée à 2 s) fait échouer le test : retire-la.
//
//   { file, test }   un test mesuré à plus de 2 s, ou de plus de 0,7 s sous forte charge (son titre, tel que le lanceur le donne)
//   { file, garde }  une garde écrite à plus de 2 s : `jusqua(…, <délai>)` ou `<nom>: <délai>` (timeout, délai, plafond, garde)
import type { Exception } from "./regle.ts";

export const EXCEPTIONS: Exception[] = [
  { file: "test/paquet/paquet.test.ts", test: "le runtime du paquet démarre la station et ses portes telles que leurs unités les lancent — la station filtrée, ses portes non" },
  { file: "test/sauvegarde.test.ts", test: "restaurée sur une machine neuve, la sauvegarde d'un runtime en marche rend un runtime qui redémarre et relit ce qu'il avait servi" },
  { file: "test/station.test.ts", test: "un cook inerte après son commit est arrêté par l'inactivité, et son travail récolté" },
  { file: "test/telephone/gestes.test.ts", test: "après un geste du téléphone, la file que l'ordinateur lit a changé : #15 retiré n'est plus sur le rail, #16 revenu de WAITING repart en cuisine" },
  { file: "test/telephones.test.ts", test: "le chef que la règle sudoers nomme tire un code et son QR, lit son état, liste les téléphones appairés et en révoque un — dans le registre de la station" },
  { file: "test/deploy/installer-station-windows.test.ts", test: "la première fois : le runtime publié, son node vérifié, le lanceur écrit et démarré, puis les deux connexions" },
  { file: "test/deploy/installer-station-windows.test.ts", test: "ce qui démarre à l'ouverture de session lance la station sous le compte, avec tout ce qu'il lui faut — rien n'est à écrire à la main" },
  { file: "test/deploy/installer-station-windows.test.ts", test: "rejouée sur une version plus récente : la station est arrêtée, son runtime remplacé, et elle est relancée sur lui" },
  { file: "test/deploy/installer-station-windows.test.ts", test: "un node dont l'empreinte n'est pas celle publiée n'est pas posé, et rien n'est lancé ni écrit au registre" },
  { file: "test/deploy/installer-station-windows.test.ts", test: "ce qui manque est posé : git et gh par winget, claude par son installeur officiel — puis les connexions" },
  { file: "test/deploy/installer-station-windows.test.ts", test: "sans winget, un outil qui manque est nommé, avec où le prendre, et rien n'est installé" },
  { file: "test/deploy/installer-station-windows.test.ts", test: "une connexion GitHub ratée est dite, et la connexion Claude n'est pas tentée" },
  { file: "test/deploy/installer-station-windows.test.ts", test: "une connexion Claude ratée est dite, avec de quoi la reprendre : rejouer la même commande" },
  { file: "test/deploy/installer-station-windows.test.ts", test: "ailleurs que sous Windows, sur une architecture sans node, ou sans curl.exe : refusé avant tout téléchargement" },
  { file: "test/deploy/installer-station-windows.test.ts", test: "il ne double pas la station que l'app tient : il attend qu'elle la rende" },
  { file: "test/deploy/installer-station-windows.test.ts", test: "une station tombée est relancée cinq secondes plus tard" },
  { file: "test/deploy/installer-station-windows.test.ts", test: "une station qui refuse de démarrer (code 2) n'est pas relancée, et rend son répertoire" },
  { file: "test/deploy/installer-station-windows.test.ts", test: "pour la même version publiée : même point d'entrée, même runtime, même répertoire, même node, mêmes connexions" },
];
