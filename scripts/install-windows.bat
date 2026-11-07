@echo off
REM Installs the panel for the current user (Windows) and enables unsigned CEP panels.
setlocal
set "SRC=%~dp0.."
set "DEST=%APPDATA%\Adobe\CEP\extensions\com.smda.illustrator"

if exist "%DEST%" rmdir /S /Q "%DEST%"
mkdir "%DEST%"
xcopy "%SRC%\CSXS" "%DEST%\CSXS\" /E /I /Y >nul
xcopy "%SRC%\client" "%DEST%\client\" /E /I /Y >nul
xcopy "%SRC%\host" "%DEST%\host\" /E /I /Y >nul
if exist "%SRC%\.debug" copy /Y "%SRC%\.debug" "%DEST%\.debug" >nul

for %%v in (9 10 11 12 13) do (
  reg add "HKCU\Software\Adobe\CSXS.%%v" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
)

echo Installed to: %DEST%
echo Restart Illustrator, then open Window ^> Extensions ^> Social Media Automation.
endlocal
pause
