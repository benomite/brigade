# Un pty pour les tests, là où node-pty n'est pas livré compilé (Linux) : lance
# ses arguments sur un terminal de 80 colonnes et 24 lignes, relaie son entrée
# vers ce terminal et ce qu'il affiche vers sa sortie. Arrêté, il ferme le
# terminal : ce qui y tournait reçoit SIGHUP, comme à la fermeture d'une vue.
#   python3 -I pty.py <commande> <arguments…>
import fcntl, os, pty, select, signal, struct, sys, termios

pid, maitre = pty.fork()
if pid == 0:
    fcntl.ioctl(sys.stdin.fileno(), termios.TIOCSWINSZ, struct.pack("HHHH", 24, 80, 0, 0))
    os.execvp(sys.argv[1], sys.argv[1:])

signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
entree = sys.stdin.fileno()
while True:
    lus, _, _ = select.select([maitre, entree], [], [])
    if maitre in lus:
        try:
            donnees = os.read(maitre, 65536)
        except OSError:
            break
        if not donnees:
            break
        os.write(1, donnees)
    if entree in lus:
        donnees = os.read(entree, 65536)
        if not donnees:
            break
        os.write(maitre, donnees)
_, statut = os.waitpid(pid, 0)
sys.exit(os.waitstatus_to_exitcode(statut) & 0xFF)
