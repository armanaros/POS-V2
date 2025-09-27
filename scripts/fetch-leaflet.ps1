# Fetch Leaflet assets (1.9.4) into client/public/vendor
# Run this script from project root (PowerShell)

$vendorDir = "client\public\vendor"
if (-not (Test-Path $vendorDir)) { New-Item -ItemType Directory -Path $vendorDir -Force | Out-Null }

$cssUrl = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
$jsUrl  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'

Write-Host "Downloading Leaflet CSS from $cssUrl"
Invoke-WebRequest -Uri $cssUrl -OutFile "$vendorDir\leaflet.css" -UseBasicParsing
Write-Host "Downloading Leaflet JS from $jsUrl"
Invoke-WebRequest -Uri $jsUrl -OutFile "$vendorDir\leaflet.js" -UseBasicParsing

Write-Host "Done. Files saved to $vendorDir"