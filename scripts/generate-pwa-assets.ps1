Add-Type -AssemblyName System.Drawing

$iconDir = Join-Path $PSScriptRoot '..\public\icons'
$splashDir = Join-Path $PSScriptRoot '..\public\splash'

New-Item -ItemType Directory -Force -Path $iconDir | Out-Null
New-Item -ItemType Directory -Force -Path $splashDir | Out-Null

function New-RoundRectPath([int]$x, [int]$y, [int]$w, [int]$h, [int]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc($x, $y, $r, $r, 180, 90)
  $path.AddArc($x + $w - $r, $y, $r, $r, 270, 90)
  $path.AddArc($x + $w - $r, $y + $h - $r, $r, $r, 0, 90)
  $path.AddArc($x, $y + $h - $r, $r, $r, 90, 90)
  $path.CloseFigure()
  return $path
}

function Draw-BoardlyIcon([System.Drawing.Graphics]$g, [int]$size, [bool]$maskable) {
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  if ($maskable) {
    $bgRect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
    $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush($bgRect, ([System.Drawing.Color]::FromArgb(29, 78, 216)), ([System.Drawing.Color]::FromArgb(8, 145, 178)), 45)
    $g.FillRectangle($bg, 0, 0, $size, $size)
    $bg.Dispose()
    $tileScale = 0.54
    $tileYOffset = 0.23
  } else {
    $outer = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(15, 23, 42))
    $g.FillRectangle($outer, 0, 0, $size, $size)
    $outer.Dispose()

    $inset = [int]($size * 0.05)
    $radius = [Math]::Max(12, [int]($size * 0.18))
    $path = New-RoundRectPath $inset $inset ($size - 2 * $inset) ($size - 2 * $inset) $radius
    $rect = New-Object System.Drawing.RectangleF($inset, $inset, ($size - 2 * $inset), ($size - 2 * $inset))
    $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, ([System.Drawing.Color]::FromArgb(37, 99, 235)), ([System.Drawing.Color]::FromArgb(6, 182, 212)), 45)
    $g.FillPath($bg, $path)
    $bg.Dispose()
    $path.Dispose()
    $tileScale = 0.50
    $tileYOffset = 0.24
  }

  $tileW = [int]($size * $tileScale)
  $tileH = [int]($tileW * 1.06)
  $tileX = [int](($size - $tileW) / 2)
  $tileY = [int]($size * $tileYOffset)
  $tileR = [Math]::Max(10, [int]($tileW * 0.18))
  $tilePath = New-RoundRectPath $tileX $tileY $tileW $tileH $tileR
  $tileRect = New-Object System.Drawing.RectangleF($tileX, $tileY, $tileW, $tileH)
  $tileBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($tileRect, ([System.Drawing.Color]::White), ([System.Drawing.Color]::FromArgb(219, 234, 254)), 45)
  $g.FillPath($tileBrush, $tilePath)
  $tileBrush.Dispose()
  $tilePath.Dispose()

  $dotBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(29, 78, 216))
  $dotR = [Math]::Max(4, [int]($tileW * 0.065))
  foreach ($pt in @(@(0.28, 0.28), @(0.72, 0.28), @(0.50, 0.50), @(0.28, 0.72), @(0.72, 0.72))) {
    $cx = $tileX + [int]($tileW * $pt[0])
    $cy = $tileY + [int]($tileH * $pt[1])
    $g.FillEllipse($dotBrush, $cx - $dotR, $cy - $dotR, 2 * $dotR, 2 * $dotR)
  }
  $dotBrush.Dispose()
}

function Save-Png([string]$path, [int]$w, [int]$h, [ScriptBlock]$draw) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  & $draw $g $w $h
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

Save-Png (Join-Path $iconDir 'icon-192.png') 192 192 { param($g, $w, $h) Draw-BoardlyIcon $g $w $false }
Save-Png (Join-Path $iconDir 'icon-512.png') 512 512 { param($g, $w, $h) Draw-BoardlyIcon $g $w $false }
Save-Png (Join-Path $iconDir 'icon-maskable-192.png') 192 192 { param($g, $w, $h) Draw-BoardlyIcon $g $w $true }
Save-Png (Join-Path $iconDir 'icon-maskable-512.png') 512 512 { param($g, $w, $h) Draw-BoardlyIcon $g $w $true }

