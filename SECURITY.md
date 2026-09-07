# Security policy

## Reporting a vulnerability

Please do not report security vulnerabilities in a public issue.

Use [GitHub's private security advisory form](https://github.com/wvanderen/lem-reader/security/advisories/new) and include the affected surface, reproduction steps or a proof of concept, potential impact, and any suggested mitigation. You should receive an acknowledgement within seven days.

Please allow time for investigation and a coordinated fix before disclosing the issue publicly.

## Supported versions

Lem Reader is currently an active prototype rather than a versioned hosted service. Security fixes are applied to the latest code on the default branch; older commits and forks are not maintained.

## Security model

The canonical document model is the rendering boundary. Ingestion validates and sanitizes content before it reaches React, and the application does not use `dangerouslySetInnerHTML`. URL ingestion also rejects private and special-use network targets and applies redirect and size limits.

These controls reduce risk but do not make arbitrary documents trustworthy. Avoid importing sensitive material into an untrusted deployment, and review a deployment's hosting and retention policies before use.
