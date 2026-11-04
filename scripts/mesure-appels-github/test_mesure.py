"""Les cas des fixtures : python3 -I scripts/mesure-appels-github/test_mesure.py"""
import os, subprocess, sys, unittest

ICI = os.path.dirname(os.path.abspath(__file__))
F = os.path.join(ICI, "fixtures")


def lance(*args, debut="2026-11-05T00:00:00Z"):
    r = subprocess.run([sys.executable, "-I", os.path.join(ICI, "mesure.py"), "--debut", debut,
                        "--base-fichier", os.path.join(F, "base.txt"), *args],
                       capture_output=True, text=True)
    return r.returncode, r.stdout.strip().splitlines()[-1:] , r.stderr


class Mesure(unittest.TestCase):
    def test_85_pass(self):
        self.assertEqual(lance("--appels", F + "/reduction-85.jsonl", "--limites", F + "/limites-vide.jsonl")[:2], (0, ["PASS"]))

    def test_70_fail(self):
        self.assertEqual(lance("--appels", F + "/reduction-70.jsonl", "--limites", F + "/limites-vide.jsonl")[:2], (1, ["FAIL"]))

    def test_une_minute_limitee_fail(self):
        self.assertEqual(lance("--appels", F + "/reduction-85.jsonl", "--limites", F + "/limites-une-minute.jsonl")[:2], (1, ["FAIL"]))

    def test_source_trop_courte_refusee(self):
        code, _, err = lance("--appels", F + "/reduction-85-courte.jsonl")
        self.assertEqual(code, 2)
        self.assertIn("source insuffisante", err)

    def test_decalage_negatif(self):
        code, _, _ = lance("--appels", F + "/reduction-85.jsonl", debut="2026-11-04T19:00:00-05:00")
        self.assertEqual(code, 0)


if __name__ == "__main__":
    unittest.main()
