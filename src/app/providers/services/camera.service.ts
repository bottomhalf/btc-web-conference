import { Injectable, signal, computed } from '@angular/core';
import {
  createLocalTracks,
  createLocalScreenTracks,
  LocalAudioTrack,
  LocalTrack,
  LocalVideoTrack,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
  LocalTrackPublication,
  VideoPresets,
} from 'livekit-client';

export type MediaMode = 'idle' | 'preview' | 'in-meeting';

export type TrackInfo = {
  trackPublication: RemoteTrackPublication;
  participantIdentity: string;
};

@Injectable({
  providedIn: 'root',
})
export class CameraService {
  // ==================== Reactive State (Single Source of Truth) ====================
  public room = signal<Room | undefined>(undefined);
  public remoteTracksMap = signal<Map<string, TrackInfo>>(new Map());

  // Media mode & loading states
  public mediaMode = signal<MediaMode>('idle');
  public isMediaLoading = signal<boolean>(false);
  public mediaError = signal<string | null>(null);

  // Active track & stream signals
  public isCameraOn = signal<boolean>(false);
  public isMicOn = signal<boolean>(false);
  public isScreenSharing = signal<boolean>(false);

  public previewStream = signal<MediaStream | undefined>(undefined);
  public localCameraTrack = signal<LocalVideoTrack | undefined>(undefined);
  public localScreenTrack = signal<LocalVideoTrack | undefined>(undefined);

  // Device selections
  public selectedCameraId = signal<string | null>(null);
  public selectedMicId = signal<string | null>(null);
  public selectedSpeakerId = signal<string | null>(null);

  // Concurrency Lock: Prevents rapid-click race conditions and WebRTC SDP collisions
  private operationQueue: Promise<any> = Promise.resolve();
  private screenTrack?: MediaStreamTrack;

  constructor() {
    this.setupLifecycleListeners();
  }

  // ==================== Lifecycle & Hardware Edge Cases ====================

