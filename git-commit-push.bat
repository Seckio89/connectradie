@echo off
cd /d "C:\Users\User\Desktop\project"

echo Removing stale lock file...
del /f ".git\index.lock" 2>nul

echo Staging files...
git add src/styles/mobile-responsive.css src/components/DashboardLayout.tsx src/pages/TradieDashboard.tsx

echo Committing...
git commit -m "fix: prevent calendar horizontal overflow on mobile" -m "- Add nuclear CSS fix to mobile-responsive.css: overflow-x hidden on html/body/#root/min-h-screen at mobile breakpoint" -m "- Add overflow-x-hidden and max-w-[100vw] to DashboardLayout outermost wrapper" -m "- Fix week view grid: reduce time column from 80px to 60px on mobile, reduce min-width from 700px to 600px" -m "- Add flex-wrap to calendar action buttons so they wrap instead of overflow on narrow screens" -m "- Add min-w-0 and flex-shrink-0 to button icons to prevent content from forcing width"

echo Pushing...
git push origin mobile-redesign

echo.
echo Done! Press any key to close...
pause >nul
