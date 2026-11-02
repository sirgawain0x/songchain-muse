# Dependency review — November 2, 2026

TL;DR: The lockfile installs and the application has automated checks, but dependency audit findings remain unresolved. This is a testnet pilot, not a security-cleared production release. Do not infer exploitability or safety from the package counts alone.

A fresh `npm ci` followed by `npm audit --json` reported **35 affected packages: 16 high and 19 moderate, with no critical findings**. The installation summary had a different count; the separate audit result is recorded here. Counts include parent packages affected through dependencies and are not 35 distinct vulnerabilities. Rerun the audit because advisory data changes.

The findings trace to three advisory groups:

- [Zod collection memory exhaustion](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5): the application directly installs Zod 4.6.7, beyond the advisory's 4.6.6 patch. Wallet-related dependencies still install Zod 3.x. The audit propagates these findings through Privy, wallet connectors and their dependencies.
- [UUID buffer bounds checking](https://github.com/advisories/GHSA-w5hq-g745-h8pq): older UUID versions remain in MetaMask-related dependency paths.
- [Minimatch pattern amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249): the C2PA package's archive tooling pulls an older Minimatch version through Unzipper, Fstream, Rimraf and Glob.

The audit does not offer a complete compatible automatic fix. No forced major-version overrides were applied: replacing validation, wallet or archive dependencies across major versions needs compatibility work and regression checks. Tests passing does not establish whether these advisory conditions are reachable in this application.

Before production, upgrade the affected upstream SDKs or apply verified compatible patches, check the relevant input and archive paths, rerun the audit and repeat authentication, upload/provenance and chain-operation verification. No mainnet payments or rewards are demonstrated by this release.
