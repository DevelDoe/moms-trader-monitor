# Alert Data Pipeline Fix

## Problem Description

The alert events were getting wrapped in arrays before being consumed in the views. This caused issues where views couldn't access alert properties directly (e.g., `alertData.hero` would be `undefined` because `alertData` was an array).

## Root Cause

The issue was in **two places** in the data pipeline:

### 1. chronos.js (WebSocket Message Handler)
- **Location**: `src/main/collectors/chronos.js`
- **Issue**: WebSocket messages from the server contained array-wrapped payloads
- **Example**: `{ type: "alert", payload: [{ hero: "STI", price: 0.1449, ... }] }`

### 2. preload.js (Renderer API Bridge)
- **Location**: `src/renderer/preload.js`
- **Issue**: The `eventsAPI.onAlert` callback was wrapping data in an array
- **Code**: `callback([data])` instead of `callback(data)`

## Complete Data Flow

```
WebSocket Server → chronos.js → broadcast → safeSend → preload.js → renderer views
     ↓              ↓           ↓         ↓         ↓           ↓
  Array payload  Unwrap     Broadcast  Send IPC   Pass data   Process
  [{...}]        Array      Unwrapped  Unwrapped  Direct      Direct
                 payload    data       data       data       data
```

## Solution Implemented

### 1. Fixed chronos.js Array Unwrapping
**File**: `src/main/collectors/chronos.js`

**Before**:
```javascript
if (msg.type === "alert") {
    // Store the alert in ticker store
    if (tickerStore?.addEvent) {
        tickerStore.addEvent(msg.payload);
    }
    
    // Broadcast to all relevant windows
    broadcastAlert(msg.payload); // ❌ Broadcasting array-wrapped data
}
```

**After**:
```javascript
if (msg.type === "alert") {
    // Store the alert in ticker store
    if (tickerStore?.addEvent) {
        tickerStore.addEvent(msg.payload);
    }

    // Unwrap array if needed before broadcasting
    const payloadToSend = Array.isArray(msg.payload) ? msg.payload[0] : msg.payload;
    
    // Broadcast to all relevant windows
    broadcastAlert(payloadToSend); // ✅ Broadcasting unwrapped data
}
```

### 2. Fixed preload.js Array Wrapping
**File**: `src/renderer/preload.js`

**Before**:
```javascript
contextBridge.exposeInMainWorld("eventsAPI", {
    onAlert: (callback) => ipcRenderer.on("ws-alert", (_, data) => callback([data])), // ❌ Wrapping in array
});
```

**After**:
```javascript
contextBridge.exposeInMainWorld("eventsAPI", {
    onAlert: (callback) => ipcRenderer.on("ws-alert", (_, data) => callback(data)), // ✅ Direct data
});
```

### 3. Added Comprehensive Logging
Added detailed logging throughout the pipeline to track data flow:

- **chronos.js**: Logs received payload structure and unwrapped data
- **broadcast.js**: Logs data being broadcasted
- **safeSend.js**: Logs data being sent to individual windows

## Testing

### Test Suite
Created comprehensive tests in `tests/alert-data-flow.test.js` that verify:

1. **Array Unwrapping Logic**: Ensures arrays are properly unwrapped
2. **Data Structure Validation**: Verifies all required fields are preserved
3. **View Data Processing**: Tests how different views process the data
4. **Integration Tests**: End-to-end pipeline testing
5. **Renderer Pipeline Testing**: Verifies the preload.js fix

### Demo Script
Created `tests/alert-pipeline-demo.js` that demonstrates:

- The old (broken) behavior
- The new (fixed) behavior
- Complete pipeline flow
- Impact on views

## Benefits of the Fix

### ✅ What's Fixed
- Views no longer receive array-wrapped data
- Direct property access works: `alertData.hero`, `alertData.price`, etc.
- Consistent data structure across all views
- Better debugging and logging capabilities

### 🚫 What's Prevented
- Undefined property access errors
- Need for array unwrapping in view code
- Inconsistent data handling across views
- Confusing debugging experience

## Files Modified

1. **`src/main/collectors/chronos.js`**
   - Added array unwrapping logic
   - Added comprehensive logging
   - Fixed data structure before broadcasting

2. **`src/renderer/preload.js`**
   - Removed array wrapping in `eventsAPI.onAlert`
   - Fixed callback to pass data directly

3. **`src/main/utils/broadcast.js`**
   - Added detailed logging for data being broadcasted

4. **`src/main/utils/safeSend.js`**
   - Added detailed logging for data being sent to windows

5. **`tests/alert-data-flow.test.js`**
   - Comprehensive test suite for the pipeline

6. **`tests/alert-pipeline-demo.js`**
   - Demonstration script showing the fix in action

## Verification

### Running Tests
```bash
npm test -- tests/alert-data-flow.test.js
```

### Running Demo
```bash
node tests/alert-pipeline-demo.js
```

### Manual Testing
1. Start the application
2. Open the events window
3. Wait for alerts to come in
4. Verify alerts display correctly with proper data
5. Check console logs for detailed pipeline information

## Future Considerations

### Monitoring
- The added logging will help monitor the pipeline in production
- Watch for any new array wrapping issues
- Monitor data structure consistency

### Maintenance
- If the WebSocket server changes payload format, update chronos.js accordingly
- Keep tests updated with any data structure changes
- Monitor for any new views that need alert data

## Conclusion

This fix resolves the array wrapping issue at its source in the pipeline rather than patching it in individual views. The solution is:

1. **Robust**: Handles both array and non-array payloads
2. **Maintainable**: Centralized logic in the appropriate layers
3. **Testable**: Comprehensive test coverage
4. **Observable**: Detailed logging for debugging
5. **Consistent**: Same data structure across all views

The alert data pipeline now works correctly, providing clean, unwrapped data to all renderer views.
