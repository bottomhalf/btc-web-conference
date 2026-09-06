import { Injectable, signal, WritableSignal } from '@angular/core';
import {
  createLocalTracks,
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

type TrackInfo = {
  trackPublication: RemoteTrackPublication;
  participantIdentity: string;
};

@Injectable({
  providedIn: 'root',
})
export class CameraService {
  room = signal<Room | undefined>(undefined);
  private roomInstance!: Room;
  private screenTrack?: MediaStreamTrack; // for screen share lifecycle
  remoteTracksMap = signal<Map<string, TrackInfo>>(new Map());

  constructor() {
    this.roomInstance = new Room();
  }

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

  async enableCamera(room: Room, deviceId?: string) {
    const videoTrack = await this.createCameraTrack(deviceId);
    if (videoTrack) {
      console.log('Publishing video track');
      await room.localParticipant.publishTrack(videoTrack);
    }
    // Find camera track only (exclude screen share)
    // let existingCameraTrack: LocalVideoTrack | undefined;
    // room.localParticipant.videoTrackPublications.forEach((pub) => {
    //   if (pub.source === Track.Source.Camera && pub.track) {
    //     existingCameraTrack = pub.track as LocalVideoTrack;
    //   }
    // });

    // if (existingCameraTrack) {
    //   // If camera track exists but is muted, unmute it
    //   await existingCameraTrack.unmute();
    // } else {
    //   // If no camera track exists, create and publish one
    //   const tracks = await createLocalTracks({
    //     video: { deviceId: deviceId || undefined },
    //   });
    //   const videoTrack = tracks.find((t) => t.kind === 'video');
    //   if (videoTrack) {
    //     await room.localParticipant.publishTrack(videoTrack);
    //   }
    // }
  }

  async disableCamera(room: Room) {
    // Only stop camera tracks, not screen share
    // room.localParticipant.videoTrackPublications.forEach((trackPub: LocalTrackPublication) => {
    //   if (trackPub.source === Track.Source.Camera && trackPub.track) {
    //     trackPub.track.stop();
    //     room.localParticipant.unpublishTrack(trackPub.track);
    //   }
    // });
    await room.localParticipant.setCameraEnabled(false);
  }

  async switchCamera(room: Room, deviceId: string) {
    // await this.disableCamera(room);
    // await this.enableCamera(room, deviceId);
    const videoTrack = await this.createCameraTrack(deviceId);
    if (videoTrack) {
      console.log('Publishing video track');
      await room.localParticipant.publishTrack(videoTrack);
    }
  }

  async enableMic(room: Room, deviceId?: string) {
    // First check if we already have an audio track published
    const existingAudioTrack = room.localParticipant.audioTrackPublications.values().next().value?.track;
    console.log('[enableMic] Existing audio track:', !!existingAudioTrack);

    if (existingAudioTrack) {
      // If track exists but is muted, unmute it
      console.log('[enableMic] Unmuting existing track');
      await existingAudioTrack.unmute();
    } else {
      // If no audio track exists, use LiveKit's built-in method
      // This handles WebRTC complexities better, especially during screen share
      console.log('[enableMic] No audio track exists, using setMicrophoneEnabled...');

      try {
        // Use LiveKit's built-in method which handles track creation internally
        await room.localParticipant.setMicrophoneEnabled(true, {
          deviceId: deviceId || undefined
        });
        console.log('[enableMic] setMicrophoneEnabled completed');

        // Verify publication
        const pubCount = room.localParticipant.audioTrackPublications.size;
        console.log('[enableMic] Audio track publications count:', pubCount);

        // Log all audio publications
        room.localParticipant.audioTrackPublications.forEach((pub, key) => {
          console.log('[enableMic] Audio publication:', {
            sid: pub.trackSid,
            source: pub.source,
            isMuted: pub.isMuted,
            trackExists: !!pub.track
          });
        });
      } catch (error) {
        console.error('[enableMic] setMicrophoneEnabled failed:', error);

        // Fallback to manual track creation
        console.log('[enableMic] Falling back to createLocalTracks...');
        const tracks = await createLocalTracks({
          audio: { deviceId: deviceId || undefined },
        });
        const audioTrack = tracks.find((t) => t.kind === 'audio');
        console.log('[enableMic] Audio track created:', !!audioTrack);

        if (audioTrack) {
          console.log('[enableMic] Publishing audio track to room...');
          await room.localParticipant.publishTrack(audioTrack);
          console.log('[enableMic] Audio track published successfully');
        }
      }
    }
  }

  async disableMic(room: Room) {
    room.localParticipant.audioTrackPublications.forEach((trackPub) => {
      trackPub.track?.mute();
    });
  }

  //--------------------- other code ---------------------//

  async listDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      cams: devices.filter(d => d.kind === 'videoinput'),
      mics: devices.filter(d => d.kind === 'audioinput'),
      speakers: devices.filter(d => d.kind === 'audiooutput'),
    };
  }

  /** Publish camera (and optionally choose deviceId + constraints) */
  async startCamera(room: Room, opts?: { deviceId?: string; }) {
    const [video] = await createLocalTracks({
      video: {
        deviceId: opts?.deviceId,
      },
    });

    await room.localParticipant.publishTrack(video);
    return video as LocalVideoTrack;
  }

  /** Publish microphone (optionally choose deviceId) */
  async startMic(room: Room, deviceId?: string) {
    const [audio] = await createLocalTracks({
      audio: { deviceId },
    });
    await room.localParticipant.publishTrack(audio);
    return audio as LocalAudioTrack;
  }

  /** Stop (unpublish) local camera */
  stopCamera(room: Room) {
    // Find camera track only (not screen share)
    const pub = [...room.localParticipant.videoTrackPublications.values()]
      .find(p => p.source === Track.Source.Camera);
    const track = pub?.track as LocalVideoTrack | undefined;
    if (track) {
      room.localParticipant.unpublishTrack(track);
      track.stop();
    }
  }

  /** Stop (unpublish) local mic */
  stopMic(room: Room) {
    const pub = [...room.localParticipant.audioTrackPublications.values()][0];
    const track = pub?.track as LocalAudioTrack | undefined;
    if (track) {
      room.localParticipant.unpublishTrack(track);
      track.stop();
    }
  }

  /** Switch camera to another deviceId (uses setDeviceId with restartTrack fallback) */
  async switchCamera_Old(room: Room, deviceId: string) {
    //const pub = [...room.localParticipant.videoTrackPublications.values()][0];
    const pub = [...room.localParticipant.videoTrackPublications.values()]
      .find(p => p.source === Track.Source.Camera);
    const videoTrack = pub?.track as LocalVideoTrack | undefined;
    if (!videoTrack) throw new Error('No local video track to switch');

    // setDeviceId exists in current SDK; if absent, fallback to restartTrack
    const anyTrack = videoTrack as LocalVideoTrack & { setDeviceId?: (id: string) => Promise<void> };
    if (typeof anyTrack.setDeviceId === 'function') {
      await anyTrack.setDeviceId(deviceId); // switches camera in place
    } else {
      await videoTrack.restartTrack({ deviceId }); // fallback path
    }
  }

  /** Switch microphone to another deviceId */
  async switchMic(room: Room, deviceId: string) {
    const pub = [...room.localParticipant.audioTrackPublications.values()][0];
    const audioTrack = pub?.track as LocalAudioTrack | undefined;
    if (!audioTrack) throw new Error('No local audio track to switch');

    const anyTrack = audioTrack as LocalAudioTrack & { setDeviceId?: (id: string) => Promise<void> };
    if (typeof anyTrack.setDeviceId === 'function') {
      await anyTrack.setDeviceId(deviceId);
    } else {
      // no setDeviceId: restart the track with new device
      await audioTrack.restartTrack({ deviceId });
    }
  }

  /** Start screen sharing (publishes a screen video track) */
  async startScreenShare(room: Room) {
    const stream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: false });
    const track = stream.getVideoTracks()[0];
    this.screenTrack = track;
    const local = new LocalVideoTrack(track);
    await room.localParticipant.publishTrack(local, {
      source: Track.Source.ScreenShare,
    });
    // stop share if user presses "stop sharing" in browser UI
    track.onended = () => this.stopScreenShare(room);
  }

  /** Stop screen sharing */
  stopScreenShare(room: Room) {
    // find the screen-share publication
    const pub = [...room.localParticipant.videoTrackPublications.values()]
      .find(p => p.source === Track.Source.ScreenShare);
    const track = pub?.track as LocalVideoTrack | undefined;
    if (track) {
      room.localParticipant.unpublishTrack(track);
      track.stop();
    }
    if (this.screenTrack) {
      this.screenTrack.stop();
      this.screenTrack = undefined;
    }
  }

  /** Attach a local video track to a <video> element */
  attachLocalVideo(room: Room, el: HTMLVideoElement) {
    //const pub = [...room.localParticipant.videoTrackPublications.values()][0];
    const pub = [...room.localParticipant.videoTrackPublications.values()]
      .find(p => p.source === Track.Source.Camera);
    const track = pub?.track as LocalVideoTrack | undefined;
    if (!track) return;
    track.attach(el);
  }

  /** Detach a local video track from a <video> element */
  detachLocalVideo(room: Room, el: HTMLVideoElement) {
    // const pub = [...room.localParticipant.videoTrackPublications.values()][0];
    const pub = [...room.localParticipant.videoTrackPublications.values()]
      .find(p => p.source === Track.Source.Camera);
    const track = pub?.track as LocalVideoTrack | undefined;
    if (!track) return;
    track.detach(el);
  }

  /** Stop all local tracks (camera, mic, screen share) - comprehensive cleanup */
  stopAllTracks(room: Room) {
    // Stop all video tracks
    room.localParticipant.videoTrackPublications.forEach((trackPub) => {
      if (trackPub.track) {
        trackPub.track.stop();
        room.localParticipant.unpublishTrack(trackPub.track);
      }
    });

    // Stop all audio tracks
    room.localParticipant.audioTrackPublications.forEach((trackPub) => {
      if (trackPub.track) {
        trackPub.track.stop();
        room.localParticipant.unpublishTrack(trackPub.track);
      }
    });

    // Stop screen share if active
    if (this.screenTrack) {
      this.screenTrack.stop();
      this.screenTrack = undefined;
    }
  }
}
