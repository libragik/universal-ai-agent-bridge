# Contributing to Universal AI Agent Bridge (UAAB)

First off, thank you for considering contributing to UAAB! It's people like you that make UAAB a powerful tool for the global AI community.

## Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/libragik/universal-llm-bridge.git
   cd universal-llm-bridge
   ```

2. **No npm install needed**:
   UAAB is built with **zero external dependencies** using pure Node.js ESM. You only need Node.js `>= 18.0.0`.

3. **Verify tests & CLI**:
   ```bash
   node cli.mjs list
   node cli.mjs scan
   ```

## Pull Request Process

1. Fork the repo and create your branch from `main`.
2. Ensure any new tools follow the MCP standard schema format in `schemas/`.
3. Keep the zero-dependency architecture intact.
4. Update `README.md` if you are introducing new capabilities or providers.
5. Submit a Pull Request describing your changes.

## Code of Conduct

Be kind, respectful, and collaborative. We are building the future of open multi-agent connectivity together!
