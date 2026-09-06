# 4G Video Blur — Complete Diagnostic Analysis Report

> **Application:** Angular + LiveKit Conferencing (Confeet)
> **LiveKit SDK:** `livekit-client` v2.5.9 + `@livekit/track-processors` v0.6.0
> **Date:** September 2026
> **Benchmark:** Microsoft Teams & Google Meet

---

## Executive Summary

After a full codebase audit of the video pipeline—from camera capture through LiveKit publication, WebRTC encoding/network adaptation, to remote subscriber rendering—**five root causes** have been identified that collectively explain why remote video becomes blurry on 4G networks.

The issues are ranked by impact:

| # | Root Cause | Severity | Impact |
|---|-----------|----------|--------|
| 1 | **Room created with zero configuration** — no `adaptiveStream`, no `dynacast`, no `videoCaptureDefaults`, no `publishDefaults`, no simulcast | 🔴 Critical | No intelligent bandwidth adaptation; all-or-nothing quality |
| 2 | **Camera capture uses browser defaults** — no explicit resolution/framerate | 🟠 High | Uncontrolled capture quality (could be 480p on mobile) |
| 3 | **No `publishDefaults` or video encoding settings** — no bitrate floors/ceilings | 🟠 High | WebRTC encoder has no guidance; may over-compress on 4G |
| 4 | **Camera lifecycle mixes two incompatible approaches** — `setCameraEnabled()` vs `stop()/unpublish()/recreate` | 🟡 Medium | Unnecessary track recreation can reset encoder state |
| 5 | **`attachLocalVideo()` selects wrong video publication** — uses `[0]` instead of source-aware lookup | 🟡 Medium | May display screen share instead of camera |

---

## 1. Architecture Deep-Dive: The Video Pipeline

### 1.1 Current Pipeline (What Actually Happens)

```text
                    ┌──────────────────────────────┐
                    │  Camera Device               │
                    └──────────┬───────────────────┘
                               │
                               ▼
                    ┌──────────────────────────────┐
                    │  createLocalTracks()          │
                    │  video: { deviceId: ... }     │
                    │  ❌ NO resolution             │
                    │  ❌ NO frameRate              │
                    │  ❌ NO width/height           │
                    └──────────┬───────────────────┘
                               │
                               ▼
                    ┌──────────────────────────────┐
                    │  room.localParticipant        │
                    │  .publishTrack(videoTrack)    │
                    │  ❌ NO TrackPublishOptions     │
                    │  ❌ NO videoEncoding           │
                    │  ❌ NO simulcastLayers         │
                    └──────────┬───────────────────┘
                               │
                               ▼
                    ┌──────────────────────────────┐
                    │  new Room()                   │
                    │  ❌ NO adaptiveStream          │
                    │  ❌ NO dynacast                │
                    │  ❌ NO videoCaptureDefaults     │
                    │  ❌ NO publishDefaults          │
                    └──────────┬───────────────────┘
                               │
                               ▼
                         Network (4G)
                               │
                               ▼
                    ┌──────────────────────────────┐
                    │  Remote Subscriber            │
                    │  Gets whatever WebRTC gives   │
                    │  ❌ NO quality preference       │
                    └──────────────────────────────┘
```

### 1.2 How Teams & Meet Handle This (Benchmark)

```text
                    ┌──────────────────────────────┐
                    │  Camera Device               │
                    └──────────┬───────────────────┘
                               │
                               ▼
                    ┌──────────────────────────────┐
                    │  Capture 720p @ 30fps         │
                    │  (explicit constraints)       │
                    └──────────┬───────────────────┘
                               │
                               ▼
                    ┌──────────────────────────────┐
                    │  Simulcast: 3 layers          │
                    │  High:  720p  (~1.5 Mbps)     │
                    │  Medium: 360p (~500 kbps)     │
                    │  Low:   180p  (~150 kbps)     │
                    └──────────┬───────────────────┘
                               │
                               ▼
                    ┌──────────────────────────────┐
                    │  SFU selects best layer       │
                    │  per subscriber's bandwidth   │
                    └──────────┬───────────────────┘
                               │
                         Network (4G)
                               │
                               ▼
                    ┌──────────────────────────────┐
                    │  Adaptive Stream:             │
                    │  360p if element is small     │
                    │  720p if element is large     │
                    └──────────────────────────────┘
```

