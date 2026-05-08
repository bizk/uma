# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AutoRondas Uma is a Chrome extension that automates workflows for medical virtual consultations on `profesionales.umasalud.com`. It auto-clicks consultation buttons, counts patients served in rounds of 11, prevents duplicate counts, and provides audio notifications.

## Key Architecture

### Extension Structure

- **manifest.json**: Chrome Extension Manifest V3 configuration
  - Content script injected on `profesionales.umasalud.com/appointments*` and `/doctor*`
  - Requires `storage` permission for persistence
  - Runs at `document_start` with `all_frames: true`

- **content.js**: Single-file content script (~535 lines) containing all functionality
  - Runs in IIFE to avoid global scope pollution
  - Self-contained module with no external dependencies

### Core Systems

**State Management** (lines 16-26):
- Local state: `pacientesEnRonda`, `rondas`, `estado`, `rondaCompletadaEnCurso`, `skipNextCount`
- Persisted via `chrome.storage.local` (lines 73-106)
- Patient deduplication via `seenPatients` object with TTL-based pruning

**Patient Deduplication** (lines 28-68):
- `seenPatients` object stores visit keys with timestamps
- Max 800 entries, 14-day TTL (`SEEN_TTL_MS`)
- Unique visit keys extracted from URL params: `patientUid`, `appointmentUid`, `appointmentId`, etc. (line 432)
- Pruning on load, mark, and storage operations

**Button Detection & Clicking** (lines 322-429):
- Scans DOM for buttons containing "comenzar" or "retomar"
- Filters out false positives via negative keywords ("historia", "historial", "clinica", etc.)
- Priority system: prefers "Comenzar" over "Retomar", viewport-visible over off-screen
- `skipNextCount` flag prevents counting when "Retomar" is clicked

**URL Navigation Tracking** (lines 431-508):
- Hooks into `history.pushState/replaceState` to detect SPA navigation
- `urlWatchInterval` polls for URL changes every 400ms
- Detects patient page via `/doctor` path or presence of URL params
- Increments counter when navigating to new (unseen) patient page

**UI Panel** (lines 154-298):
- Draggable panel (pointer events, not mouse events for touch support)
- Position persisted to `chrome.storage.local`
- Auto-remounts if removed from DOM (every 2 seconds)
- Controls: Start, Pause, -1 patient, Reset

**Audio Feedback** (lines 114-152):
- Web Audio API beeps (square wave oscillator)
- `successSound()`: triple beep on patient count
- `roundSound()`: escalating 5-beep sequence on round completion

## Development Workflow

### Testing the Extension

1. **Load unpacked extension:**
   ```bash
   # Open chrome://extensions/
   # Enable "Developer mode"
   # Click "Load unpacked" and select this directory
   ```

2. **Test on target site:**
   Navigate to `https://profesionales.umasalud.com/appointments`

3. **View console logs:**
   - Extension has no console.log statements
   - Use Chrome DevTools on the page (not background service worker)

4. **Inspect storage:**
   ```javascript
   // In DevTools console:
   chrome.storage.local.get(null, (data) => console.log(data));
   ```

### Making Changes

**Manifest changes:**
- Version bump required for updates: `manifest.json` line 4
- Permissions changes require reload

**Content script changes:**
- Reload extension in `chrome://extensions/`
- Hard refresh target page (Ctrl+Shift+R)

**Configuration constants** (lines 3-13):
- `PACIENTES_POR_RONDA`: Patients per round (11)
- `CLICK_INTERVAL`: Auto-click frequency (500ms)
- `CLICK_NAV_WINDOW`: Wait time after click (4000ms)
- `SEEN_TTL_MS`: Patient memory duration (14 days)
- `SEEN_MAX`: Max stored patient records (800)

### Common Tasks

**Adjust button detection:**
- Modify keyword arrays at lines 11-13 (`POS_COMENZAR`, `POS_RETOMAR`, `NEG`)
- Edit `getComenzarRetomarButtons()` at line 323

**Change patient counting logic:**
- `onUrlChange()` at line 451 handles URL-based counting
- `isPatientPage()` at line 447 determines patient page detection
- `getUniqueVisitKey()` at line 434 creates deduplication keys

**Modify UI:**
- Panel HTML template at line 179
- Styling inline at line 173
- Update handlers at lines 243-273

**Debugging navigation issues:**
- Check `urlWatchInterval` polling (line 513)
- Verify `history` hooks (lines 496-508)
- Inspect `waitingForNavigation` state machine (lines 408-428)

## Important Constraints

- **No external dependencies**: Pure vanilla JS, no build step
- **Storage limits**: Chrome local storage ~5MB quota
- **Content script context**: No access to page's JS variables, only DOM
- **SPA detection**: Relies on URL changes and polling, not framework hooks
- **Button detection fragility**: Text-based matching may break with site updates

## Site-Specific Notes

- Target: `profesionales.umasalud.com`
- Button text: Spanish ("Comenzar consulta", "Retomar consulta")
- URL structure: Uses query params like `?patientUid=...`, `?appointmentUid=...`
- Navigation: SPA-style (React/Vue-like) with `history.pushState`
