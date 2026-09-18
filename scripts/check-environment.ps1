[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$commands = @('node', 'npm', 'npx', 'git', 'docker')

foreach ($commandName in $commands) {
  $command = Get-Command $commandName -ErrorAction SilentlyContinue
  $status = if ($command) { $command.Source } else { 'NOT FOUND' }
  Write-Output ("{0}: {1}" -f $commandName, $status)
}

$volume = Get-Volume -DriveLetter C
Write-Output ("C: free: {0:N2} GiB" -f ($volume.SizeRemaining / 1GB))
