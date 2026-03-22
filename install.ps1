$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Repo = if ($env:WORKDONE_REPO) { $env:WORKDONE_REPO } else { "codeunity/workdone" }
$Version = if ($env:WORKDONE_VERSION) { $env:WORKDONE_VERSION } else { "" }
$InstallRoot = if ($env:WORKDONE_INSTALL_ROOT) { $env:WORKDONE_INSTALL_ROOT } else { Join-Path $env:LOCALAPPDATA "workdone" }
$BinDir = Join-Path $InstallRoot "bin"
$TargetPath = Join-Path $BinDir "workdone.exe"
$AssetName = "workdone-windows-x64.exe"
$ChecksumName = "$AssetName.sha256"

function Write-Log {
    param([string]$Message)
    Write-Host $Message
}

function Fail {
    param([string]$Message)
    throw $Message
}

function Normalize-Tag {
    param([string]$InputTag)

    if ([string]::IsNullOrWhiteSpace($InputTag)) {
        return ""
    }

    if ($InputTag.StartsWith("v")) {
        return $InputTag
    }

    return "v$InputTag"
}

function Download-File {
    param(
        [string]$Url,
        [string]$Destination
    )

    Invoke-WebRequest -Uri $Url -OutFile $Destination
}

function Download-WithFallback {
    param(
        [string]$PrimaryName,
        [string]$FallbackName,
        [string]$BaseUrl,
        [string]$Destination
    )

    try {
        Download-File -Url "$BaseUrl/$PrimaryName" -Destination $Destination
        return $PrimaryName
    } catch {
        if ([string]::IsNullOrWhiteSpace($FallbackName)) {
            throw
        }
    }

    Remove-Item -Force -ErrorAction SilentlyContinue $Destination
    Download-File -Url "$BaseUrl/$FallbackName" -Destination $Destination
    return $FallbackName
}

if (-not $IsWindows) {
    Fail "this installer supports Windows only"
}

$Architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture
if ($Architecture -ne [System.Runtime.InteropServices.Architecture]::X64) {
    Fail "this installer currently supports Windows x64 only"
}

$Tag = Normalize-Tag -InputTag $Version
$DownloadBase = "https://github.com/$Repo/releases/latest/download"
$LegacyAssetName = ""
$LegacyChecksumName = ""

if ($Tag) {
    $DownloadBase = "https://github.com/$Repo/releases/download/$Tag"
    $LegacyAssetName = "workdone-$Tag-windows-x64.exe"
    $LegacyChecksumName = "$LegacyAssetName.sha256"
}

$TempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("workdone-install-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $TempDir | Out-Null

try {
    Write-Log "Installing workdone into $InstallRoot"

    $DownloadedAsset = Download-WithFallback -PrimaryName $AssetName -FallbackName $LegacyAssetName -BaseUrl $DownloadBase -Destination (Join-Path $TempDir $AssetName)
    $DownloadedChecksum = Download-WithFallback -PrimaryName $ChecksumName -FallbackName $LegacyChecksumName -BaseUrl $DownloadBase -Destination (Join-Path $TempDir $ChecksumName)

    $BinaryPath = Join-Path $TempDir $AssetName
    $ChecksumPath = Join-Path $TempDir $ChecksumName

    $ChecksumLine = Get-Content -Path $ChecksumPath | Select-Object -First 1
    if (-not $ChecksumLine) {
        Fail "checksum file was empty"
    }

    $ExpectedHash = ($ChecksumLine -split "\s+")[0].ToLowerInvariant()
    $ActualHash = (Get-FileHash -Path $BinaryPath -Algorithm SHA256).Hash.ToLowerInvariant()

    if ($ExpectedHash -ne $ActualHash) {
        Fail "checksum verification failed"
    }

    $PreviousVersion = ""
    if (Test-Path $TargetPath) {
        $PreviousVersion = (& $TargetPath --version 2>$null).Trim()
    }

    New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
    Move-Item -Force -Path $BinaryPath -Destination $TargetPath

    $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $PathEntries =
        if ([string]::IsNullOrWhiteSpace($UserPath)) {
            @()
        } else {
            $UserPath.Split(";", [System.StringSplitOptions]::RemoveEmptyEntries)
        }

    $PathAlreadyPresent = $false
    foreach ($Entry in $PathEntries) {
        if ($Entry.TrimEnd("\") -ieq $BinDir.TrimEnd("\")) {
            $PathAlreadyPresent = $true
            break
        }
    }

    if (-not $PathAlreadyPresent) {
        $UpdatedEntries = @($PathEntries + $BinDir)
        [Environment]::SetEnvironmentVariable("Path", ($UpdatedEntries -join ";"), "User")
    }

    $env:Path = "$BinDir;$env:Path"
    $InstalledVersion = (& $TargetPath --version).Trim()
    if (-not $InstalledVersion) {
        Fail "installed binary did not return a version"
    }

    Write-Log "Installed $InstalledVersion at $TargetPath"

    if ($PreviousVersion) {
        Write-Log "Replaced previous install: $PreviousVersion"
    }

    if ($PathAlreadyPresent) {
        Write-Log "PATH already includes $BinDir"
    } else {
        Write-Log "Added $BinDir to your user PATH"
        Write-Log "Open a new terminal session if workdone is not yet available by name."
    }
} finally {
    if (Test-Path $TempDir) {
        Remove-Item -Recurse -Force $TempDir
    }
}
