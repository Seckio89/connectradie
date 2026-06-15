@echo off
cd /d "C:\Users\User\Desktop\project"
del /f ".git\index.lock" 2>nul

git add android/app/src/main/java/com/connectradie/app/MainActivity.java android/app/src/main/assets/capacitor.config.json
git commit -m "fix: aggressive WebView horizontal scroll prevention for Android" -m "- Disable wide viewport mode (setUseWideViewPort=false)" -m "- Inject overflow-x:hidden CSS on every page load via WebViewClient" -m "- Add touch listener to reset horizontal scroll to 0" -m "- Set LayoutAlgorithm to TEXT_AUTOSIZING" -m "- Sync capacitor.config.json with overScrollMode"
git push origin mobile-redesign

echo Done! Press any key to close...
pause >nul
