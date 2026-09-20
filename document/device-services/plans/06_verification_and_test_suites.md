# Plan 06: Verification, Test Suites & QA Matrix

---

## 1. Goal & Scope

Provide a comprehensive, section-by-section Quality Assurance (QA) and verification testing suite to ensure that all media operations (camera, mic, screen share, permissions, device switching, and teardown) function flawlessly with zero regressions.

---

## 2. Test Suites Matrix

### Suite 1: Permissions & Device Enumeration
| Test ID | Test Scenario | Step-by-Step Actions | Expected Result | Pass/Fail |
| :--- | :--- | :--- | :--- | :--- |
| **TS1-01** | First-time Permissions Prompt | Open app in incognito window -> Navigate to preview. | Browser displays permission prompt for Camera and Microphone once. | [ ] |
| **TS1-02** | Device Lists Populated | Allow permissions -> Open device settings dropdowns. | Camera, Microphone, and Speaker select inputs display real device names and IDs. | [ ] |
| **TS1-03** | Permission Denied Modal | Deny camera/mic in browser settings -> Refresh. | Permission Denied modal appears with instructions for current browser (Chrome/Edge/Firefox). | [ ] |

---

### Suite 2: Preview Mode Functionality
| Test ID | Test Scenario | Step-by-Step Actions | Expected Result | Pass/Fail |
| :--- | :--- | :--- | :--- | :--- |
| **TS2-01** | Video Preview Start | Enter preview for Video Call. | Camera LED turns ON; video stream renders in preview `<video>` element; mic is active. | [ ] |
| **TS2-02** | Audio-Only Preview | Enter preview with `CallType.AUDIO`. | Camera LED remains strictly OFF; video element is hidden; only mic audio is active. | [ ] |
| **TS2-03** | Toggle Camera in Preview | Click camera button in preview to turn OFF, then ON. | Turning OFF stops video track and powers OFF LED; turning ON restores video stream cleanly. | [ ] |
| **TS2-04** | Toggle Mic in Preview | Click mic button in preview to mute, then unmute. | Muting disables audio track; unmuting enables audio track. | [ ] |
| **TS2-05** | Exit Preview | Click "Back" or close tab while in preview. | All tracks stopped immediately; camera LED turns OFF within 500ms. | [ ] |

---

### Suite 3: In-Meeting WebRTC Camera & Mic Controls
| Test ID | Test Scenario | Step-by-Step Actions | Expected Result | Pass/Fail |
| :--- | :--- | :--- | :--- | :--- |
| **TS3-01** | Join Meeting Transition | Click "Join" from preview. | Preview stream stops; LiveKit room connects; camera and mic publish as LiveKit tracks without video flicker. | [ ] |
| **TS3-02** | Camera Mute / Unmute | Click in-call camera button to turn OFF, then ON. | Video turns OFF for local and remote peers; turning ON re-publishes video track without disconnecting call. | [ ] |
| **TS3-03** | Mic Mute / Unmute | Click in-call mic button to mute, then unmute. | Mic mutes instantly without WebRTC renegotiation delay; speaking indicator reflects state. | [ ] |
| **TS3-04** | Virtual Background | Apply background blur/image while camera is ON. | Background effect applies smoothly; toggling camera OFF cleanly removes effect. | [ ] |
| **TS3-05** | Switch Camera in Call | Select different camera from settings dropdown. | Video switches to new camera track in place; remote peers see new video stream. | [ ] |
| **TS3-06** | Switch Mic in Call | Select different microphone from settings dropdown. | Audio switches to new microphone device without interruption. | [ ] |

---

### Suite 4: Screen Sharing Flow
| Test ID | Test Scenario | Step-by-Step Actions | Expected Result | Pass/Fail |
| :--- | :--- | :--- | :--- | :--- |
| **TS4-01** | Start Screen Share | Click "Share Screen" in meeting toolbar -> Select window. | Native browser picker opens; selected screen renders in 1080p in `ScreenshareComponent` locally and on remote peers. | [ ] |
| **TS4-02** | Stop via App Toolbar | Click "Stop Sharing" button in app toolbar. | Screen track unpublishes; UI reverts to grid layout; remote peers receive track unpublish event. | [ ] |
| **TS4-03** | Stop via Chrome Native Bar | Click native "Stop sharing" floating bar button. | `track.onended` event fires; UI immediately updates and returns to video grid. | [ ] |
| **TS4-04** | Screen Share + Mic State | Start screen share with mic ON, then mute mic during share. | Screen video continues playing; mic mutes/unmutes independently with zero audio feedback. | [ ] |

---

### Suite 5: Mini-Mode & Teardown Lifecycle
| Test ID | Test Scenario | Step-by-Step Actions | Expected Result | Pass/Fail |
| :--- | :--- | :--- | :--- | :--- |
| **TS5-01** | Minimize Meeting | Click minimize button in meeting view. | Floating `MeetingMiniComponent` opens; video/audio tracks continue seamlessly. | [ ] |
| **TS5-02** | Maximize Meeting | Click maximize button in mini window. | Full `MeetingComponent` reopens; all media tracks reattach to full view elements. | [ ] |
| **TS5-03** | Leave Meeting | Click "Leave Meeting" / "End Call". | All LiveKit tracks unpublished; all MediaStreams stopped; room disconnected; camera LED OFF. | [ ] |
| **TS5-04** | USB Disconnect | Unplug active USB webcam during call. | `devicechange` listener detects disconnect; gracefully updates UI without throwing unhandled exceptions. | [ ] |
