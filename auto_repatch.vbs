' Hidden runner for the scheduled auto-repatch task. Applies the hub patch only
' when the installed archive lacks the current build and Antigravity is closed.
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
logFile = dir & "\logs\auto_repatch.log"
If Not fso.FolderExists(dir & "\logs") Then fso.CreateFolder(dir & "\logs")
cmd = "cmd /c node """ & dir & "\src\build.js"" --install --if-needed --skip-if-running >> """ & logFile & """ 2>&1"
CreateObject("WScript.Shell").Run cmd, 0, True
