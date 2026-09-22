#!/usr/bin/env bash
# macOS / Linux 1-Click Installer for Universal LLM Bridge (Google Antigravity Desktop)
set -e

echo "========================================================"
echo "  Universal LLM Bridge - Installer for Google Antigravity"
echo "========================================================"

if ! command -v node >/dev/null 2>&1; then
    echo "Error: Node.js is not installed. Please install Node.js (v18+) and retry."
    exit 1
fi

NODE_VER=$(node --version)
echo "[✔] Detected Node.js: $NODE_VER"

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
HOME_DIR="$HOME"

ANTIGRAVITY_DIR="$HOME_DIR/.gemini/antigravity"
MCP_SCHEMA_DIR="$ANTIGRAVITY_DIR/mcp/universal-llm-bridge"
SKILL_DIR="$HOME_DIR/.gemini/config/skills/universal-llm"
SERVER_INSTALL_DIR="$ANTIGRAVITY_DIR/mcp-servers/universal-llm-bridge"

mkdir -p "$MCP_SCHEMA_DIR" "$SKILL_DIR" "$SERVER_INSTALL_DIR"

echo "[*] Deploying server runtime files to $SERVER_INSTALL_DIR..."
cp "$SCRIPT_DIR/index.mjs" "$SERVER_INSTALL_DIR/"
cp "$SCRIPT_DIR/client.mjs" "$SERVER_INSTALL_DIR/"
cp "$SCRIPT_DIR/provider-vault.mjs" "$SERVER_INSTALL_DIR/"
cp "$SCRIPT_DIR/scanner.mjs" "$SERVER_INSTALL_DIR/"
cp "$SCRIPT_DIR/cli.mjs" "$SERVER_INSTALL_DIR/"
cp "$SCRIPT_DIR/package.json" "$SERVER_INSTALL_DIR/"
chmod +x "$SERVER_INSTALL_DIR/index.mjs" "$SERVER_INSTALL_DIR/cli.mjs"

echo "[*] Installing MCP tool schemas and Antigravity skill..."
cp -R "$SCRIPT_DIR/schemas/"* "$MCP_SCHEMA_DIR/"
cp "$SCRIPT_DIR/skill/SKILL.md" "$SKILL_DIR/SKILL.md"

VAULT_FILE="$ANTIGRAVITY_DIR/llm_providers.json"
if [ ! -f "$VAULT_FILE" ]; then
    echo "[*] Initializing providers vault with default template..."
    cp "$SCRIPT_DIR/config.example.json" "$VAULT_FILE"
fi

register_mcp() {
    local cfg_path="$1"
    local idx_path="$2"
    mkdir -p "$(dirname "$cfg_path")"
    node -e '
        const fs = require("fs");
        const cfgPath = process.argv[1];
        const idxPath = process.argv[2];
        let cfg = { mcpServers: {} };
        if (fs.existsSync(cfgPath)) {
            try { cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8")); } catch(e){}
        }
        cfg.mcpServers = cfg.mcpServers || {};
        cfg.mcpServers["universal-llm-bridge"] = {
            command: "node",
            args: [idxPath]
        };
        fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), "utf8");
    ' "$cfg_path" "$idx_path"
    echo "[✔] Registered in: $cfg_path"
}

register_mcp "$ANTIGRAVITY_DIR/mcp_config.json" "$SERVER_INSTALL_DIR/index.mjs"
register_mcp "$HOME_DIR/.gemini/config/mcp_config.json" "$SERVER_INSTALL_DIR/index.mjs"

# Create symlink for CLI if /usr/local/bin exists and is writable, or ~/.local/bin
if [ -d "$HOME/.local/bin" ]; then
    ln -sf "$SERVER_INSTALL_DIR/cli.mjs" "$HOME/.local/bin/agy-llm"
    echo "[✔] Symlinked agy-llm to ~/.local/bin/agy-llm"
fi

echo ""
echo "========================================================"
echo "  INSTALLATION COMPLETE!"
echo "========================================================"
echo "Restart Google Antigravity Desktop to load the bridge."
