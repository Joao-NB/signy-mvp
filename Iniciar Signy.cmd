@echo off
cd /d "%~dp0"
if exist ".env" (
  echo Banco de dados: Neon compartilhado com a producao.
) else (
  echo Banco de dados: local. Para usar o Neon, execute primeiro "Conectar ao Neon.cmd".
)
echo Iniciando Signy. Acesse http://localhost:3000 no navegador.
call npm.cmd start
pause
