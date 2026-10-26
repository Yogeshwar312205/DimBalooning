# Balloon ID Sequential Numbering Fix

## Problem
Balloon IDs were restarting from 1 on every PDF page, causing duplicate balloon numbers across a multi-page PDF document.

**Example of the bug:**
- Page 1: Balloons 1, 2, 3, 4, 5
- Page 2: Balloons 1, 2, 3, 4, 5 (duplicates!)
- Page 3: Balloons 1, 2, 3, 4, 5 (duplicates!)

## Root Cause
In `balloonController.ts`, the `autoDetectBalloons` function queried only the balloons from the **current page** to determine the next balloon number:

```typescript
const existingBalloons = await prisma.balloon.findMany({
  where: { inspectionSessionId, pageNumber },  // ❌ Only current page
  select: { balloonNumber: true, x: true, y: true, leaderStartX: true, leaderStartY: true }
});

let currentMaxNum = existingBalloons.length > 0 
  ? Math.max(...existingBalloons.map(b => b.balloonNumber)) 
  : 0;
```

This caused the balloon counter to reset on each new page.

## Solution
Modified the code to query **all balloons across all pages** in the inspection session to maintain a global sequential counter:

```typescript
// Query balloons on current page for collision detection (spatial)
const existingBalloons = await prisma.balloon.findMany({
  where: { inspectionSessionId, pageNumber },
  select: { balloonNumber: true, x: true, y: true, leaderStartX: true, leaderStartY: true }
});

// ... spatial collision detection uses existingBalloons ...

// FIX: Query ALL balloons across ALL pages for sequential numbering
const allBalloonsInSession = await prisma.balloon.findMany({
  where: { inspectionSessionId },  // ✅ All pages
  select: { balloonNumber: true }
});

let currentMaxNum = allBalloonsInSession.length > 0 
  ? Math.max(...allBalloonsInSession.map(b => b.balloonNumber)) 
  : 0;
```

## Expected Result
After the fix, balloon IDs are unique and sequential across the entire PDF:
- Page 1: Balloons 1, 2, 3, 4, 5
- Page 2: Balloons 6, 7, 8, 9, 10
- Page 3: Balloons 11, 12, 13, 14, 15

Every balloon in the complete PDF now has a unique, sequential ID.

## Files Changed
- `backend/src/controllers/balloonController.ts` - Line ~268-278 (added global counter query)

## Testing
1. Upload a multi-page PDF drawing
2. Create an inspection session
3. Run auto-detect on Page 1 → Should create balloons 1, 2, 3, ...
4. Run auto-detect on Page 2 → Should continue with 6, 7, 8, ... (not restart at 1)
5. Run auto-detect on Page 3 → Should continue with 11, 12, 13, ... (not restart at 1)

## Notes
- The `createBalloon` function (manual balloon creation) already had correct global numbering
- Only `autoDetectBalloons` needed the fix
- The spatial collision detection still only checks the current page (as intended) for performance
