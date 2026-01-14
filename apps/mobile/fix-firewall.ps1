# Run this script as Administrator to allow Expo dev server through Windows Firewall

Write-Host "Adding Windows Firewall rule for Expo dev server (port 8081)..." -ForegroundColor Yellow

# Check if running as administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator', then run this script again." -ForegroundColor Yellow
    exit 1
}

# Remove existing rule if it exists
netsh advfirewall firewall delete rule name="Node.js Expo Dev Server" 2>$null

# Add new rule
netsh advfirewall firewall add rule name="Node.js Expo Dev Server" dir=in action=allow protocol=TCP localport=8081

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Firewall rule added successfully!" -ForegroundColor Green
    Write-Host "You can now start Expo with: npx expo start --lan" -ForegroundColor Cyan
} else {
    Write-Host "✗ Failed to add firewall rule. Error code: $LASTEXITCODE" -ForegroundColor Red
    exit 1
}
