# Plan 02: Preview Mode & Permission Cleanup (Phase 2)

---

## 1. Goal & Scope

Integrate the pre-meeting preview flow (`PreviewComponent`), device enumeration probing (`DeviceService`), and permission monitoring (`MediaPermissionsService`) with the unified media engine. Ensure zero hardware lock leakage (fixing camera LED indicator light sticking when probing devices).

---

## 2. Technical Design & Workflow

### 2.1 Preview Lifecycle Sequence

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant PC as PreviewComponent
    participant DS as DeviceService
    participant UMS as UnifiedMediaService / CameraService
    participant GUM as navigator.mediaDevices.getUserMedia

    User->>PC: Enter Preview Page
    PC->>DS: loadDevices()
    DS->>UMS: Check/Probe Permissions
    alt Permission needed & device exists
        UMS->>GUM: Minimal Probe getUserMedia()
        GUM-->>UMS: Stream acquired
        UMS->>UMS: Stop probe tracks IMMEDIATELY
    end
    DS-->>PC: Populated device lists (cameras, mics, speakers)
    
    PC->>UMS: initPreviewSession(isVideoCall, selectedCam, selectedMic)
    UMS->>GUM: getUserMedia({ video, audio })
    GUM-->>UMS: Preview MediaStream
    UMS-->>PC: Attach stream to <video> preview element

    User->>PC: Toggle Camera / Mic in Preview
    PC->>UMS: togglePreviewCamera() / togglePreviewMic()
    UMS->>UMS: Stop/enable tracks cleanly & update signals

    User->>PC: Click "Join" OR Navigate Away
    PC->>UMS: stopMediaPreview() / releaseAllMedia()
    UMS->>UMS: All preview tracks stopped; LED OFF
```

---

## 3. Files to Modify

### 3.1 `src/app/preview/preview.component.ts`
- **Current Issue**: Directly manages video elements and calls both `MeetingService.requestMediaPreview` and `MediaPermissionsService.requestPermissions`.
- **Modifications**:
  - Replace `initializeMediaStream()`, `startPreview()`, and `stopPreview()` with calls to `UnifiedMediaService.initPreviewSession()` and `stopMediaPreview()`.
  - In `ngOnDestroy()`, call `UnifiedMediaService.stopMediaPreview()`.
  - Bind the preview template video element to `UnifiedMediaService.previewStream()`.

### 3.2 `src/app/layout/device.service.ts`
- **Current Issue**: Inline `getUserMedia` probing in `loadDevices()` (lines 39-44) can leave tracks open if exceptions occur during device enumeration.
- **Modifications**:
  - Wrap probe stream creation with strict `try...finally` track stopping to guarantee hardware camera LED turns off immediately.
  - Read active default device IDs directly from track settings before disposing of probe stream.

### 3.3 `src/app/providers/services/media-permission.service.ts`
- **Current Issue**: `fallbackPermissionCheck()` directly calls `getUserMedia` with `{ width: 1, height: 1 }` and manually stops tracks.
- **Modifications**:
  - Ensure fallback probe uses unified cleanup helpers to eliminate any lingering audio/video track references.

---

## 4. Expected Effects & Impact
- **No Camera LED Sticking**: When users visit the preview page or device settings, the camera light only illuminates when camera preview is explicitly ON.
- **Immediate Teardown**: Closing the tab or clicking "Back" immediately releases camera and microphone locks.
- **Audio-Only Preview Support**: In audio-only calls, camera is never requested, saving CPU and battery.

---

## 5. Pros & Cons

### Pros
- Eliminates duplicate preview streams across `PreviewComponent` and `MeetingService`.
- Guarantees deterministic track disposal during device enumeration.
- Transparently handles auto-selection of first available devices.

### Cons & Mitigation
- *Risk*: Switching cameras in preview mode might flicker the preview `<video>`.
- *Mitigation*: Stop old video track only after the new camera stream is successfully acquired, providing a seamless visual transition.
