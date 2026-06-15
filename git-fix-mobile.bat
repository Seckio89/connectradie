@echo off
cd /d "C:\Users\User\Desktop\project"

echo Removing stale lock file if any...
del /f ".git\index.lock" 2>nul

echo Staging all mobile fix files...
git add src/styles/mobile-responsive.css src/components/DashboardLayout.tsx src/pages/TradieDashboard.tsx src/components/Toast.tsx index.html capacitor.config.ts android/app/src/main/java/com/connectradie/app/MainActivity.java android/app/src/main/res/layout/activity_main.xml

echo Committing...
git commit -m "fix: comprehensive mobile overflow prevention for WebView and browser" -m "Android WebView fixes:" -m "- MainActivity: disable overscroll, disable horizontal scrollbar" -m "- activity_main.xml: add overScrollMode=never to WebView" -m "- capacitor.config.ts: add overScrollMode never" -m "" -m "Web/CSS fixes:" -m "- index.html: add maximum-scale=1.0, user-scalable=no, viewport-fit=cover" -m "- mobile-responsive.css: apply overflow-x clip/hidden globally (not just mobile media query)" -m "- mobile-responsive.css: add * max-width 100vw nuclear rule at mobile breakpoint" -m "- Remove -mx-3 negative margin on week view (leaked past overflow-hidden)" -m "- Reduce week view min-width from 600px to 480px" -m "- Reduce earnings grid gap and padding on mobile" -m "- Scale down earnings text on mobile" -m "- Add flex-wrap to job card badges" -m "- Fix Toast min-width to not exceed viewport"

echo Pushing to mobile-redesign...
git push origin mobile-redesign

echo.
echo Done! Press any key to close...
pause >nul
