# Events View Performance Optimizations

## What Was Optimized

The events.js view was consuming excessive resources due to:

1. **Forced debug mode** - `debugMode = true` was always on, causing constant logging
2. **Excessive console logging** - Multiple console.log statements on every alert
3. **Inefficient DOM manipulation** - Multiple class operations and DOM queries
4. **Repeated property access** - Accessing window.settings multiple times per alert
5. **Unnecessary object creation** - Creating variables that weren't needed

## Performance Improvements

### 1. Smart Debug Mode Control
- ✅ **Before**: `const debugMode = true;` (always on)
- ✅ **After**: `const debugMode = window.appFlags?.eventsDebug || window.appFlags?.isDev || false;`
- ✅ **Result**: Debug logging only when needed, zero overhead in production

### 2. Environment Variable Control
- ✅ Added `EVENTS_DEBUG=true` environment variable support via preload.js
- ✅ Falls back to `NODE_ENV=development` for general dev mode
- ✅ Can be enabled independently: `EVENTS_DEBUG=true npm start`

### 3. Optimized DOM Operations
- ✅ **Before**: Multiple individual `classList.remove()` calls
- ✅ **After**: Batched operations using spread operator: `classList.remove(...pulseClasses)`
- ✅ **Result**: Fewer DOM operations, better performance

### 4. Early Returns and Caching
- ✅ **Before**: Complex filter logic with object destructuring
- ✅ **After**: Early returns with cached settings access
- ✅ **Result**: Faster filtering, less object creation

### 5. Reduced Property Access
- ✅ **Before**: `window.settings?.scanner?.minVolume` accessed multiple times
- ✅ **After**: Cached in local variables: `const scannerSettings = window.settings?.scanner;`
- ✅ **Result**: Fewer property lookups per alert

## How to Enable Debug Mode

### Option 1: Environment Variable (Recommended)
```bash
# Windows
set EVENTS_DEBUG=true

# Linux/Mac
export EVENTS_DEBUG=true

# Run with debug enabled
EVENTS_DEBUG=true npm start
```

### Option 2: Development Mode
```bash
# Automatically enables events debug when in development
NODE_ENV=development npm start
```

## Performance Impact

- **Before**: Forced debug mode, excessive logging, inefficient DOM operations
- **After**: Conditional debug mode, optimized DOM operations, cached property access
- **Result**: Significantly reduced CPU usage during high alert volumes

## What Debug Mode Shows

When debug mode is enabled, you'll see:
```
🔍 [EVENTS] Checking if eventsAPI is available: { hasEventsAPI: true, hasOnAlert: true }
✅ [EVENTS] eventsAPI.onAlert is available, setting up listener...
🎧 Sample packs ready: { short: 32, long: 32 }
```

When debug mode is off (default), no logging occurs, maximizing performance.

## Technical Details

### DOM Optimization Pattern
```javascript
// Before: Multiple individual operations
card.classList.remove("combo-pulse-1");
card.classList.remove("combo-pulse-2");
card.classList.remove("combo-pulse-3");
card.classList.remove("combo-pulse-4");

// After: Single batched operation
const pulseClasses = ["combo-pulse-1", "combo-pulse-2", "combo-pulse-3", "combo-pulse-4"];
card.classList.remove(...pulseClasses);
```

### Early Return Pattern
```javascript
// Before: Complex filter logic
const passesFilters = (minPrice === 0 || price >= minPrice) && 
                     (maxPrice === 0 || price <= maxPrice) && 
                     (hp >= minChangePercent || dp >= minChangePercent) && 
                     strength >= minVolume;
if (!passesFilters) return;

// After: Early returns with cached access
const topSettings = window.settings?.top;
const scannerSettings = window.settings?.scanner;

if (topSettings?.minPrice && price < topSettings.minPrice) return;
if (topSettings?.maxPrice && price > topSettings.maxPrice) return;
if (scannerSettings?.minChangePercent && (hp < scannerSettings.minChangePercent && dp < scannerSettings.minChangePercent)) return;
if (scannerSettings?.minVolume && strength < scannerSettings.minVolume) return;
```

## Testing

All optimizations have been tested and verified:
- ✅ Alert data flow tests pass
- ✅ Array unwrapping logic intact
- ✅ DOM manipulation optimized
- ✅ Debug mode control working
- ✅ Performance improvements confirmed
