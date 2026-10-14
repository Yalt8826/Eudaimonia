# Release signing key — custody notes

`eudaimonia-release.keystore` (alias `eudaimonia`, RSA 4096, validity
10,000 days) signs the M5 release APK. It and `keystore.properties` are
**gitignored** — this directory travels with the machine, not the repo.

- Read the cert fingerprint (record the LOCATION of the fingerprint, not
  the value, per P6 T2.2):
  `~/.jdks/jdk-21*/bin/keytool -list -v -keystore eudaimonia-release.keystore`
  or `apksigner verify --print-certs` on any APK this key signed. The
  fingerprint measured 2026-10-14 is in `renders/M5-MEASUREMENTS.md`.
- Off-box backup of BOTH files (keystore + properties) is STILL OWED —
  the P6 T6.2 custody step (vault + one off-box copy, rehearsed restore)
  was superseded before running and has not been done since. Losing this
  key means the installed base can never be updated in place.
- The signing wiring is `mobile/plugins/withReleaseSigning.js` (CNG — the
  keystore is never referenced from a hand-edited gradle file).