$splashSizes = @(
  @{ Name = 'apple-splash-640x1136.png'; W = 640; H = 1136 }
  @{ Name = 'apple-splash-750x1334.png'; W = 750; H = 1334 }
  @{ Name = 'apple-splash-828x1792.png'; W = 828; H = 1792 }
  @{ Name = 'apple-splash-1125x2436.png'; W = 1125; H = 2436 }
  @{ Name = 'apple-splash-1170x2532.png'; W = 1170; H = 2532 }
  @{ Name = 'apple-splash-1242x2688.png'; W = 1242; H = 2688 }
  @{ Name = 'apple-splash-1284x2778.png'; W = 1284; H = 2778 }
  @{ Name = 'apple-splash-1290x2796.png'; W = 1290; H = 2796 }
  @{ Name = 'apple-splash-1536x2048.png'; W = 1536; H = 2048 }
  @{ Name = 'apple-splash-1668x2224.png'; W = 1668; H = 2224 }
  @{ Name = 'apple-splash-1668x2388.png'; W = 1668; H = 2388 }
  @{ Name = 'apple-splash-2048x2732.png'; W = 2048; H = 2732 }
)

foreach ($splash in $splashSizes) {
  Save-Png (Join-Path $splashDir $splash.Name) $splash.W $splash.H {
    param($g, $w, $h)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    $bgRect = New-Object System.Drawing.RectangleF(0, 0, $w, $h)
    $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush($bgRect, ([System.Drawing.Color]::FromArgb(2, 6, 23)), ([System.Drawing.Color]::FromArgb(15, 23, 42)), 90)
    $g.FillRectangle($bg, 0, 0, $w, $h)
    $bg.Dispose()

    $glow1 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(52, 37, 99, 235))
    $glow2 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(44, 6, 182, 212))
    $g.FillEllipse($glow1, -[int]($w * 0.15), [int]($h * 0.06), [int]($w * 0.7), [int]($w * 0.7))
    $g.FillEllipse($glow2, [int]($w * 0.45), [int]($h * 0.02), [int]($w * 0.6), [int]($w * 0.6))
    $glow1.Dispose()
    $glow2.Dispose()

    $iconSize = [int]([Math]::Min($w * 0.36, $h * 0.2))
    $iconBmp = New-Object System.Drawing.Bitmap $iconSize, $iconSize
    $iconGraphics = [System.Drawing.Graphics]::FromImage($iconBmp)
    Draw-BoardlyIcon $iconGraphics $iconSize $false
    $iconGraphics.Dispose()
    $g.DrawImage($iconBmp, [int](($w - $iconSize) / 2), [int]($h * 0.28))
    $iconBmp.Dispose()

    $titleFont = New-Object System.Drawing.Font('Segoe UI', [Math]::Max(24, [int]($w * 0.055)), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $subFont = New-Object System.Drawing.Font('Segoe UI', [Math]::Max(14, [int]($w * 0.022)), [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $center = New-Object System.Drawing.StringFormat
    $center.Alignment = [System.Drawing.StringAlignment]::Center
    $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(240, 248, 255))
    $muted = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(185, 203, 213, 225))

    $g.DrawString('Boardly', $titleFont, $white, (New-Object System.Drawing.RectangleF(0, [int]($h * 0.56), $w, 90)), $center)
    $g.DrawString('Multiplayer board games', $subFont, $muted, (New-Object System.Drawing.RectangleF(0, [int]($h * 0.63), $w, 60)), $center)
    $g.DrawString('Loading...', $subFont, $muted, (New-Object System.Drawing.RectangleF(0, [int]($h * 0.88), $w, 40)), $center)

    $titleFont.Dispose()
    $subFont.Dispose()
    $center.Dispose()
    $white.Dispose()
    $muted.Dispose()
  }
}

Write-Host "Generated PWA icons and iOS splash assets."
