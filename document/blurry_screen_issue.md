# LiveKit 4G Video Blur — Investigation Context & Prompt for Another LLM

## 1. Objective

Investigate and fix a video-quality problem in an Angular + LiveKit conferencing application:

> **On 4G/mobile networks, remote participant video becomes blurry/low quality.**

The goal is to determine exactly where quality is being lost and implement a robust fix without breaking camera switching, audio-only calls, screen sharing, background effects, or camera/mic lifecycle.

This document contains the complete context discovered so far. Use it as the starting prompt for an AI coding agent/LLM.

---

## 2. Technology Context

- Frontend: Angular
- Live video: `livekit-client`
- Application has a `MeetingService`
- Camera/microphone lifecycle is delegated partly to `CameraService`
- Video background processing exists through `VideoBackgroundService`
- Calls can be:
  - video calls
  - audio-only calls
  - camera enabled/disabled during a meeting
  - camera device switching
  - screen sharing
- The application supports remote participants and active-speaker sorting.
- The user has specifically observed poor/blurry video when using **4G**.

---

# 3. Primary Problem

## Symptom

When conferencing over a good network the video may look acceptable, but on **4G** the remote participant's video becomes noticeably blurry.

The important distinction is:

```text
Camera capture quality
        ↓
LiveKit LocalVideoTrack
        ↓
LiveKit publication / WebRTC encoding
        ↓
Network adaptation
        ↓
Remote subscriber
        ↓
HTML <video>
```

The blur can originate from different stages.

Do NOT assume that the camera itself is blurry.

The first task is to determine whether:

### Case A — Capture problem

```text
Camera
  ↓
low-resolution MediaStreamTrack
  ↓
LiveKit
  ↓
remote video
```

or:

### Case B — WebRTC/network adaptation problem

```text
Camera
  ↓
high-resolution MediaStreamTrack
  ↓
LiveKit
  ↓
bandwidth adaptation / lower encoding layer
  ↓
4G
  ↓
remote receives low-resolution stream
```

or:

### Case C — Video processing problem

```text
Camera
  ↓
background/processing pipeline
  ↓
lower-quality generated video track
  ↓
LiveKit
```

or a combination.

---

# 4. Why 4G Can Cause Blurry Video

4G does NOT automatically mean that the camera should produce a blurry video.

The key issue is **available bandwidth and WebRTC adaptation**.

A video conference continuously sends encoded video over the network.

For example:

```text
720p @ 30 FPS
       ↓
encoded bitrate
       ↓
network
```

If network conditions deteriorate, WebRTC/LiveKit may reduce the amount of data being transmitted.

Possible adaptation includes:

- lower bitrate
- lower resolution
- lower frame rate
- lower simulcast layer
- temporary degradation
- keyframe/recovery behavior

Therefore:

```text
Good network
    ↓
720p stream
    ↓
sharp video

Poor/unstable 4G
    ↓
bandwidth pressure
    ↓
lower quality layer / bitrate
    ↓
blurry remote video
```

This is generally expected WebRTC behavior.

However, the application must be configured correctly so that:

1. the camera captures an appropriate resolution;
2. LiveKit has suitable publishing settings;
3. simulcast/adaptive streaming/dynacast are used appropriately;
4. the application does not unnecessarily recreate or degrade tracks;
5. the remote side subscribes to an appropriate quality layer;
6. video-processing pipelines do not reduce resolution.

The objective is therefore **not to force maximum 720p/1080p regardless of network**.

The correct objective is:

> Provide the highest stable quality that the current network and device can sustain, while degrading gracefully on poor 4G.

---

# 5. Important Code Findings

## Finding 1 — Camera capture uses almost completely default constraints

Current implementation:

```ts
const tracks = await createLocalTracks({
  video: { deviceId: deviceId || undefined },
});
```

There is no explicit:

```text
width
height
frameRate
```

For example, the code does not explicitly request:

```ts
1280 x 720 @ 30 FPS
```

Therefore the browser/device chooses the capture configuration.

This does not prove that this is the cause of the 4G blur, but it makes the capture quality uncontrolled.

### Recommendation

Investigate and standardize camera capture constraints.

