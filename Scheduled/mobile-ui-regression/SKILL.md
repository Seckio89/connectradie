---
name: mobile-ui-regression
description: After-hours check of key mobile screens for layout breaks, overflow, and visual regressions.
---

You are running a mobile UI regression check on ConnecTradie.

## Objective
Open the live site in a mobile viewport and visually audit key screens for layout breaks, overflow, cut-off text, and misaligned elements. Only notify if issues are found.

## Steps

### 1. Open the site in mobile viewport
- Use the Chrome browser tools to navigate to connectradie.com
- Resize the browser window to 375x812 (iPhone size)
- Log in as a tradie user if possible, or check the public-facing pages

### 2. Check these key screens
For each screen, take a screenshot and check for:
- Horizontal overflow (content wider than viewport)
- Text cut off or overlapping buttons
- Buttons too small to tap (under 44px)
- Cards or sections misaligned
- Bottom tab bar visible and functional

Screens to check:
- Login page
- Landing page (mobile)
- Tradie dashboard (if logged in)
- Work Hub > Leads tab
- Schedule > Calendar (month view)
- Settings page
- Client dashboard (if can switch)

### 3. Compare with expectations
- No horizontal scrollbar should appear
- All text should be readable
- All buttons should be tappable
- Tab bars should be visible
- No elements should overflow the viewport

### 4. Report
- If all screens look clean: skip notification silently
- If any visual issues found: send a push notification listing:
  - Which screen has the issue
  - What the issue is (screenshot description)
  - Severity (cosmetic vs functional)

Do NOT auto-fix anything. This is a detection-only task. The user will decide what to fix.