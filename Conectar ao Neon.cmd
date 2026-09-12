@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\configurar-neon.ps1"
if errorlevel 1 (
  echo.
  echo Nao foi possivel salvar a conexao. Confira a mensagem acima.
)
echo.
pause
