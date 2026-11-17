"""Les cas des fixtures : python3 -I scripts/mesure-temps-servi/test_mesure.py"""
import json, os, subprocess, sys, tempfile, unittest

ICI = os.path.dirname(os.path.abspath(__file__))
F = os.path.join(ICI, "fixtures")
COUPURE = "2026-11-16T22:06:47Z"


def lance(*temps, coupure=COUPURE):
    r = subprocess.run([sys.executable, "-I", os.path.join(ICI, "mesure.py"), "--coupure", coupure, "--temps", *temps],
                       capture_output=True, text=True)
    return r.returncode, r.stdout.strip().splitlines(), r.stderr


class Mesure(unittest.TestCase):
    def test_dans_les_10(self):
        code, lignes, err = lance(F + "/servis-dans-10.json")
        self.assertEqual(code, 0)
        self.assertEqual(lignes, [
            "before     5 tickets  median 100.0 min  mean 100.0 min",
            "after      5 tickets  median 105.0 min  mean 108.0 min",
            "change median +5.0 %  within 10 %",
            "change mean   +8.0 %  within 10 %",
            "within 10 %",
        ])
        self.assertIn("1 enregistrement(s) ecarte(s)", err)

    def test_au_dela_des_10(self):
        code, lignes, _ = lance(F + "/servis-au-dela-10.json")
        self.assertEqual(code, 1)
        self.assertEqual(lignes[2:], ["change median +20.0 %  over 10 %", "change mean   +26.0 %  over 10 %", "over 10 %"])

    def test_decalage_horaire(self):
        self.assertEqual(lance(F + "/servis-dans-10.json", coupure="2026-11-16T23:06:47+01:00")[:2], lance(F + "/servis-dans-10.json")[:2])

    def test_ensemble_vide_refuse(self):
        code, lignes, err = lance(F + "/servis-dans-10.json", coupure="2026-01-01T00:00:00Z")
        self.assertEqual((code, lignes), (2, []))
        self.assertIn("aucun ticket servi dans l'ensemble before", err)

    def test_fichier_illisible_refuse(self):
        with tempfile.TemporaryDirectory() as d:
            casse = os.path.join(d, "temps-tickets.json")
            with open(casse, "w") as f:
                f.write("{ pas du json")
            code, lignes, err = lance(F + "/servis-dans-10.json", casse)
            self.assertEqual((code, lignes), (2, []))
            self.assertIn("illisible", err)
            code, _, err = lance(os.path.join(d, "absent.json"))
            self.assertEqual(code, 2)
            with open(casse, "w") as f:
                json.dump({"resume": {}}, f)
            code, _, err = lance(casse)
            self.assertEqual(code, 2)
            self.assertIn("ni un tableau", err)


if __name__ == "__main__":
    unittest.main()
