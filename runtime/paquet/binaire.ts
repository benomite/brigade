// Pour quel système et quelle architecture un binaire `node` est fait, lu dans son en-tête :
// ELF (Linux) ou Mach-O (macOS). L'archive de la station refuse un node qui n'est pas celui de
// sa plateforme.
import { closeSync, openSync, readSync } from "node:fs";

export type Cible = { os: "linux" | "darwin"; arch: "x64" | "arm64" };

const ELF_MACHINES: Record<number, Cible["arch"]> = { 0x3e: "x64", 0xb7: "arm64" };
const MACHO_CPUS: Record<number, Cible["arch"]> = { 0x01000007: "x64", 0x0100000c: "arm64" };

export function cibleDuBinaire(chemin: string): Cible | undefined {
  const tete = Buffer.alloc(20);
  const fd = openSync(chemin, "r");
  try {
    readSync(fd, tete, 0, tete.length, 0);
  } finally {
    closeSync(fd);
  }
  // ELF 64 bits, petit-boutiste : e_machine à l'octet 18.
  if (tete.readUInt32BE(0) === 0x7f454c46 && tete[4] === 2 && tete[5] === 1) {
    const arch = ELF_MACHINES[tete.readUInt16LE(18)];
    return arch && { os: "linux", arch };
  }
  // Mach-O 64 bits, petit-boutiste (MH_MAGIC_64 lu à l'envers) : cputype à l'octet 4.
  if (tete.readUInt32LE(0) === 0xfeedfacf) {
    const arch = MACHO_CPUS[tete.readUInt32LE(4)];
    return arch && { os: "darwin", arch };
  }
  return undefined;
}
