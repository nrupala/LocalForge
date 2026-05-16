@echo off
REM LocalForge Demo Video Generator
REM Run this to generate a narrated demo video automatically

echo.
echo === LocalForge Demo Video Generator ===
echo.

REM Install dependencies
echo [1/4] Installing Python dependencies...
pip install -r scripts\requirements-demo.txt >nul 2>&1

REM Ensure project is built
echo [2/4] Building TypeScript...
call npx tsc

REM Generate demo video
echo [3/4] Generating demo video with AI narration...
echo     (This uses edge-tts — free, no API key needed)
python scripts\generate-demo.py

echo.
echo === Done! ===
echo Check demo-assets\localforge_demo.mp4 for your video.
echo.
echo To enhance with real screen recordings, run:
echo   python scripts\generate-demo.py --serve
echo Then browse to http://127.0.0.1:3099 and record your demo.
echo.
echo Proudly Made in Canada.
