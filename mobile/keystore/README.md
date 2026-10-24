# Release signing key — custody notes

`eudaimonia-release.keystore` (alias `eudaimonia`, RSA 4096, validity
10,000 days) signs the M5 release APK. It and `keystore.properties` are
**gitignored** — this directory travels with the machine, not the repo.

- Read the cert fingerprint (record the LOCATION of the fingerprint, not
  the value, per P6 T2.2):
  `~/.jdks/jdk-21*/bin/keytool -list -v -keystore eudaimonia-release.keystore`
  or `apksigner verify --print-certs` on any APK this key signed. The
  fingerprint measured 2026-10-14 is in `renders/M5-MEASUREMENTS.md`.
- Off-box copy (2026-10-24): BOTH files live on olympus at
  `/srv/data/vaults/main/.eudaimonia-keystore-backup/` (mode 600),
  sha256-verified against this machine at copy time. STILL OWED for full
  P6 T6.2 custody: one copy on a THIRD machine/site (athena and olympus
  share a house), and one rehearsed restore drill.
- The signing wiring is `mobile/plugins/withReleaseSigning.js` (CNG — the
  keystore is never referenced from a hand-edited gradle file).
