# Windows 1-Click Installer for Universal LLM Bridge (Google Antigravity Desktop)
$ErrorActionPreference = "Stop"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Universal LLM Bridge - Installer for Google Antigravity" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js is not found. Please install Node.js (v18+) and retry."
    exit 1
}
$nodeVer = node --version
Write-Host "[✔] Detected Node.js: $nodeVer" -ForegroundColor Green

$homeDir = [System.Environment]::GetFolderPath('UserProfile')
$scriptDir = $PSScriptRoot

# 2. Setup Target Directories
$antigravityDir = Join-Path $homeDir ".gemini\antigravity"
$mcpSchemaDir = Join-Path $antigravityDir "mcp\universal-llm-bridge"
$skillDir = Join-Path $homeDir ".gemini\config\skills\universal-llm"
$serverInstallDir = Join-Path $antigravityDir "mcp-servers\universal-llm-bridge"

New-Item -ItemType Directory -Force -Path $mcpSchemaDir | Out-Null
New-Item -ItemType Directory -Force -Path $skillDir | Out-Null
New-Item -ItemType Directory -Force -Path $serverInstallDir | Out-Null

# 3. Copy Server Files
Write-Host "[*] Deploying server runtime files to $serverInstallDir..." -ForegroundColor Yellow
Copy-Item (Join-Path $scriptDir "index.mjs") $serverInstallDir -Force
Copy-Item (Join-Path $scriptDir "client.mjs") $serverInstallDir -Force
Copy-Item (Join-Path $scriptDir "provider-vault.mjs") $serverInstallDir -Force
Copy-Item (Join-Path $scriptDir "scanner.mjs") $serverInstallDir -Force
Copy-Item (Join-Path $scriptDir "compressor.mjs") $serverInstallDir -Force
Copy-Item (Join-Path $scriptDir "cli.mjs") $serverInstallDir -Force
Copy-Item (Join-Path $scriptDir "package.json") $serverInstallDir -Force

# 4. Copy Schemas and Skill
Write-Host "[*] Installing MCP tool schemas and Antigravity skill..." -ForegroundColor Yellow
Copy-Item (Join-Path $scriptDir "schemas\*") $mcpSchemaDir -Recurse -Force
Copy-Item (Join-Path $scriptDir "skill\SKILL.md") (Join-Path $skillDir "SKILL.md") -Force

# 5. Initialize Vault if not present
$vaultFile = Join-Path $antigravityDir "llm_providers.json"
if (-not (Test-Path $vaultFile)) {
    Write-Host "[*] Initializing providers vault with default template..." -ForegroundColor Yellow
    Copy-Item (Join-Path $scriptDir "config.example.json") $vaultFile -Force
}

# 6. Update Antigravity mcp_config.json
function Register-McpConfig($configPath, $indexPath) {
    if (-not (Test-Path (Split-Path $configPath))) {
        New-Item -ItemType Directory -Force -Path (Split-Path $configPath) | Out-Null
    }
    $cfg = @{ mcpServers = @{} }
    if (Test-Path $configPath) {
        try {
            $raw = Get-Content $configPath -Raw
            if ($raw.Trim()) {
                $cfg = $raw | ConvertFrom-Json -AsHashtable
            }
        } catch {}
    }
    if (-not $cfg.ContainsKey("mcpServers")) {
        $cfg["mcpServers"] = @{}
    }

    $normalizedPath = $indexPath.Replace('\', '/')
    $cfg["mcpServers"]["universal-llm-bridge"] = @{
        command = "node"
        args = @($normalizedPath)
    }

    $cfg | ConvertTo-Json -Depth 10 | Set-Content $configPath -Encoding UTF8
    Write-Host "[✔] Registered in: $configPath" -ForegroundColor Green
}

$targetIndex = Join-Path $serverInstallDir "index.mjs"
Register-McpConfig (Join-Path $antigravityDir "mcp_config.json") $targetIndex
Register-McpConfig (Join-Path $homeDir ".gemini\config\mcp_config.json") $targetIndex

# 7. Install CLI wrapper
$npmPath = Join-Path $env:APPDATA "npm"
if (Test-Path $npmPath) {
    $cmdWrapper = @"
@ECHO off
node "$($serverInstallDir.Replace('\', '/'))/cli.mjs" %*
"@
    Set-Content (Join-Path $npmPath "agy-llm.cmd") $cmdWrapper -Encoding ASCII
    Write-Host "[✔] Installed global command: agy-llm" -ForegroundColor Green
}

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "  INSTALLATION COMPLETE!" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "You can now restart Google Antigravity Desktop or run:" -ForegroundColor White
Write-Host "  agy-llm list" -ForegroundColor Yellow
Write-Host "  agy-llm test dahl" -ForegroundColor Yellow
Write-Host "  agy-llm add <key> <url> [api_key] [model]" -ForegroundColor Yellow