For example, test an appropriate configuration such as:

```ts
video: {
  deviceId: deviceId || undefined,
  width: 1280,
  height: 720,
  frameRate: 30
}
```

Do not blindly force this configuration in production before measuring network/device behavior.

The final configuration should consider:

- desktop
- mobile browser
- 4G
- CPU
- camera capability
- LiveKit simulcast layers

---

# 6. Finding 2 — Capture quality and network quality are currently not measured

The application currently does not appear to log or monitor the actual camera capture settings.

Before changing configuration, measure:

```ts
const settings = videoTrack.mediaStreamTrack?.getSettings();

console.log({
  width: settings?.width,
  height: settings?.height,
  frameRate: settings?.frameRate,
  deviceId: settings?.deviceId
});
```

Also inspect the LiveKit publication and remote subscription statistics.

The investigation must answer:

```text
What resolution is captured?
What resolution is published?
What encoding layers exist?
What layer is the remote subscriber receiving?
What bitrate is being used?
What is packet loss?
What is RTT?
What is available bandwidth?
```

Without these measurements, changing random LiveKit settings is guesswork.

---

# 7. Finding 3 — Multiple camera creation paths exist

The application creates camera tracks in several different ways.

### Path A — MeetingService.joinRoom()

```ts
await this.cameraService.enableCamera(room);
```

### Path B — MeetingService.turnCameraOn()

If no existing camera track:

```ts
await this.cameraService.enableCamera(
  room,
  this.deviceService.selectedCamera()
);
```

### Path C — CameraService.startCamera()

```ts
const [video] = await createLocalTracks({
  video: {
    deviceId: opts?.deviceId,
  },
});
```

These paths do not have a single centralized camera configuration.

This can result in inconsistent behavior.

### Recommendation

Create one central camera-track creation/configuration method.

For example:

```text
createCameraTrack(deviceId, profile)
```

and use it everywhere.

The camera profile should be defined in one place.

---

# 8. Finding 4 — Camera ON/OFF lifecycle mixes two different approaches

The application currently mixes:

### Approach A — Disable/mute existing LiveKit camera

```ts
room.localParticipant.setCameraEnabled(false);
```

and later:

```ts
room.localParticipant.setCameraEnabled(true);
```

### Approach B — Stop and unpublish the track

```ts
track.stop();
room.localParticipant.unpublishTrack(track);
```

Then recreate:

```ts
createLocalTracks(...)
```

and publish again.

These are fundamentally different lifecycle strategies.

Current `CameraService.disableCamera()` does:

```ts
trackPub.track.stop();
room.localParticipant.unpublishTrack(trackPub.track);
```

while `MeetingService.turnCameraOff()` does:

```ts
room.localParticipant.setCameraEnabled(false);
```

This inconsistency is not necessarily the root cause of the 4G blur, but it increases complexity and can lead to unnecessary camera-track recreation.

### Recommendation

Use a consistent model.

For normal camera toggle:

```text
Camera ON
  ↓
publish camera track

Camera OFF
  ↓
disable/mute camera

Camera ON
  ↓
reuse/re-enable track
```

Use track replacement/restart only when actually switching devices or recovering from a failed track.

---

# 9. Finding 5 — `turnCameraOff()` does not await `setCameraEnabled(false)`

Current code:

```ts
room.localParticipant.setCameraEnabled(false);
```

This should be:

```ts
await room.localParticipant.setCameraEnabled(false);
```

This is not expected to be the direct cause of blurry 4G video, but it is a correctness issue in the media lifecycle.

---

# 10. Finding 6 — Video background processing is a major area to inspect

The application has:

```ts
VideoBackgroundService
```

and calls:

```ts
await this.videoBackgroundService.removeBackground(track);
```

The background service may potentially use:

- Canvas
- WebGL
- segmentation
- `VideoFrame`
- `MediaStreamTrackProcessor`
- `MediaStreamTrackGenerator`
- `canvas.captureStream()`
- resizing
- frame transformations

Any of these can potentially reduce quality.

For example:

```text
Camera 1280x720
      ↓
background processing
      ↓
Canvas 640x360
      ↓
captureStream()
      ↓
LiveKit
```

