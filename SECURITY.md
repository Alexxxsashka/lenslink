# Security

Do not put room links, controller keys, TURN credentials, recordings, or private camera screenshots in public issues. Report a security issue through the repository's private vulnerability reporting feature if enabled; otherwise ask the maintainer for a private reporting channel without disclosing the vulnerability publicly.

This is a browser camera beta, not a trusted identity or access-control service. Room links are bearer capabilities. A compromised signaling provider or leaked room capability can compromise session authenticity. See the README's trust model before use.

Supported version: latest `main` only. Dependencies should be reviewed with `npm audit`; browser/device compatibility must be tested on actual target devices.
