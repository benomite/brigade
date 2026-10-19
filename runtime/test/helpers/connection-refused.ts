// Le refus d'une connexion, joué : ce que rend le système quand personne
// n'écoute. Un port ouvert puis fermé n'en est pas la preuve — sous Linux, le
// noyau peut le redonner aussitôt à un voisin qui écoute sur le port 0, et
// c'est lui qui répondrait.
import { Socket } from "node:net";

export function connexionRefusee(hote: string, port: number): Socket {
  return new Socket().destroy(Object.assign(new Error(`connect ECONNREFUSED ${hote}:${port}`), { code: "ECONNREFUSED" }));
}
