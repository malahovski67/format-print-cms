@echo off
REM FORMAT CMS — keep-alive wrapper. Restarts the server if it ever exits.
cd /d "C:\web design\claude\print-cms"
:loop
node server.js >> "C:\web design\claude\print-cms\server.log" 2>&1
echo [%date% %time%] server exited, restarting in 3s >> "C:\web design\claude\print-cms\server.log"
timeout /t 3 /nobreak >nul
goto loop
