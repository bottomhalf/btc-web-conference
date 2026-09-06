import { Injectable, OnDestroy } from '@angular/core';
import { Room, Track } from 'livekit-client';

/**
 * DiagnosticsService — Production-safe video quality monitor.
 *
 * Periodically logs local camera capture settings and WebRTC sender
 * statistics so 4G/network-related quality issues can be diagnosed
 * from browser console logs without guesswork.
 *
 * Usage:
 *   this.diagnosticsService.start(room);   // after joining
 *   this.diagnosticsService.stop();        // when leaving
 */
@Injectable({
  providedIn: 'root',
})
export class DiagnosticsService implements OnDestroy {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private room: Room | null = null;
  private readonly POLL_INTERVAL_MS = 10_000; // 10 seconds

  /**
   * Start monitoring the local camera track quality.
   * Safe to call multiple times — restarts if already running.
   */
  start(room: Room): void {
    this.stop(); // clean up any previous monitor
    this.room = room;

    // Run an initial snapshot immediately
    this.logSnapshot();

    this.intervalId = setInterval(() => {
      this.logSnapshot();
    }, this.POLL_INTERVAL_MS);

    console.log('[Diagnostics] Video quality monitor started (every %ds)', this.POLL_INTERVAL_MS / 1000);
  }

  /**
   * Stop monitoring and release references.
   */
  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[Diagnostics] Video quality monitor stopped');
    }
    this.room = null;
  }

  ngOnDestroy(): void {
    this.stop();
  }

  // ─── Private ────────────────────────────────────────────

  private logSnapshot(): void {
    if (!this.room) return;

    try {
      this.logCaptureSettings();
      this.logPublicationInfo();
    } catch (err) {
      console.warn('[Diagnostics] Error collecting snapshot:', err);
    }
  }

  /**
   * Log the actual camera MediaStreamTrack settings
   * (width, height, frameRate, deviceId).
   */
  private logCaptureSettings(): void {
    const pub = [...this.room!.localParticipant.videoTrackPublications.values()]
      .find(p => p.source === Track.Source.Camera);

    if (!pub?.track) {
      console.log('[Diagnostics] No local camera track published');
      return;
    }

    const settings = pub.track.mediaStreamTrack?.getSettings();

    console.log('[Diagnostics] 📷 Capture:', {
      width: settings?.width,
      height: settings?.height,
      frameRate: settings?.frameRate ? Math.round(settings.frameRate * 10) / 10 : undefined,
      deviceId: settings?.deviceId?.substring(0, 12) + '…',
    });
  }

  /**
   * Log the LiveKit publication metadata for the camera track
   * (trackSid, isMuted, simulcast layers, dimensions).
   */
  private logPublicationInfo(): void {
    const pub = [...this.room!.localParticipant.videoTrackPublications.values()]
      .find(p => p.source === Track.Source.Camera);

    if (!pub) return;

    console.log('[Diagnostics] 📡 Publication:', {
      trackSid: pub.trackSid,
      isMuted: pub.isMuted,
      source: pub.source,
      simulcast: pub.simulcasted ?? false,
    });

    // Log all video publications count (camera + screen share if active)
    const allVideoPubs = this.room!.localParticipant.videoTrackPublications.size;
    if (allVideoPubs > 1) {
      console.log('[Diagnostics] ⚠️ Multiple video publications active:', allVideoPubs);
    }

    // Log remote participant count and their subscription quality
    const remoteCount = this.room!.remoteParticipants.size;
    if (remoteCount > 0) {
      console.log('[Diagnostics] 👥 Remote participants:', remoteCount);
    }
  }
}