would produce an inherently lower-resolution video.

Therefore, inspect `VideoBackgroundService` before concluding that LiveKit itself is responsible.

---

# 11. Finding 7 — Local camera preview and LiveKit camera are different streams

Preview uses:

```ts
navigator.mediaDevices.getUserMedia(...)
```

with:

```ts
video: enableCamera
  ? (cameraDeviceId ? { deviceId: cameraDeviceId } : true)
  : false
```

Then the meeting camera is created separately using:

```ts
createLocalTracks(...)
```

Therefore:

```text
Preview stream
       ≠
LiveKit camera track
```

unless the implementation explicitly reuses the same MediaStreamTrack.

This means:

> A sharp preview does not automatically prove that the LiveKit camera capture is using the same resolution/settings.

This should be considered during debugging.

---

# 12. Finding 8 — `attachLocalVideo()` can select the wrong video publication

Current code:

```ts
const pub = [...room.localParticipant.videoTrackPublications.values()][0];
```

The room may contain:

```text
Track.Source.Camera
Track.Source.ScreenShare
```

Therefore `[0]` does not guarantee that the selected publication is the camera.

Use:

```ts
const pub = [...room.localParticipant.videoTrackPublications.values()]
  .find(p => p.source === Track.Source.Camera);
```

This is primarily a correctness issue, but it should be fixed.

---

# 13. Finding 9 — Screen share and camera are correctly distinguished in some places

`enableCamera()` checks:

```ts
if (pub.source === Track.Source.Camera)
```

and `stopCamera()` also searches for:

```ts
Track.Source.Camera
```

This is good.

However, other methods still use the first video publication.

Standardize all video-publication lookups by `Track.Source`.

---

# 14. Finding 10 — Microphone is not the likely cause of video blur

The microphone code has some lifecycle inconsistencies, but it is not likely to explain blurry video.

Mic flow:

```text
setMicrophoneEnabled()
```

or:

```text
createLocalTracks()
publishTrack()
```

Camera quality should be investigated independently.

---

# 15. Recommended Investigation Strategy

Do not start by forcing 1080p.

First establish where quality is lost.

## Step 1 — Inspect actual camera capture

After creating the LocalVideoTrack:

```ts
const mediaTrack = videoTrack.mediaStreamTrack;

console.log(
  mediaTrack?.getSettings()
);
```

Record:

```text
width
height
frameRate
deviceId
facingMode
```

Test on:

- Wi-Fi
- good 4G
- poor 4G

---

## Step 2 — Inspect LiveKit publication

Inspect:

```ts
const publication =
  [...room.localParticipant.videoTrackPublications.values()]
    .find(p => p.source === Track.Source.Camera);
```

Record:

```text
trackSid
source
isMuted
track dimensions
```

Also inspect LiveKit's publication/encoding configuration.

---

# 16. Step 3 — Inspect WebRTC statistics

This is extremely important.

Use WebRTC statistics to compare:

### Sender

Look for:

```text
framesPerSecond
frameWidth
frameHeight
bytesSent
packetsSent
packetsLost
retransmittedPacketsSent
roundTripTime
availableOutgoingBitrate
qualityLimitationReason
qualityLimitationDurations
```

### Receiver

Look for:

```text
framesPerSecond
frameWidth
frameHeight
bytesReceived
packetsLost
jitter
jitterBufferDelay
```

The exact LiveKit APIs/version should be checked against the installed `livekit-client` version.

---

# 17. Step 4 — Determine whether 4G is causing quality adaptation

If you observe:

```text
Camera capture:
1280x720

Sender:
1280x720

Network:
low available bitrate

Receiver:
640x360
```

then the application is probably experiencing expected WebRTC/LiveKit adaptive quality behavior.

The solution is NOT necessarily to force 720p.

Instead investigate:

- simulcast
- dynacast
- adaptive stream
- video quality selection
- subscriber preferences
- LiveKit server configuration
- TURN path
- bandwidth
- packet loss
- mobile browser limitations

---

# 18. Step 5 — Inspect LiveKit Room configuration

The other important code that must be reviewed is where `Room` is created.

Look for:

```ts
new Room(...)
```

