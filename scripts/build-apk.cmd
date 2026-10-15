@echo off
rem Builds the debug APK on Windows: android\app\build\outputs\apk\debug\app-debug.apk
rem Uses Android Studio's bundled Java and a temp folder without spaces (needed when the
rem Windows username contains a space). Copies the result to release\SolaristicPulse.apk.
setlocal
set "ROOT=%~dp0.."
set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
if not exist "%USERPROFILE%\.gradle-tmp" mkdir "%USERPROFILE%\.gradle-tmp"
set "JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=%USERPROFILE%\.gradle-tmp -Djava.io.tmpdir=%USERPROFILE%\.gradle-tmp"
cd /d "%ROOT%"
call npm run build || exit /b 1
call npx cap sync android || exit /b 1
cd /d "%ROOT%\android"
call "%ROOT%\android\gradlew.bat" assembleDebug || exit /b 1
if not exist "%ROOT%\release" mkdir "%ROOT%\release"
copy /y "%ROOT%\android\app\build\outputs\apk\debug\app-debug.apk" "%ROOT%\release\SolaristicPulse.apk" >nul
echo.
echo APK ready: release\SolaristicPulse.apk