  /**
   * Set up global listeners for device change, tab visibility, and browser teardown
   */
  private setupLifecycleListeners(): void {
    if (typeof window === 'undefined') return;

    // 1. Hardware Hot-Plugging: Device change listener (USB webcam/mic plug or unplug)
    if (navigator?.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', async () => {
        console.log('[CameraService] Device change detected (hot-plugging event)');
        await this.handleDeviceChange();
      });
    }

    // 2. Tab Background / Visibility Change
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', () => {
        this.handleVisibilityChange();
      });
    }

    // 3. Browser Back / Refresh / Close Synchronous Teardown
    window.addEventListener('beforeunload', () => {
      this.synchronousTeardown();
    });

    window.addEventListener('pagehide', () => {
      this.synchronousTeardown();
    });
  }

  /**
   * Handle dynamic device change (hot-plugging / unplugging)
   */
  private async handleDeviceChange(): Promise<void> {
    try {
      const { cams, mics } = await this.listDevices();

      // Check Camera fallback if active camera was unplugged
      if (this.isCameraOn()) {
        const activeCamId = this.selectedCameraId();
        const camStillConnected = cams.some((c) => c.deviceId === activeCamId);

        if (!camStillConnected && activeCamId) {
          console.warn('[CameraService] Active camera unplugged! Falling back to default system camera...');
          if (cams.length > 0) {
            const fallbackCamId = cams[0].deviceId;
            await this.switchCamera(this.room() || fallbackCamId, fallbackCamId);
          } else {
            console.warn('[CameraService] No other camera available, disabling camera');
            await this.disableCamera();
          }
        }
      }

      // Check Microphone fallback if active mic was unplugged
      if (this.isMicOn()) {
        const activeMicId = this.selectedMicId();
        const micStillConnected = mics.some((m) => m.deviceId === activeMicId);

        if (!micStillConnected && activeMicId) {
          console.warn('[CameraService] Active microphone unplugged! Falling back to default system mic...');
          if (mics.length > 0) {
            const fallbackMicId = mics[0].deviceId;
            await this.switchMic(this.room() || fallbackMicId, fallbackMicId);
          } else {
            console.warn('[CameraService] No other microphone available, disabling mic');
            await this.disableMic();
          }
        }
      }
    } catch (err) {
      console.warn('[CameraService] Error handling device change:', err);
    }
  }

  /**
   * Handle tab visibility changes
   */
  private handleVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      console.log('[CameraService] Tab switched to background - preserving audio and active connections');
    } else if (document.visibilityState === 'visible') {
      console.log('[CameraService] Tab switched to foreground - verifying live media tracks');
      // Verify preview video track is still active if preview mode is on
      if (this.mediaMode() === 'preview') {
        const previewStream = this.previewStream();
        if (previewStream) {
          const videoTrack = previewStream.getVideoTracks()[0];
          if (videoTrack && videoTrack.readyState === 'ended' && this.isCameraOn()) {
            console.warn('[CameraService] Preview track ended while backgrounded, re-acquiring...');
            this.enableCamera();
          }
        }
      }
    }
  }

  /**
   * Synchronous track disposal for browser exit / reload / beforeunload
   */
  private synchronousTeardown(): void {
    try {
      // 1. Stop preview stream tracks synchronously
      const stream = this.previewStream();
      if (stream) {
        stream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch (e) {}
        });
      }

      // 2. Stop local camera track
      const camTrack = this.localCameraTrack();
      if (camTrack) {
        try {
          camTrack.stop();
        } catch (e) {}
      }

      // 3. Stop local screen track
      const screenTrack = this.localScreenTrack();
      if (screenTrack) {
        try {
          screenTrack.stop();
        } catch (e) {}
      }

      if (this.screenTrack) {
        try {
          this.screenTrack.stop();
        } catch (e) {}
      }

      // 4. Stop room participant tracks synchronously
      const activeRoom = this.room();
      if (activeRoom?.localParticipant) {
        activeRoom.localParticipant.videoTrackPublications.forEach((p) => {
          try {
            p.track?.stop();
          } catch (e) {}
        });
        activeRoom.localParticipant.audioTrackPublications.forEach((p) => {
          try {
            p.track?.stop();
          } catch (e) {}
        });
      }
    } catch (e) {
      console.warn('[CameraService] Error during synchronous teardown:', e);
    }
  }

  // ==================== Concurrency & Lock Helpers ====================

  /**
   * Execute an async media action through a serialized lock to eliminate race conditions
   */
  private async withMediaLock<T>(action: () => Promise<T>): Promise<T> {
    this.isMediaLoading.set(true);
    this.mediaError.set(null);

    const runAction = async (): Promise<T> => {
      try {
        return await action();
      } catch (err: any) {
        console.error('[CameraService] Media operation failed:', err);
        this.mediaError.set(err?.message || 'Media operation failed');
        throw err;
      } finally {
        this.isMediaLoading.set(false);
      }
    };

    // Chain onto existing queue
    this.operationQueue = this.operationQueue.then(runAction, runAction);
    return this.operationQueue;
  }

  // ==================== Session & Mode Lifecycle ====================

  /**
   * Initialize preview session before joining a meeting
   */
  async initPreviewSession(
    enableVideo: boolean = true,
    cameraDeviceId?: string,
    micDeviceId?: string
  ): Promise<MediaStream | undefined> {
    return this.withMediaLock(async () => {
      // Clean up any existing preview stream first
      this.stopMediaPreviewInternal();

      this.mediaMode.set('preview');
      this.selectedCameraId.set(cameraDeviceId || null);
      this.selectedMicId.set(micDeviceId || null);

      const constraints: MediaStreamConstraints = {
        video: enableVideo
          ? (cameraDeviceId ? { deviceId: { ideal: cameraDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } : { width: { ideal: 1280 }, height: { ideal: 720 } })
          : false,
        audio: micDeviceId ? { deviceId: { ideal: micDeviceId } } : true,
      };

      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.previewStream.set(stream);
        this.isCameraOn.set(enableVideo && stream.getVideoTracks().length > 0);
        this.isMicOn.set(stream.getAudioTracks().length > 0);
        console.log('[CameraService] Preview session initialized successfully');
        return stream;
      } catch (error: any) {
        // Fallback: If exact device constraints fail, try relaxed constraints
        console.warn('[CameraService] Exact constraint preview failed, attempting relaxed constraints...', error);
        try {
          const fallbackConstraints: MediaStreamConstraints = {
            video: enableVideo ? true : false,
            audio: true,
          };
          const stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
          this.previewStream.set(stream);
          this.isCameraOn.set(enableVideo && stream.getVideoTracks().length > 0);
          this.isMicOn.set(stream.getAudioTracks().length > 0);
          return stream;
        } catch (fallbackError) {
          console.error('[CameraService] Preview stream acquisition completely failed:', fallbackError);
          this.isCameraOn.set(false);
          this.isMicOn.set(false);
          return undefined;
        }
      }
    });
  }

  /**
   * Stop preview stream and release hardware
   */
  stopMediaPreview(): void {
    this.stopMediaPreviewInternal();
    if (this.mediaMode() === 'preview') {
      this.mediaMode.set('idle');
    }
  }

  private stopMediaPreviewInternal(): void {
    const stream = this.previewStream();
    if (stream) {
      stream.getTracks().forEach((track) => {
        track.stop();
        console.log(`[CameraService] Stopped preview track: ${track.kind}`);
      });
      this.previewStream.set(undefined);
    }
  }

  /**
   * Bind an active LiveKit room to the controller
   */
  bindLiveKitRoom(activeRoom: Room): void {
    this.room.set(activeRoom);
    this.mediaMode.set('in-meeting');

    // Sync initial track states from room participant
    const videoPub = [...activeRoom.localParticipant.videoTrackPublications.values()].find(
      (p) => p.source === Track.Source.Camera
    );
    if (videoPub?.track) {
      this.localCameraTrack.set(videoPub.track as LocalVideoTrack);
      this.isCameraOn.set(!videoPub.isMuted);
    }

    const audioPub = [...activeRoom.localParticipant.audioTrackPublications.values()][0];
    if (audioPub) {
      this.isMicOn.set(!audioPub.isMuted);
    }

    console.log('[CameraService] LiveKit Room bound to controller');
  }

  /**
   * Unbind active LiveKit room
   */
  unbindLiveKitRoom(): void {
    this.room.set(undefined);
    this.localCameraTrack.set(undefined);
    this.localScreenTrack.set(undefined);
    this.isCameraOn.set(false);
    this.isMicOn.set(false);
    this.isScreenSharing.set(false);
    if (this.mediaMode() === 'in-meeting') {
      this.mediaMode.set('idle');
    }
    console.log('[CameraService] LiveKit Room unbound');
  }

  // ==================== Camera Track Creation & Controls ====================

  /**
   * Central camera track creation with standardized resolution and fallbacks
   */
  public async createCameraTrack(deviceId?: string): Promise<LocalVideoTrack> {
    try {
      // Primary attempt: Standard 720p HD preset
      const tracks = await createLocalTracks({
        video: {
          deviceId: deviceId || undefined,
          resolution: VideoPresets.h720.resolution,
        },
      });

      const videoTrack = tracks.find((t) => t.kind === 'video') as LocalVideoTrack;
      if (videoTrack) {
        this.logTrackSettings(videoTrack);
        return videoTrack;
      }
    } catch (primaryErr) {
      console.warn('[CameraService] 720p preset failed, attempting unconstrained fallback...', primaryErr);
    }

    // Fallback attempt: Unconstrained video
    const fallbackTracks = await createLocalTracks({
      video: {
        deviceId: deviceId || undefined,
      },
    });

    const fallbackTrack = fallbackTracks.find((t) => t.kind === 'video') as LocalVideoTrack;
    if (!fallbackTrack) {
      throw new Error('Failed to create camera track with all available constraints');
    }
    this.logTrackSettings(fallbackTrack);
    return fallbackTrack;
  }

  private logTrackSettings(videoTrack: LocalVideoTrack): void {
    const settings = videoTrack.mediaStreamTrack?.getSettings();
    console.log('[CameraService] Camera Track Created:', {
      width: settings?.width,
      height: settings?.height,
      frameRate: settings?.frameRate,
      deviceId: settings?.deviceId,
    });
  }

  /**
   * Enable/Turn ON camera (Mode-aware)
   */
  async enableCamera(roomOrDeviceId?: Room | string, maybeDeviceId?: string): Promise<void> {
    return this.withMediaLock(async () => {
      const activeRoom = this.resolveRoom(roomOrDeviceId);
      const targetDeviceId = typeof roomOrDeviceId === 'string' ? roomOrDeviceId : maybeDeviceId || this.selectedCameraId();

      if (this.mediaMode() === 'preview' || !activeRoom) {
        // Preview Mode: Acquire or enable video track directly on previewStream
        const stream = this.previewStream();
        const existingVideoTrack = stream?.getVideoTracks()[0];

        if (existingVideoTrack && existingVideoTrack.readyState === 'live') {
          existingVideoTrack.enabled = true;
          this.isCameraOn.set(true);
          console.log('[CameraService] Preview camera re-enabled from existing live track');
          return;
        }

        const videoConstraints: MediaStreamConstraints = {
          video: targetDeviceId
            ? { deviceId: { ideal: targetDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        };

        try {
          const videoStream = await navigator.mediaDevices.getUserMedia(videoConstraints);
          const newVideoTrack = videoStream.getVideoTracks()[0];
          if (newVideoTrack) {
            if (stream) {
              // Stop & remove any dead video tracks
              stream.getVideoTracks().forEach((t) => {
                t.stop();
                stream.removeTrack(t);
              });
              stream.addTrack(newVideoTrack);
            } else {
              this.previewStream.set(videoStream);
            }
            this.isCameraOn.set(true);
            if (targetDeviceId) this.selectedCameraId.set(targetDeviceId);
            console.log('[CameraService] Preview camera track acquired and enabled');
          }
        } catch (err) {
          console.warn('[CameraService] Failed to acquire preview camera with ideal constraints, trying fallback...', err);
          try {
            const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            const fallbackTrack = fallbackStream.getVideoTracks()[0];
            if (fallbackTrack) {
              if (stream) {
                stream.getVideoTracks().forEach((t) => {
                  t.stop();
                  stream.removeTrack(t);
                });
                stream.addTrack(fallbackTrack);
              } else {
                this.previewStream.set(fallbackStream);
              }
              this.isCameraOn.set(true);
              console.log('[CameraService] Preview camera track acquired via fallback');
            }
          } catch (fallbackErr) {
            console.error('[CameraService] Preview camera acquisition failed completely:', fallbackErr);
            this.isCameraOn.set(false);
          }
        }
        return;
      }

      // In-Meeting Mode
      const existingCameraPub = [...activeRoom.localParticipant.videoTrackPublications.values()].find(
        (pub) => pub.source === Track.Source.Camera
      );

      if (existingCameraPub?.track) {
        console.log('[CameraService] Unmuting existing camera track...');
        await existingCameraPub.track.unmute();
        await activeRoom.localParticipant.setCameraEnabled(true);
        this.localCameraTrack.set(existingCameraPub.track as LocalVideoTrack);
      } else {
        console.log('[CameraService] Creating and publishing new camera track...');
        const videoTrack = await this.createCameraTrack(targetDeviceId ?? undefined);
        await activeRoom.localParticipant.publishTrack(videoTrack);
        this.localCameraTrack.set(videoTrack);
      }

      this.isCameraOn.set(true);
      if (targetDeviceId) this.selectedCameraId.set(targetDeviceId);
      console.log('[CameraService] Camera enabled successfully');
    });
  }

  /**
   * Disable/Turn OFF camera (Mode-aware)
   */
  async disableCamera(room?: Room): Promise<void> {
    return this.withMediaLock(async () => {
      const activeRoom = this.resolveRoom(room);

      if (this.mediaMode() === 'preview' || !activeRoom) {
        // Preview Mode: Stop all video tracks and remove from previewStream
        const stream = this.previewStream();
        if (stream) {
          stream.getVideoTracks().forEach((track) => {
            track.stop();
            stream.removeTrack(track);
          });
        }
        this.isCameraOn.set(false);
        console.log('[CameraService] Preview camera disabled');
        return;
      }

      // In-Meeting Mode
      await activeRoom.localParticipant.setCameraEnabled(false);
      this.isCameraOn.set(false);
      console.log('[CameraService] Camera disabled successfully');
    });
  }

  /**
   * Toggle camera ON/OFF
   */
  async toggleCamera(room?: Room, deviceId?: string): Promise<boolean> {
    if (this.isCameraOn()) {
      await this.disableCamera(room);
      return false;
    } else {
      await this.enableCamera(room, deviceId);
      return true;
    }
  }

  /**
   * Switch camera input device in place
   */
  async switchCamera(roomOrDeviceId: Room | string, maybeDeviceId?: string): Promise<void> {
    return this.withMediaLock(async () => {
      const activeRoom = this.resolveRoom(roomOrDeviceId);
      const newDeviceId = typeof roomOrDeviceId === 'string' ? roomOrDeviceId : maybeDeviceId;
      if (!newDeviceId) return;

      this.selectedCameraId.set(newDeviceId);

      if (this.mediaMode() === 'preview' || !activeRoom) {
        if (this.isCameraOn()) {
          const videoConstraints: MediaStreamConstraints = {
            video: { deviceId: { ideal: newDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          };
          try {
            const videoStream = await navigator.mediaDevices.getUserMedia(videoConstraints);
            const newTrack = videoStream.getVideoTracks()[0];
            if (newTrack) {
              const stream = this.previewStream();
              if (stream) {
                stream.getVideoTracks().forEach((t) => {
                  t.stop();
                  stream.removeTrack(t);
                });
                stream.addTrack(newTrack);
              } else {
                this.previewStream.set(videoStream);
              }
            }
          } catch (e) {
            console.warn('[CameraService] Error switching preview camera device:', e);
          }
        }
        return;
      }

      // In-Meeting Mode:
      // 1. Unpublish & stop old camera track if active
      const oldPub = [...activeRoom.localParticipant.videoTrackPublications.values()].find(
        (p) => p.source === Track.Source.Camera
      );
      if (oldPub?.track) {
        const oldTrack = oldPub.track as LocalVideoTrack;
        try {
          await oldTrack.stopProcessor();
        } catch (e) {}
        activeRoom.localParticipant.unpublishTrack(oldTrack);
        oldTrack.stop();
      }

      // 2. Create new track with standard preset
      const newVideoTrack = await this.createCameraTrack(newDeviceId);
      if (newVideoTrack) {
        console.log('[CameraService] Switching camera to device:', newDeviceId);
        await activeRoom.localParticipant.publishTrack(newVideoTrack);
        this.localCameraTrack.set(newVideoTrack);
        this.isCameraOn.set(true);
      }
    });
  }

  // ==================== Microphone Controls ====================

  /**
   * Enable/Unmute microphone (Mode-aware)
   */
  async enableMic(roomOrDeviceId?: Room | string, maybeDeviceId?: string): Promise<void> {
    return this.withMediaLock(async () => {
      const activeRoom = this.resolveRoom(roomOrDeviceId);
      const targetDeviceId = typeof roomOrDeviceId === 'string' ? roomOrDeviceId : maybeDeviceId || this.selectedMicId();

      if (this.mediaMode() === 'preview' || !activeRoom) {
        // Preview Mode
        const stream = this.previewStream();
        if (stream && stream.getAudioTracks().length > 0) {
          stream.getAudioTracks().forEach((track) => (track.enabled = true));
          this.isMicOn.set(true);
        } else {
          try {
            const audioStream = await navigator.mediaDevices.getUserMedia({
              audio: targetDeviceId ? { deviceId: { ideal: targetDeviceId } } : true,
              video: false,
            });
            const audioTrack = audioStream.getAudioTracks()[0];
            if (audioTrack) {
              if (stream) {
                stream.addTrack(audioTrack);
              } else {
                this.previewStream.set(audioStream);
              }
              this.isMicOn.set(true);
            }
          } catch (e) {
            console.warn('[CameraService] Failed to acquire preview audio track:', e);
          }
        }
        return;
      }

      // In-Meeting Mode
      const existingAudioPub = [...activeRoom.localParticipant.audioTrackPublications.values()][0];
      if (existingAudioPub?.track) {
        console.log('[CameraService] Unmuting existing microphone track...');
        await existingAudioPub.track.unmute();
      } else {
        console.log('[CameraService] Creating microphone track via setMicrophoneEnabled...');
        try {
          await activeRoom.localParticipant.setMicrophoneEnabled(true, {
            deviceId: targetDeviceId || undefined,
          });
        } catch (setMicErr) {
          console.warn('[CameraService] setMicrophoneEnabled failed, falling back to createLocalTracks...', setMicErr);
          const tracks = await createLocalTracks({
            audio: { deviceId: targetDeviceId || undefined },
          });
          const audioTrack = tracks.find((t) => t.kind === 'audio');
          if (audioTrack) {
            await activeRoom.localParticipant.publishTrack(audioTrack);
          }
        }
      }

      this.isMicOn.set(true);
      if (targetDeviceId) this.selectedMicId.set(targetDeviceId);
      console.log('[CameraService] Microphone enabled');
    });
  }

  /**
   * Disable/Mute microphone (Mode-aware)
   */
  async disableMic(room?: Room): Promise<void> {
    return this.withMediaLock(async () => {
      const activeRoom = this.resolveRoom(room);

      if (this.mediaMode() === 'preview' || !activeRoom) {
        const stream = this.previewStream();
        if (stream) {
          stream.getAudioTracks().forEach((track) => (track.enabled = false));
        }
        this.isMicOn.set(false);
        return;
      }

      // In-Meeting Mode: Mute audio tracks (maintains WebRTC peer connection for instant unmute)
      activeRoom.localParticipant.audioTrackPublications.forEach((trackPub) => {
        trackPub.track?.mute();
      });
      this.isMicOn.set(false);
      console.log('[CameraService] Microphone muted');
    });
  }

  /**
   * Toggle microphone ON/OFF
   */
  async toggleMic(room?: Room, deviceId?: string): Promise<boolean> {
    if (this.isMicOn()) {
      await this.disableMic(room);
      return false;
    } else {
      await this.enableMic(room, deviceId);
      return true;
    }
  }

  /**
   * Switch microphone input device
   */
  async switchMic(roomOrDeviceId: Room | string, maybeDeviceId?: string): Promise<void> {
    return this.withMediaLock(async () => {
      const activeRoom = this.resolveRoom(roomOrDeviceId);
      const newDeviceId = typeof roomOrDeviceId === 'string' ? roomOrDeviceId : maybeDeviceId;
      if (!newDeviceId) return;

      this.selectedMicId.set(newDeviceId);

      if (this.mediaMode() === 'preview' || !activeRoom) {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { ideal: newDeviceId } },
            video: false,
          });
          const newAudioTrack = audioStream.getAudioTracks()[0];
          if (newAudioTrack) {
            newAudioTrack.enabled = this.isMicOn();
            const stream = this.previewStream();
            if (stream) {
              stream.getAudioTracks().forEach((t) => {
                t.stop();
                stream.removeTrack(t);
              });
              stream.addTrack(newAudioTrack);
            } else {
              this.previewStream.set(audioStream);
            }
          }
        } catch (e) {
          console.warn('[CameraService] Error switching preview microphone device:', e);
        }
        return;
      }

      // In-Meeting Mode
      console.log('[CameraService] Switching microphone to device:', newDeviceId);
      await activeRoom.localParticipant.setMicrophoneEnabled(this.isMicOn(), { deviceId: newDeviceId });
    });
  }

  // ==================== Screen Share Controls ====================

  /**
   * Start screen sharing with 1080p resolution and audio isolation
   */
  async startScreenShare(room?: Room): Promise<LocalVideoTrack | undefined> {
    return this.withMediaLock(async () => {
      const activeRoom = this.resolveRoom(room);
      if (!activeRoom) {
        console.warn('[CameraService] Cannot start screen share without an active room');
        return undefined;
      }

      try {
        console.log('[CameraService] Requesting screen share display media...');
        // Audio is set to false to isolate screen share from microphone audio and prevent feedback
        const screenTracks = await createLocalScreenTracks({
          audio: false,
          resolution: { width: 1920, height: 1080 },
        });

        const screenVideoTrack = screenTracks.find((t) => t.kind === 'video') as LocalVideoTrack;
        if (!screenVideoTrack || screenVideoTrack.mediaStreamTrack.readyState === 'ended') {
          console.warn('[CameraService] Screen share cancelled by user or no video track acquired');
          return undefined;
        }

        this.screenTrack = screenVideoTrack.mediaStreamTrack;

        // Automatically handle native browser "Stop sharing" button
        screenVideoTrack.mediaStreamTrack.onended = () => {
          console.log('[CameraService] Native browser Stop Sharing triggered');
          this.stopScreenShare(activeRoom);
        };

        await activeRoom.localParticipant.publishTrack(screenVideoTrack, {
          source: Track.Source.ScreenShare,
        });

        this.localScreenTrack.set(screenVideoTrack);
        this.isScreenSharing.set(true);
        console.log('[CameraService] Screen share published successfully');
        return screenVideoTrack;
      } catch (error: any) {
        if (error.name === 'NotAllowedError') {
          console.log('[CameraService] User cancelled screen share picker');
        } else {
          console.error('[CameraService] Failed to start screen share:', error);
        }
        return undefined;
      }
    });
  }

  /**
   * Stop screen sharing and unpublish track
   */
  async stopScreenShare(room?: Room): Promise<void> {
    return this.withMediaLock(async () => {
      const activeRoom = this.resolveRoom(room);

      if (activeRoom && activeRoom.localParticipant) {
        const screenPubs = Array.from(activeRoom.localParticipant.videoTrackPublications.values()).filter(
          (pub) => pub.source === Track.Source.ScreenShare
        );

        for (const pub of screenPubs) {
          if (pub.track) {
            try {
              await activeRoom.localParticipant.unpublishTrack(pub.track);
              pub.track.stop();
            } catch (e) {
              console.warn('[CameraService] Error unpublishing screen track:', e);
            }
          }
        }
      }

      if (this.localScreenTrack()) {
        try {
          this.localScreenTrack()?.stop();
        } catch (e) {}
        this.localScreenTrack.set(undefined);
      }

      if (this.screenTrack) {
        try {
          this.screenTrack.stop();
        } catch (e) {}
        this.screenTrack = undefined;
      }

      this.isScreenSharing.set(false);
      console.log('[CameraService] Screen share stopped');
    });
  }

  /**
   * Toggle screen share ON/OFF
   */
  async toggleScreenShare(room?: Room): Promise<boolean> {
    if (this.isScreenSharing()) {
      await this.stopScreenShare(room);
      return false;
    } else {
      const track = await this.startScreenShare(room);
      return !!track;
    }
  }

  // ==================== Complete Hardware Teardown ====================

  /**
   * Stop all active tracks, dispose processors, and release all hardware resources
   */
  async releaseAllMedia(room?: Room): Promise<void> {
    // Reset operation lock to ensure releaseAllMedia never gets blocked
    this.operationQueue = Promise.resolve();

    return this.withMediaLock(async () => {
      console.log('[CameraService] Releasing all media resources...');

      // 1. Stop preview stream
      try {
        this.stopMediaPreviewInternal();
      } catch (e) {
        console.warn('[CameraService] Error stopping preview stream:', e);
      }

      // 2. Stop room tracks if room exists
      const activeRoom = this.resolveRoom(room);
      if (activeRoom) {
        try {
          await this.stopAllTracksAsync(activeRoom);
        } catch (e) {
          console.warn('[CameraService] Error stopping room tracks:', e);
        }
      }

      // 3. Stop screen share track
      if (this.screenTrack) {
        try {
          this.screenTrack.stop();
        } catch (e) {}
        this.screenTrack = undefined;
      }

      // 4. Stop local camera track if any
      const camTrack = this.localCameraTrack();
      if (camTrack) {
        try {
          await camTrack.stopProcessor();
        } catch (e) {}
        try {
          camTrack.stop();
        } catch (e) {}
        this.localCameraTrack.set(undefined);
      }

      // 5. Stop local screen track if any
      const scrTrack = this.localScreenTrack();
      if (scrTrack) {
        try {
          scrTrack.stop();
        } catch (e) {}
        this.localScreenTrack.set(undefined);
      }

      // 6. Reset all signals to IDLE defaults
      this.isCameraOn.set(false);
      this.isMicOn.set(false);
      this.isScreenSharing.set(false);
      this.mediaMode.set('idle');

      console.log('[CameraService] All media resources successfully released');
    });
  }

  /**
   * Stop and unpublish all tracks published in a LiveKit room asynchronously
   */
  private async stopAllTracksAsync(room: Room): Promise<void> {
    if (!room?.localParticipant) return;

    // Stop all video tracks (camera & screen share)
    const videoPubs = Array.from(room.localParticipant.videoTrackPublications.values());
    for (const pub of videoPubs) {
      if (pub.track) {
        try {
          const videoTrack = pub.track as LocalVideoTrack;
          await videoTrack.stopProcessor();
        } catch (e) {}
        try {
          room.localParticipant.unpublishTrack(pub.track);
          pub.track.stop();
        } catch (e) {
          console.warn('[CameraService] Error unpublishing/stopping video track:', e);
        }
      }
    }

    // Stop all audio tracks
    const audioPubs = Array.from(room.localParticipant.audioTrackPublications.values());
    for (const pub of audioPubs) {
      if (pub.track) {
        try {
          room.localParticipant.unpublishTrack(pub.track);
          pub.track.stop();
        } catch (e) {
          console.warn('[CameraService] Error unpublishing/stopping audio track:', e);
        }
      }
    }

    if (this.screenTrack) {
      try {
        this.screenTrack.stop();
      } catch (e) {}
      this.screenTrack = undefined;
    }
  }

  /**
   * Stop all tracks published in a LiveKit room (synchronous safe version)
   */
  stopAllTracks(room: Room): void {
    if (!room?.localParticipant) return;

    try {
      room.localParticipant.videoTrackPublications.forEach((trackPub) => {
        try {
          if (trackPub.track) {
            trackPub.track.stop();
          }
        } catch (e) {
          console.warn('[CameraService] Error stopping video track:', e);
        }
      });
    } catch (e) {
      console.warn('[CameraService] Error in videoTrackPublications iteration:', e);
    }

    try {
      room.localParticipant.audioTrackPublications.forEach((trackPub) => {
        try {
          if (trackPub.track) {
            trackPub.track.stop();
          }
        } catch (e) {
          console.warn('[CameraService] Error stopping audio track:', e);
        }
      });
    } catch (e) {
      console.warn('[CameraService] Error in audioTrackPublications iteration:', e);
    }

    if (this.screenTrack) {
      try {
        this.screenTrack.stop();
      } catch (e) {}
      this.screenTrack = undefined;
    }
  }

  // ==================== Device Enumeration Helper ====================

  async listDevices(): Promise<{ cams: MediaDeviceInfo[]; mics: MediaDeviceInfo[]; speakers: MediaDeviceInfo[] }> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      cams: devices.filter((d) => d.kind === 'videoinput'),
      mics: devices.filter((d) => d.kind === 'audioinput'),
      speakers: devices.filter((d) => d.kind === 'audiooutput'),
    };
  }

  // ==================== Legacy Compatibility Aliases ====================

  async startCamera(room: Room, opts?: { deviceId?: string }): Promise<LocalVideoTrack> {
    const videoTrack = await this.createCameraTrack(opts?.deviceId);
    await room.localParticipant.publishTrack(videoTrack);
    this.localCameraTrack.set(videoTrack);
    this.isCameraOn.set(true);
    return videoTrack;
  }

  async startMic(room: Room, deviceId?: string): Promise<LocalAudioTrack> {
    const [audio] = await createLocalTracks({ audio: { deviceId } });
    await room.localParticipant.publishTrack(audio);
    this.isMicOn.set(true);
    return audio as LocalAudioTrack;
  }

  stopCamera(room: Room): void {
    const pub = [...room.localParticipant.videoTrackPublications.values()].find(
      (p) => p.source === Track.Source.Camera
    );
    const track = pub?.track as LocalVideoTrack | undefined;
    if (track) {
      room.localParticipant.unpublishTrack(track);
      track.stop();
    }
    this.isCameraOn.set(false);
  }

  stopMic(room: Room): void {
    const pub = [...room.localParticipant.audioTrackPublications.values()][0];
    const track = pub?.track as LocalAudioTrack | undefined;
    if (track) {
      room.localParticipant.unpublishTrack(track);
      track.stop();
    }
    this.isMicOn.set(false);
  }

  attachLocalVideo(room: Room, el: HTMLVideoElement): void {
    const pub = [...room.localParticipant.videoTrackPublications.values()].find(
      (p) => p.source === Track.Source.Camera
    );
    const track = pub?.track as LocalVideoTrack | undefined;
    if (!track) return;
    track.attach(el);
  }

  detachLocalVideo(room: Room, el: HTMLVideoElement): void {
    const pub = [...room.localParticipant.videoTrackPublications.values()].find(
      (p) => p.source === Track.Source.Camera
    );
    const track = pub?.track as LocalVideoTrack | undefined;
    if (!track) return;
    track.detach(el);
  }

  // ==================== Private Helpers ====================

  private resolveRoom(roomOrOther?: Room | any): Room | undefined {
    if (roomOrOther && typeof roomOrOther === 'object' && 'localParticipant' in roomOrOther) {
      return roomOrOther as Room;
    }
    return this.room();
  }
}
