# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

We take the security of Universal AI Agent Bridge seriously. If you discover a security vulnerability, please do not open a public GitHub issue.

Please contact the maintainers directly or use [GitHub Private Vulnerability Reporting](https://github.com/libragik/universal-llm-bridge/security/advisories/new).

## Security Principles of UAAB

- **100% Local Execution**: UAAB communicates locally over stdio JSON-RPC.
- **Zero Intermediary Telemetry**: No tracking servers, telemetry beacons, or third-party loggers.
- **Direct Connection**: HTTPS requests go directly from your local machine to the designated `/v1` endpoint.
- **Secrets Isolation**: `llm_providers.json` is automatically excluded from version control via `.gitignore`.
