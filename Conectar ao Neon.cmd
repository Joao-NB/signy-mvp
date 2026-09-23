@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\configurar-neon.ps1"
if errorlevel 1 (
  echo.
  echo Nao foi possivel salvar a conexao. Confira a mensagem acima.
  goto :fim
)
call npm.cmd run verificar:neon
if errorlevel 1 echo Nao foi possivel confirmar o acesso ao Neon. Confira a URI e a senha do banco.
:fim
echo.
pause