and:

```ts
room.connect(...)
```

Check whether the application configures:

```text
adaptiveStream
dynacast
videoCaptureDefaults
publishDefaults
videoCodec
simulcast
```

Do not modify these blindly.

First understand the current LiveKit SDK version and supported configuration.

---

# 19. Step 6 — Inspect remote participant subscription

The remote participant may receive a lower quality layer even though the publisher is sending higher-quality layers.

Investigate:

```text
RemoteTrackPublication
Track.Source.Camera
video quality/subscription
adaptive stream
```

If simulcast is enabled, determine which layer the subscriber receives under 4G conditions.

---

# 20. Step 7 — Inspect the background processing pipeline

Review `VideoBackgroundService`.

Specifically look for any transformation such as:

```text
resize
canvas width/height
captureStream
frameRate
WebGL texture size
segmentation output resolution
```

Verify that the processing pipeline preserves the intended resolution.

Test:

```text
Background disabled + 4G
Background enabled + 4G
```

If only the second case is blurry, the background pipeline becomes the primary suspect.

---

# 21. Suggested Target Architecture

The desired architecture should be:

```text
                    ┌──────────────────────┐
                    │   Camera Device      │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Camera Capture       │
                    │ Centralized Config   │
                    │ 720p / adaptive      │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ LocalVideoTrack      │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │ Optional Background  │
                    │ Processing           │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ LiveKit Publication  │
                    │ Simulcast/Encoding   │
                    └──────────┬───────────┘
                               │
                               ▼
                       Network / 4G
                               │
                               ▼
                    ┌──────────────────────┐
                    │ LiveKit Adaptation   │
                    │ / Subscriber Quality │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Remote Video Track   │
                    └──────────────────────┘
```

---

# 22. Recommended Camera Quality Strategy

Do NOT simply force:

```text
1080p + 30 FPS
```

for every device/network.

A better strategy is:

```text
Capture reasonable quality
        ↓
LiveKit simulcast/adaptive streaming
        ↓
Network determines appropriate layer/bitrate
        ↓
Remote gets best sustainable quality
```

Potential profiles could be:

```text
Low:
640x360 @ 15 FPS

Medium:
960x540 @ 24/30 FPS

High:
1280x720 @ 30 FPS
```

But the exact profiles should be chosen based on the application's expected participant count, LiveKit configuration, mobile support, and bandwidth.

---

# 23. Important Diagnostic Test Matrix

Run the same call under:

| Network | Background | Expected observation |
|---|---|---|
| Wi-Fi | OFF | Baseline |
| Wi-Fi | ON | Check processing impact |
| Good 4G | OFF | Check network adaptation |
| Good 4G | ON | Check processing + network |
| Poor 4G | OFF | Identify WebRTC adaptation |
| Poor 4G | ON | Identify combined impact |

For each test record:

```text
Capture resolution
Sender resolution
Receiver resolution
FPS
Bitrate
Packet loss
RTT
Available bitrate
Quality limitation reason
```

This will make the root cause measurable.

---

# 24. Code Cleanup Recommendations

## Centralize camera creation

Avoid multiple implementations:

```text
enableCamera()
startCamera()
turnCameraOn()
```

that each create tracks differently.

Create one controlled path.

---

## Use source-aware publication lookup

Always use:

```ts
.find(p => p.source === Track.Source.Camera)
```

for camera.

Do not use:

```ts
.values()[0]
```

for video tracks.

---

## Standardize camera toggle behavior

Prefer:

```text
toggle camera
    ↓
setCameraEnabled()
```

for normal ON/OFF.

Use:

```text
setDeviceId()
```

or `restartTrack()` for device switching/recovery.

Avoid unnecessary:

```text
stop()
unpublish()
createLocalTracks()
publish()
```

cycles.

---

## Await asynchronous LiveKit operations

For example:

```ts
await room.localParticipant.setCameraEnabled(false);
```

instead of:

```ts
room.localParticipant.setCameraEnabled(false);
```

---

# 25. What We Currently Believe

### High confidence

The application currently does not have a sufficiently explicit/centralized video-quality strategy.

Camera capture is created using mostly default constraints.

