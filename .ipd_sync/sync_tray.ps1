param(
    [switch]$SelfTest
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$createdNew = $false
$mutex = New-Object System.Threading.Mutex($true, "Local\IPDSyncTray", [ref]$createdNew)
if (-not $createdNew) {
    exit 0
}

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$syncScript = Join-Path $scriptDirectory "sync.py"
$statusFile = Join-Path $scriptDirectory "sync_status.json"
$python = (Get-Command python.exe -ErrorAction Stop).Source
$script:syncProcess = $null
$script:nextSyncAt = [DateTime]::MinValue

function New-SyncIcon([System.Drawing.Color]$backgroundColor) {
    $bitmap = New-Object System.Drawing.Bitmap 32, 32
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $shadow = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(55, 0, 0, 0))
    $background = New-Object System.Drawing.SolidBrush $backgroundColor
    $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 2.8
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

    $graphics.FillEllipse($shadow, 2, 3, 28, 28)
    $graphics.FillEllipse($background, 1, 1, 28, 28)
    $graphics.DrawArc($pen, 7, 7, 17, 17, 205, 145)
    $graphics.DrawArc($pen, 7, 7, 17, 17, 25, 145)

    [System.Drawing.PointF[]]$firstArrow = @(
        (New-Object System.Drawing.PointF 24.5, 9.5),
        (New-Object System.Drawing.PointF 25.0, 15.5),
        (New-Object System.Drawing.PointF 19.5, 13.0)
    )
    [System.Drawing.PointF[]]$secondArrow = @(
        (New-Object System.Drawing.PointF 6.0, 22.0),
        (New-Object System.Drawing.PointF 6.5, 16.0),
        (New-Object System.Drawing.PointF 12.0, 18.5)
    )
    $graphics.FillPolygon($white, $firstArrow)
    $graphics.FillPolygon($white, $secondArrow)

    $pen.Dispose()
    $white.Dispose()
    $background.Dispose()
    $shadow.Dispose()
    $graphics.Dispose()

    $handle = $bitmap.GetHicon()
    $icon = [System.Drawing.Icon]::FromHandle($handle)
    return [PSCustomObject]@{ Icon = $icon; Bitmap = $bitmap; Handle = $handle }
}

$icons = @{
    Syncing = New-SyncIcon ([System.Drawing.Color]::FromArgb(30, 136, 229))
    Ok      = New-SyncIcon ([System.Drawing.Color]::FromArgb(0, 150, 136))
    Error   = New-SyncIcon ([System.Drawing.Color]::FromArgb(229, 57, 53))
}

$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
$notifyIcon.Icon = $icons.Syncing.Icon
$notifyIcon.Text = "IPD Sync: starting..."
$notifyIcon.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$titleItem = $menu.Items.Add("IPD Sync")
$titleItem.Enabled = $false
$statusItem = $menu.Items.Add("Starting...")
$statusItem.Enabled = $false
[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
$syncNowItem = $menu.Items.Add("Sync now")
$exitItem = $menu.Items.Add("Exit")
$notifyIcon.ContextMenuStrip = $menu

function Set-TrayStatus([string]$text, [string]$iconName) {
    if ($text.Length -gt 63) {
        $text = $text.Substring(0, 63)
    }
    $notifyIcon.Text = $text
    $statusItem.Text = $text
    $notifyIcon.Icon = $icons[$iconName].Icon
}

function Start-Sync {
    if ($null -ne $script:syncProcess -and -not $script:syncProcess.HasExited) {
        return
    }

    try {
        $startInfo = New-Object System.Diagnostics.ProcessStartInfo
        $startInfo.FileName = $python
        $startInfo.Arguments = '"' + $syncScript + '"'
        $startInfo.WorkingDirectory = $scriptDirectory
        $startInfo.UseShellExecute = $false
        $startInfo.CreateNoWindow = $true
        $startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden

        $script:syncProcess = New-Object System.Diagnostics.Process
        $script:syncProcess.StartInfo = $startInfo
        [void]$script:syncProcess.Start()
        Set-TrayStatus "IPD Sync: syncing..." "Syncing"
    }
    catch {
        $script:syncProcess = $null
        $script:nextSyncAt = [DateTime]::Now.AddSeconds(60)
        Set-TrayStatus "IPD Sync: could not start Python" "Error"
    }
}

function Complete-Sync {
    $exitCode = $script:syncProcess.ExitCode
    $script:syncProcess.Dispose()
    $script:syncProcess = $null
    $script:nextSyncAt = [DateTime]::Now.AddSeconds(60)

    if ($exitCode -ne 0 -or -not (Test-Path -LiteralPath $statusFile)) {
        Set-TrayStatus ("IPD Sync: error at " + [DateTime]::Now.ToString("HH:mm:ss")) "Error"
        return
    }

    try {
        $status = Get-Content -LiteralPath $statusFile -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($status.status -eq "ok") {
            $time = ([string]$status.updated_at).Substring(11, 8)
            Set-TrayStatus ("IPD Sync: " + $status.count + " items updated at " + $time) "Ok"
        }
        else {
            Set-TrayStatus ("IPD Sync: error at " + [DateTime]::Now.ToString("HH:mm:ss")) "Error"
        }
    }
    catch {
        Set-TrayStatus ("IPD Sync: invalid status at " + [DateTime]::Now.ToString("HH:mm:ss")) "Error"
    }
}

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 1000
$timer.Add_Tick({
    if ($null -ne $script:syncProcess) {
        if ($script:syncProcess.HasExited) {
            Complete-Sync
        }
        return
    }

    if ([DateTime]::Now -ge $script:nextSyncAt) {
        Start-Sync
    }
})

$syncNowItem.Add_Click({ Start-Sync })
$notifyIcon.Add_DoubleClick({ Start-Sync })
$exitItem.Add_Click({
    $timer.Stop()
    $notifyIcon.Visible = $false
    [System.Windows.Forms.Application]::ExitThread()
})

try {
    if ($SelfTest) {
        Set-TrayStatus "IPD Sync: 12 items updated at 12:34:56" "Ok"
        return
    }

    Start-Sync
    $timer.Start()
    [System.Windows.Forms.Application]::Run()
}
finally {
    $timer.Stop()
    $timer.Dispose()
    $notifyIcon.Visible = $false
    $notifyIcon.Dispose()
    foreach ($item in $icons.Values) {
        $item.Icon.Dispose()
        $item.Bitmap.Dispose()
    }
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