---

## 2. Root Cause Analysis

### 2.1 🔴 CRITICAL: `new Room()` Has Zero Configuration

**File:** [`room.service.ts`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/providers/services/room.service.ts#L89)

```typescript
// Line 89 — CURRENT CODE
const room = new Room();
```

**What this means:**

In `livekit-client` v2.5.9, when `Room` is constructed without options:

| Setting | Default | Impact |
|---------|---------|--------|
| `adaptiveStream` | `false` | Every subscriber receives the **full** stream regardless of element size or network |
| `dynacast` | `false` | Publisher sends **all** encoding layers even when nobody is subscribing to them |
| `videoCaptureDefaults` | `undefined` | Camera capture relies on browser defaults (varies by device) |
| `publishDefaults` | `undefined` | No simulcast, no video encoding presets, no bitrate guidance |

**Why this is the primary root cause:**

Without `adaptiveStream`, the LiveKit SFU cannot intelligently select a quality layer for the subscriber. Without simulcast (enabled via `publishDefaults`), the publisher only sends **one** encoding layer. When network conditions deteriorate on 4G, WebRTC's only option is to **reduce bitrate within that single layer**, which causes aggressive compression artifacts (blur).

**How Teams & Meet solve this:**

Both platforms use multi-layer simulcast (typically 3 layers: ~180p, ~360p, ~720p). The SFU selects the appropriate layer per subscriber based on:
- Available downstream bandwidth
- Video element size on screen
- Number of visible participants
- CPU load

Teams additionally employs AI-based "Super Resolution" to upscale low-resolution layers client-side, making a 360p stream appear sharper.

---

### 2.2 🟠 HIGH: Camera Capture Uses Browser Defaults

**File:** [`camera.service.ts`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/providers/services/camera.service.ts#L46-L55)

```typescript
// Line 48-50 — CURRENT CODE
const tracks = await createLocalTracks({
  video: { deviceId: deviceId || undefined },
});
```

**Also in:**
- [`camera.service.ts:146-150`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/providers/services/camera.service.ts#L146-L150) (`startCamera`)

**What this means:**

No explicit `width`, `height`, or `frameRate` constraints are passed. The browser chooses a resolution, which is typically:

| Browser/Device | Default Resolution |
|---------------|-------------------|
| Chrome desktop | 640×480 (VGA) |
| Chrome mobile | 640×480 or lower |
| Safari mobile | Device-dependent |
| Firefox | 640×480 |

This means the camera may be capturing at **480p** even on a device capable of 720p or 1080p. The entire pipeline downstream is limited by this capture resolution.

**How Teams & Meet solve this:**

- **Google Meet**: Captures at 720p by default, with fallback constraints for lower-powered devices
- **Teams**: Captures at 720p on desktop, 540p on mobile; uses `ideal` constraints to allow graceful fallback

---

### 2.3 🟠 HIGH: No Publish Defaults or Video Encoding Configuration

**File:** [`camera.service.ts`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/providers/services/camera.service.ts#L53)

```typescript
// Line 53 — CURRENT CODE
await room.localParticipant.publishTrack(videoTrack);
// ❌ No second argument (TrackPublishOptions)
```

**What this means:**

When `publishTrack` is called without `TrackPublishOptions`:
- No `videoEncoding` (bitrate/maxBitrate) is specified
- No `simulcastEncoding` layers are defined
- No `videoCodec` preference is set
- The WebRTC encoder operates with zero guidance

Without explicit encoding settings, the WebRTC engine uses its own internal bitrate allocation, which can be overly conservative on mobile networks.

---

### 2.4 🟡 MEDIUM: Camera Toggle Lifecycle Inconsistency

**Mixed approaches found in the codebase:**

| Method | Location | Approach | Track Recreated? |
|--------|----------|----------|-----------------|
| `disableCamera()` | [`camera.service.ts:58-66`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/providers/services/camera.service.ts#L58-L66) | `track.stop()` + `unpublishTrack()` | ✅ Yes (destructive) |
| `turnCameraOff()` | [`meeting.service.ts:562-568`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/meeting/meeting.service.ts#L562-L568) | `setCameraEnabled(false)` | ❌ No (mute only) |
| `turnCameraOn()` | [`meeting.service.ts:537-557`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/meeting/meeting.service.ts#L537-L557) | Mixed — checks existing then creates new | Sometimes |
| `leaveRoom()` | [`meeting.service.ts:283-320`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/meeting/meeting.service.ts#L283-L320) | `setCameraEnabled(false)` + `stopAllTracks()` | Both |
| `releaseAllMedia()` | [`meeting.service.ts:488-510`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/meeting/meeting.service.ts#L488-L510) | `setCameraEnabled(false)` (**not awaited!**) | Race condition |

**Key problems:**

1. **`disableCamera()`** destroys and unpublishes the track, while **`turnCameraOff()`** only mutes it. When the camera is toggled back on, `turnCameraOn()` may need to recreate the track from scratch, which:
   - Resets the WebRTC encoder state
   - Causes a brief black frame on the remote side
   - May capture at a different resolution
   - Triggers a new ICE candidate pair negotiation

2. **`turnCameraOff()`** at [`meeting.service.ts:563`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/meeting/meeting.service.ts#L563) does NOT `await` the `setCameraEnabled(false)` call:
   ```typescript
   // Line 563 — NOT AWAITED
   room.localParticipant.setCameraEnabled(false);
   ```

3. **`releaseAllMedia()`** at [`meeting.service.ts:496-497`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/meeting/meeting.service.ts#L496-L497) also does NOT await:
   ```typescript
   // Lines 496-497 — NOT AWAITED
   room.localParticipant.setCameraEnabled(false);
   room.localParticipant.setMicrophoneEnabled(false);
   ```

---

### 2.5 🟡 MEDIUM: Video Publication Lookup Not Source-Aware

**File:** [`camera.service.ts`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/providers/services/camera.service.ts#L248)

```typescript
// Line 248 — CURRENT CODE (attachLocalVideo)
const pub = [...room.localParticipant.videoTrackPublications.values()][0];
```

**Also in:** [`meeting.service.ts:520`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/meeting/meeting.service.ts#L520), [`meeting.service.ts:538`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/meeting/meeting.service.ts#L538), [`meeting.service.ts:544`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/meeting/meeting.service.ts#L544), [`meeting.service.ts:552`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/meeting/meeting.service.ts#L552)

Using `[0]` is not source-aware. When both camera and screen share are published simultaneously, `[0]` may return the screen share publication instead of the camera, leading to incorrect track assignment and potential quality issues.

---

## 3. Additional Findings

### 3.1 ✅ VideoBackgroundService Is NOT a Root Cause

**File:** [`video-background.service.ts`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/providers/services/video-background.service.ts)

The `VideoBackgroundService` uses `@livekit/track-processors` v0.6.0, which is LiveKit's official track processor library. It uses:
- `BackgroundBlur(radius)` — official LiveKit processor
- `VirtualBackground(imageUrl)` — official LiveKit processor
- `track.setProcessor()` / `track.stopProcessor()` — LiveKit's built-in processor API

These processors use **WebGL-based** segmentation that operates at the **source track resolution**. They do NOT downscale the canvas or use `captureStream()`. The LiveKit track processor pipeline preserves the original capture resolution.

**Verdict:** Not a quality degradation source. No action needed.

### 3.2 ✅ Remote Video Rendering Is Correct

**File:** [`video.component.ts`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/video/video.component.ts)

The `VideoComponent` correctly:
- Uses `track.attach(videoEl)` — LiveKit's standard API
- Does NOT manually set video element dimensions
- CSS uses `object-fit: cover` for camera, `object-fit: contain` for screen share

The video element CSS in [`video.component.css`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/video/video.component.css) uses `width: 100%; height: 100%` which lets the browser scale the video to the container. This is correct.

### 3.3 ⚠️ NetworkService Is Basic

**File:** [`network.service.ts`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/providers/services/network.service.ts)

The network service only tracks online/offline status and "slow" (latency > 1s). It does NOT:
- Monitor WebRTC connection quality
- Log sender/receiver statistics
- Report quality limitation reasons
- Detect simulcast layer changes

This is not a root cause, but it means the application has **zero observability** into video quality metrics.

### 3.4 ⚠️ Preview Stream ≠ Meeting Stream

**File:** [`meeting.service.ts:397-426`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/meeting/meeting.service.ts#L397-L426)

Preview uses `navigator.mediaDevices.getUserMedia()` with `video: true` (browser defaults), while the meeting uses `createLocalTracks()` (also browser defaults, but through LiveKit). These are **separate streams** with potentially different resolutions.

A sharp preview does NOT guarantee a sharp meeting camera.

---

## 4. Benchmark Comparison: Confeet vs Teams vs Meet

### 4.1 Feature Comparison

| Feature | Confeet (Current) | Google Meet | Microsoft Teams |
|---------|------------------|-------------|-----------------|
| **Camera Capture** | Browser default (~480p) | 720p explicit | 720p desktop / 540p mobile |
| **Simulcast** | ❌ Disabled | ✅ 3 layers | ✅ 3 layers |
| **Adaptive Stream** | ❌ Disabled | ✅ Element-size aware | ✅ Element-size aware |
| **Dynacast** | ❌ Disabled | ✅ Pauses unused layers | ✅ Pauses unused layers |
| **Bitrate Floors** | ❌ None | ✅ Per-layer minimums | ✅ Per-layer minimums |
| **Congestion Control** | Browser default only | Custom ABR + TWCC | Custom ABR + REMB/TWCC |
| **Quality Monitoring** | ❌ None | ✅ Real-time stats | ✅ Real-time stats + AI upscale |
| **4G Adaptation** | All-or-nothing bitrate | Graceful layer switching | Graceful layer switching + Super Resolution |
| **Hardware Acceleration** | Browser default | ✅ Explicit VP8/VP9/H264 | ✅ Explicit H264/VP9 |

### 4.2 Why Teams & Meet Stay Sharp on 4G

```text
4G bandwidth drops from 5 Mbps to 800 kbps:

┌─────────────────────────────────────────────────────┐
│ CONFEET (current)                                   │
│                                                     │
│  Single stream: 480p @ 1.5 Mbps                     │
│  → WebRTC compresses to fit 800 kbps                │
│  → Massive quality loss (blur, artifacts)           │
│  → No recovery until bandwidth improves             │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ TEAMS / MEET                                        │
│                                                     │
│  3 simulcast layers:                                │
│    High:   720p @ 1.5 Mbps  → PAUSED               │
│    Medium: 360p @ 500 kbps  → ACTIVE ✅              │
│    Low:    180p @ 150 kbps  → STANDBY               │
│                                                     │
│  SFU switches subscriber to 360p layer              │
│  → Clean, sharp 360p (no compression artifacts)     │
│  → Instant recovery when bandwidth returns          │
└─────────────────────────────────────────────────────┘
```

**Key insight:** The fundamental difference is that Teams/Meet send multiple pre-encoded layers at clean, sustainable bitrates. The SFU switches between layers. Confeet sends one stream and relies on WebRTC to compress it within the bandwidth constraint, which causes visible blur.

---

## 5. Recommended Fixes (Prioritized)

### 5.1 🔴 Fix 1: Configure Room with LiveKit Best Practices

**File:** [`room.service.ts`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/providers/services/room.service.ts#L89)

```typescript
// BEFORE (Line 89)
const room = new Room();

// AFTER
const room = new Room({
  adaptiveStream: true,
  dynacast: true,
  videoCaptureDefaults: {
    resolution: VideoPresets.h720.resolution,  // 1280×720
    facingMode: 'user',
  },
  publishDefaults: {
    videoSimulcastLayers: [
      VideoPresets.h180,
      VideoPresets.h360,
    ],
    videoCodec: 'vp8',
    dtx: true,          // Discontinuous Transmission for audio
    red: true,          // Redundant Encoding for audio
    stopMicTrackOnMute: false,
  },
});
```

**Import required:**
```typescript
import { Room, RoomEvent, VideoPresets, /* ... */ } from 'livekit-client';
```

**What this does:**
- **`adaptiveStream: true`** — LiveKit auto-selects the optimal quality layer based on the subscriber's video element size and network
- **`dynacast: true`** — Publisher stops encoding layers that no subscriber needs, saving CPU/bandwidth
- **`videoCaptureDefaults`** — Ensures all camera tracks capture at 720p
- **`publishDefaults.videoSimulcastLayers`** — Creates 3 encoding layers: 720p (source), 360p, 180p
- **`dtx` + `red`** — Optimizes audio bandwidth

---

### 5.2 🟠 Fix 2: Centralize Camera Track Creation

**File:** [`camera.service.ts`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/providers/services/camera.service.ts)

Create one central method for camera track creation:

```typescript
// Add to camera.service.ts

/**
 * Central camera track creation with standardized quality settings.
 * All camera creation paths should go through this method.
 */
private async createCameraTrack(deviceId?: string): Promise<LocalVideoTrack> {
  const tracks = await createLocalTracks({
    video: {
      deviceId: deviceId || undefined,
      resolution: VideoPresets.h720.resolution,
    },
  });
  
  const videoTrack = tracks.find((t) => t.kind === 'video') as LocalVideoTrack;
  if (!videoTrack) {
    throw new Error('Failed to create camera track');
  }

  // Diagnostic log — safe for production
  const settings = videoTrack.mediaStreamTrack?.getSettings();
  console.log('[CameraService] Track created:', {
    width: settings?.width,
    height: settings?.height,
    frameRate: settings?.frameRate,
    deviceId: settings?.deviceId,
  });
  
  return videoTrack;
}
```

Then update all callers:
- `enableCamera()` → use `createCameraTrack(deviceId)`
- `startCamera()` → use `createCameraTrack(opts?.deviceId)`

---

### 5.3 🟠 Fix 3: Standardize Camera Toggle Lifecycle

**File:** [`camera.service.ts`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/providers/services/camera.service.ts)

Replace the destructive `disableCamera()`:

```typescript
// BEFORE: Destructive — stops and unpublishes
async disableCamera(room: Room) {
  room.localParticipant.videoTrackPublications.forEach((trackPub) => {
    if (trackPub.source === Track.Source.Camera && trackPub.track) {
      trackPub.track.stop();                            // ← destroys
      room.localParticipant.unpublishTrack(trackPub.track); // ← removes
    }
  });
}

// AFTER: Non-destructive — mutes only
async disableCamera(room: Room) {
  await room.localParticipant.setCameraEnabled(false);
}
```

And fix the un-awaited call in `MeetingService.turnCameraOff()`:

```typescript
// BEFORE (meeting.service.ts line 563)
room.localParticipant.setCameraEnabled(false);

// AFTER
await room.localParticipant.setCameraEnabled(false);
```

---

### 5.4 🟡 Fix 4: Use Source-Aware Publication Lookup

Replace all `[0]` video publication lookups:

```typescript
// BEFORE
const pub = [...room.localParticipant.videoTrackPublications.values()][0];

// AFTER
const pub = [...room.localParticipant.videoTrackPublications.values()]
  .find(p => p.source === Track.Source.Camera);
```

**Locations to fix:**
- [`camera.service.ts:248`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/providers/services/camera.service.ts#L248) — `attachLocalVideo()`
- [`camera.service.ts:256`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/providers/services/camera.service.ts#L256) — `detachLocalVideo()`
- [`camera.service.ts:189`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/providers/services/camera.service.ts#L189) — `switchCamera_Old()`
- [`meeting.service.ts:520`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/meeting/meeting.service.ts#L520) — `enableCameraInternal()`
- [`meeting.service.ts:538`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/meeting/meeting.service.ts#L538) — `turnCameraOn()`
- [`meeting.service.ts:544`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/meeting/meeting.service.ts#L544) — `turnCameraOn()`
- [`meeting.service.ts:552`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/meeting/meeting.service.ts#L552) — `turnCameraOn()`

---

### 5.5 🟢 Fix 5: Add Diagnostic Logging (Optional but Highly Recommended)

Add a production-safe diagnostic logger for WebRTC stats. This enables future debugging without guesswork:

```typescript
// Add to meeting.service.ts or a new diagnostics.service.ts

private startVideoQualityMonitor(room: Room): void {
  setInterval(async () => {
    const pub = [...room.localParticipant.videoTrackPublications.values()]
      .find(p => p.source === Track.Source.Camera);
    
    if (!pub?.track) return;
    
    const settings = pub.track.mediaStreamTrack?.getSettings();
    
    console.log('[VideoQuality] Capture:', {
      width: settings?.width,
      height: settings?.height,
      frameRate: settings?.frameRate,
    });
  }, 10000); // Every 10 seconds
}
```

---

## 6. Expected Outcome After Fixes

### Before (Current State)
```text
4G @ 800 kbps available bandwidth:

Camera → 480p (browser default)
  → Single stream, no simulcast
  → WebRTC compresses aggressively
  → Remote sees: blurry, artifact-heavy 480p
```

### After (With Fixes Applied)
```text
4G @ 800 kbps available bandwidth:

Camera → 720p (explicit capture)
  → 3 simulcast layers: 720p, 360p, 180p
  → SFU selects 360p layer (clean, within bandwidth)
  → Remote sees: clean, sharp 360p
  → When bandwidth recovers → instant switch to 720p
```

---

## 7. Implementation Order

| Phase | Fix | Effort | Risk |
|-------|-----|--------|------|
| **Phase 1** | Configure Room (`new Room({...})`) | 30 min | Low — additive change |
| **Phase 2** | Centralize camera track creation | 1 hour | Low — refactor, no API change |
| **Phase 3** | Fix camera toggle lifecycle | 45 min | Medium — behavior change |
| **Phase 4** | Source-aware publication lookup | 30 min | Low — correctness fix |
| **Phase 5** | Add diagnostic logging | 30 min | None — observability only |

**Total estimated effort: ~3 hours**

---

## 8. Testing Strategy

### Test Matrix (from investigation document section 23)

| Network | Background | Expected After Fix |
|---------|------------|-------------------|
| Wi-Fi | OFF | 720p, sharp |
| Wi-Fi | ON | 720p, sharp (processor preserves resolution) |
| Good 4G | OFF | 720p or 360p depending on bandwidth |
| Good 4G | ON | 720p or 360p (same — processor is resolution-preserving) |
| Poor 4G | OFF | 360p or 180p — clean, no compression artifacts |
| Poor 4G | ON | 360p or 180p — clean |

### Verification Steps

1. **Capture resolution**: Check `mediaStreamTrack.getSettings()` after joining — should show `width: 1280, height: 720`
2. **Simulcast layers**: Open `chrome://webrtc-internals/` → verify 3 outbound RTP streams (720p, 360p, 180p)
3. **Adaptive switching**: Throttle network in DevTools → verify receiver switches to lower layer (not compressed single stream)
4. **Camera toggle**: Toggle camera ON/OFF multiple times → verify track is NOT destroyed/recreated (stays muted)
5. **Quality recovery**: Throttle network → restore → verify video returns to 720p within seconds

---

## 9. Files Modified Summary

| File | Changes |
|------|---------|
| [`room.service.ts`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/providers/services/room.service.ts) | Add `RoomOptions` to `new Room()` |
| [`camera.service.ts`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/providers/services/camera.service.ts) | Centralize track creation, fix `disableCamera()`, fix all `[0]` lookups |
| [`meeting.service.ts`](file:///c:/ws/bottomhalf/confeet/btc-web-conference/src/app/meeting/meeting.service.ts) | `await` all async calls, fix `[0]` lookups, unify camera lifecycle |

---

## 10. Conclusion

The blurry video on 4G is caused by a **complete absence of LiveKit video quality configuration**, not a specific bug. The application relies entirely on browser defaults for camera capture and WebRTC encoding, with no simulcast layers, no adaptive streaming, and no bandwidth-aware quality management.

The fixes are straightforward, additive, and low-risk. Phase 1 alone (configuring the `Room` constructor) will provide the most dramatic improvement by enabling simulcast and adaptive streaming, which is the standard approach used by Teams, Meet, and all production-quality WebRTC applications.
