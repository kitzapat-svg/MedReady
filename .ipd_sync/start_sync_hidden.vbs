Option Explicit

Dim fso, shell, scriptDirectory, trayScript, command
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

scriptDirectory = fso.GetParentFolderName(WScript.ScriptFullName)
trayScript = fso.BuildPath(scriptDirectory, "sync_tray.ps1")
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " _
    & Chr(34) & trayScript & Chr(34)

shell.Run command, 0, False