Multiple camera creation/lifecycle paths exist.

### Medium/high confidence

The 4G blur may be caused by LiveKit/WebRTC adaptive quality reducing the effective remote resolution because of bandwidth/network conditions.

This must be verified using WebRTC/LiveKit statistics.

### Medium/high confidence

`VideoBackgroundService` could be contributing if it creates a lower-resolution processed track.

This needs code inspection and A/B testing.

### Low confidence

The microphone implementation is responsible.

It is very unlikely.

### Unknown

We still need the following code/configuration before declaring the root cause:

1. `RoomService`
2. `VideoBackgroundService`
3. LiveKit `Room` creation configuration
4. LiveKit `connect()` configuration
5. Remote video subscription/attachment code
6. Installed `livekit-client` version
7. LiveKit server/Cloud configuration if self-hosted
8. WebRTC statistics during the 4G test

---

# 26. Critical Instruction for the Next LLM

Do NOT immediately rewrite the application.

Do NOT simply force:

```text
1280x720
30 FPS
high bitrate
```

because that can make 4G performance worse.

Instead:

1. Trace the complete media pipeline.
2. Measure capture resolution.
3. Measure sender statistics.
4. Measure receiver statistics.
5. Determine whether the receiver is getting a lower simulcast layer.
6. Determine whether bandwidth/packet loss is causing adaptation.
7. Inspect LiveKit room/publish configuration.
8. Inspect background-processing resolution.
9. Identify the exact root cause.
10. Then propose the smallest production-safe change.

The final solution should prioritize:

```text
Sharp video on good networks
        +
Graceful quality reduction on poor 4G
        +
Stable FPS
        +
Low CPU usage
        +
No unnecessary track recreation
        +
Correct camera switching
        +
Correct screen-share behavior
```

---

# 27. Immediate Next Files to Analyze

The next LLM should ask for/analyze these in this order:

### 1. RoomService

Especially:

```text
new Room(...)
room.connect(...)
room options
publish defaults
adaptive stream
dynacast
simulcast
```

### 2. VideoBackgroundService

Especially:

```text
canvas
captureStream
resolution
frame processing
WebGL
segmentation
track replacement
```

### 3. Remote video rendering code

Especially:

```text
RemoteTrackPublication
RemoteVideoTrack
attach()
video element
subscription quality
```

### 4. Package version

Check:

```json
"livekit-client": "..."
```

### 5. WebRTC statistics

Collect one sample from:

```text
Wi-Fi
Good 4G
Poor 4G
```

---

# 28. Final Problem Statement for the AI Coding Agent

> We have an Angular + LiveKit conferencing application where remote video becomes blurry on 4G. The current implementation creates LocalVideoTracks through `createLocalTracks()` with only an optional `deviceId` and does not explicitly control capture resolution/frame rate. There are multiple camera creation and lifecycle paths, mixing `setCameraEnabled()` with stopping/unpublishing/recreating tracks. The application also has a video background processing service that may alter resolution. The exact LiveKit Room configuration, publication encoding/simulcast settings, adaptive streaming behavior, and remote subscription quality have not yet been verified.
>
> Your job is to trace the entire camera pipeline from `getUserMedia/createLocalTracks` through `LocalVideoTrack`, LiveKit publication, WebRTC encoding/network adaptation, and remote subscription/rendering. Determine whether 4G blur is caused by low capture resolution, LiveKit/WebRTC bandwidth adaptation, simulcast layer selection, packet loss/network limitations, video background processing, or a combination.
>
> Do not guess and do not immediately force high resolution/bitrate. First add/identify diagnostics for capture resolution, sender resolution/FPS/bitrate, receiver resolution/FPS/bitrate, packet loss, RTT, available bitrate, and quality limitation reason. Inspect LiveKit Room configuration and the background processing pipeline. Then recommend and implement a production-safe solution that provides high quality on good networks and graceful adaptive quality on 4G.
>
> Also fix the identified code-quality issues: centralize camera track creation, use source-aware camera publication lookup, avoid unnecessary track recreation for normal camera toggling, consistently await asynchronous LiveKit operations, and keep camera/screen-share lifecycles separate.
