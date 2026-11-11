Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "taskkill /f /im ptz-tour.exe", 0, True
