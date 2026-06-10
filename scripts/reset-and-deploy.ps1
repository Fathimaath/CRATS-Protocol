# CRATS Protocol - Full Reset, Deploy & E2E Workflow
# Run this in a SECOND terminal after starting the Hardhat node:
#   npx hardhat node
#
# Usage: .\scripts\reset-and-deploy.ps1

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  CRATS PROTOCOL - CLEAN DEPLOY + E2E WORKFLOW" -ForegroundColor Cyan
Write-Host "============================================================`n" -ForegroundColor Cyan

# 1. Remove old deployment files so fresh addresses are written
$deploymentsDir = Join-Path $PSScriptRoot "..\deployments"
if (Test-Path $deploymentsDir) {
    Write-Host "[1/3] Cleaning deployment artifacts..." -ForegroundColor Yellow
    Remove-Item "$deploymentsDir\localhost-deployment.json"      -ErrorAction SilentlyContinue
    Remove-Item "$deploymentsDir\localhost-workflow-results.json" -ErrorAction SilentlyContinue
    Write-Host "    Stale deployment files removed." -ForegroundColor Green
} else {
    New-Item -ItemType Directory -Path $deploymentsDir | Out-Null
}

# 2. Deploy all layers
Write-Host "[2/3] Deploying all 4 layers to local node..." -ForegroundColor Yellow
npx hardhat run scripts/deploy-master.js --network localhost
if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ Deployment failed. Check the error above." -ForegroundColor Red
    exit 1
}
Write-Host "    All layers deployed successfully." -ForegroundColor Green

# 3. Run E2E workflow
Write-Host "[3/3] Running 14-step E2E workflow..." -ForegroundColor Yellow
npx hardhat run scripts/workflow/test-workflow.js --network localhost
if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ Workflow failed. Check the error above." -ForegroundColor Red
    exit 1
}

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  🎉 FULL CRATS E2E VERIFIED SUCCESSFULLY" -ForegroundColor Green
Write-Host "============================================================`n" -ForegroundColor Cyan
