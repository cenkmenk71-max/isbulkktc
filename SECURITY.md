# Security Policy

## Supported versions

This repository does not define independently supported semantic-version
release lines. Security fixes are made against the maintained `main` branch.
Older branches, forks and detached commit snapshots have no security-update
guarantee.

| Branch / line | Security updates |
| --- | --- |
| `main` | Yes |
| Other branches / snapshots | No guarantee |

## Reporting a vulnerability

**Do not disclose suspected vulnerabilities in a public issue, discussion or
pull request.**

1. Open the repository's **Security** tab and use **Report a vulnerability**
   to create a private vulnerability report, when that control is available.
2. If private vulnerability reporting is unavailable, contact the maintainer
   through the GitHub profile and request a private disclosure channel. Do not
   post exploit details publicly while arranging that channel.
3. Include the affected commit or deployment (if known), affected route/file,
   prerequisites, reproducible steps, expected and observed behaviour, and a
   minimal proof of concept. Redact credentials, tokens, personal data and
   production customer information.

The project does not publish a guaranteed acknowledgement or remediation SLA.
The maintainer will assess severity and coordinate a fix and disclosure
timeline privately. Please do not test against other people's accounts or
data, and do not perform destructive or denial-of-service testing.
