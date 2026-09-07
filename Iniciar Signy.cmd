@echo off
cd /d "%~dp0"
echo Iniciando Signy. Acesse http://localhost:3000 no navegador.
echo No primeiro acesso, a senha do administrador aparece abaixo.
call npm.cmd start
pause
