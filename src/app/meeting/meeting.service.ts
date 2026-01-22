import { computed, Injectable, signal } from '@angular/core';
import { RoomService } from './../providers/services/room.service';
import { LocalService } from './../providers/services/local.service';
import { iNavigation } from './../providers/services/iNavigation';
import { LocalVideoTrack, Room } from 'livekit-client';
import { CameraService } from './../providers/services/camera.service';
import { VideoBackgroundService } from './../providers/services/video-background.service';
import { DeviceService } from '../layout/device.service';
import { ServerEventService } from '../providers/socket/server-event.service';
import { ClientEventService } from '../providers/socket/client-event.service';
import { User } from '../models/model';
import { Dashboard, Login } from '../models/constant';
import { CallParticipant, ParticipantStatus } from '../models/conference_call/call_model';
import { InvitedParticipant } from './meeting.component';

@Injectable({
  providedIn: 'root'
})
export class MeetingService {

  // ==================== State Signals ====================

  /** Meeting UI state */
  private _isMinimized = signal(false);
  isMinimized = this._isMinimized.asReadonly();

  private _inMeeting = signal(false);
  inMeeting = this._inMeeting.asReadonly();

  private _loading = signal(false);
  isLoading = this._loading.asReadonly();

  /** Room and track state */
  room = signal<Room | undefined>(undefined);
  localTrack = signal<LocalVideoTrack | undefined>(undefined);

  private participantFilterSignal = signal('');

  remoteParticipants = this.roomService.remoteParticipants;

  get remoteUsersCount(): number {
    return this.remoteParticipants().size;
  }


  /** Preview stream for camera preview before joining */
  private _previewStream = signal<MediaStream | undefined>(undefined);
  previewStream = this._previewStream.asReadonly();

  /** Media state - defaults to false until set by user preferences */
  isCameraOn = signal(false);
  isMicOn = signal(false);

  /** Meeting details */
  meetingId: string = "";
  private user: User | null = null;

  // ==================== Constructor ====================

  constructor(
    private roomService: RoomService,
    private local: LocalService,
    private nav: iNavigation,
    private cameraService: CameraService,
    private deviceService: DeviceService,
    private serverEventService: ServerEventService,
    private clientEventService: ClientEventService,
    private videoBackgroundService: VideoBackgroundService
  ) { }

  getUserInitiaLetter(name: string): string {
    if (!name)
      return "";

    const words = name.split(' ').slice(0, 2);
    const initials = words.map(x => {
      if (x.length > 0) {
        return x.charAt(0).toUpperCase();
      }
      return '';
    }).join('');

    return initials;
  }

  getColorFromName(name: string): string {
    // Predefined color palette (Google Meet style soft colors)
    const colors = [
      "#f28b829f", "#FDD663", "#81C995", "#AECBFA", "#D7AEFB", "#FFB300",
      "#34A853", "#4285F4", "#FBBC05", "#EA4335", "#9AA0A6", "#F6C7B6"
    ];

    // Create hash from name
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }

    // Pick color based on hash
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  }

  isParticipantCameraEnabled(participantIdentity: string): boolean {
    const status = this.roomService.getParticipantMediaStatus(participantIdentity);
    return status ? (status.hasCameraTrack && status.isCameraEnabled) : false;
  }

  isParticipantAudioEnabled(participantIdentity: string): boolean {
    const status = this.roomService.getParticipantMediaStatus(participantIdentity);
    return status ? (status.hasAudioTrack && status.isAudioEnabled) : false;
  }

  // ==================== UI State Methods ====================

  minimize() {
    this._isMinimized.set(true);
  }

  maximize() {
    this._isMinimized.set(false);
  }

  /** Called externally (e.g., from preview) to indicate user is joining a meeting */
  userJoinRoom() {
    this._inMeeting.set(true);
  }

  requestToJoin(participant: CallParticipant): void {
    const request = this.serverEventService.incomingCall();
    this.clientEventService.initiateAudioJoiningRequest(participant.userId, request.conversationId);
  }

  get invitedParticipants(): number {
    var p = this.serverEventService.participantsInRoom();
    if (p && p.length > 0) {
      return p.filter(p => p.status != ParticipantStatus.ACCEPTED).length;
    } else {
      return 0;
    }
  }

  // Computed signal - only recalculates when incomingCall or filter changes
  filteredInvitedParticipants(isInRoom: boolean = true): CallParticipant[] {
    let participants: CallParticipant[] = this.serverEventService.participantsInRoom();

    if (!participants) {
      return [];
    }

    if (isInRoom) {
      participants = participants.filter(p => p.status == ParticipantStatus.ACCEPTED);
    } else {
      participants = participants.filter(p => p.status != ParticipantStatus.ACCEPTED);
    }

    const filterValue = this.participantFilterSignal().toLowerCase().trim();
    if (!filterValue) {
      return participants;
    }

    return participants.filter(p =>
      p.name.toLowerCase().includes(filterValue) ||
      p.email.toLowerCase().includes(filterValue)
    );
  }

  filterParticipants(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.participantFilterSignal.set(target.value);
  }

  // ==================== Meeting Lifecycle ====================

  /**
   * Join a meeting room with camera/mic based on user preferences
   */
  async joinRoom(): Promise<void> {
    if (!this.meetingId) {
      console.error('Cannot join room: meetingId is not set');
      return;
    }

    try {
      this._loading.set(true);

      // Load user preferences
      this.user = this.local.getUser();
      this.isCameraOn.set(this.user?.isCameraOn ?? false);
      this.isMicOn.set(this.user?.isMicOn ?? false);

      // Check available devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasMic = devices.some(d => d.kind === 'audioinput');
      const hasCam = devices.some(d => d.kind === 'videoinput');

      // Connect to LiveKit room
      const participantName = this.getFullName();
      const joinedRoom = await this.roomService.joinRoom(this.meetingId, participantName);

      this.room.set(joinedRoom);
      this.maximize();
      this._inMeeting.set(true);

      // Enable microphone if user wants it and device is available
      if (this.isMicOn() && hasMic) {
        await this.enableMicInternal(joinedRoom);
      }

      // Enable camera only if user explicitly wants it (respects audio-only calls)
      if (this.isCameraOn() && hasCam) {
        await this.enableCameraInternal(joinedRoom);
      } else {
        this.localTrack.set(undefined);
        console.log('Camera not enabled:', { isCameraOn: this.isCameraOn(), hasCam });
      }

    } catch (error) {
      console.error('Error joining room:', error);
      await this.leaveRoom();
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Leave the meeting room and cleanup all media resources
   */
  async leaveRoom(isNavigate: boolean = false): Promise<void> {
    const room = this.room();

    if (room) {
      try {
        // Remove any video background effects first
        const track = this.localTrack();
        if (track) {
          await this.videoBackgroundService.removeBackground(track);
        }

        // Disable camera and mic via LiveKit API
        await room.localParticipant.setCameraEnabled(false);
        await room.localParticipant.setMicrophoneEnabled(false);

        // Stop all tracks as safety measure
        this.cameraService.stopAllTracks(room);

        console.log('Camera and mic disabled before leaving room');
      } catch (error) {
        console.warn('Error during media cleanup:', error);
      }
    }

    // Disconnect from room
    await this.roomService.leaveRoom();

    // Reset all state
    this.resetState();

    // Navigate if requested
    if (isNavigate) {
      this.navigateAfterLeave();
    }

    // Notify call service
    this.clientEventService.endCall();
  }

  // ==================== Media Controls ====================

  /**
   * Toggle camera on/off during a meeting
   */
  async toggleCamera(): Promise<void> {
    const room = this.room();
    if (!room) return;

    const newState = !this.isCameraOn();
    this.isCameraOn.set(newState);

    try {
      if (newState) {
        await this.turnCameraOn(room);
      } else {
        await this.turnCameraOff(room);
      }

      this.local.setCameraStatus(newState);
    } catch (error) {
      console.error('Error toggling camera:', error);
      // Revert state on error
      this.isCameraOn.set(!newState);
    }
  }

  /**
   * Toggle microphone on/off during a meeting
   */
  async toggleMic(): Promise<void> {
    const room = this.room();
    if (!room) return;

    const newState = !this.isMicOn();
    console.log('=== TOGGLE MIC ===');
    console.log('Current mic state:', this.isMicOn(), '-> New state:', newState);

    try {
      if (newState) {
        console.log('Enabling mic via cameraService...');
        await this.cameraService.enableMic(room);
        console.log('cameraService.enableMic completed');

        // Log the audio track after enabling
        const audioTrackPub = room.localParticipant.audioTrackPublications.values().next().value;
        console.log('Audio track after enableMic:', {
          exists: !!audioTrackPub?.track,
          isMuted: audioTrackPub?.track?.isMuted,
          mediaStreamTrackEnabled: audioTrackPub?.track?.mediaStreamTrack?.enabled,
          mediaStreamTrackReadyState: audioTrackPub?.track?.mediaStreamTrack?.readyState
        });
      } else {
        console.log('Disabling mic via cameraService...');
        await this.cameraService.disableMic(room);
        console.log('cameraService.disableMic completed');
      }

      this.isMicOn.set(newState);
      this.local.setMicStatus(newState);
      console.log('=== TOGGLE MIC END ===');
    } catch (error) {
      console.error('Error toggling mic:', error);
    }
  }

  // ==================== Preview Media Management ====================

  /**
   * Request camera/mic stream for preview (before joining a meeting)
   * @param enableCamera - Whether to enable camera (false for audio-only calls)
   * @param cameraDeviceId - Optional specific camera device ID
   * @param micDeviceId - Optional specific microphone device ID
   * @returns The MediaStream or undefined if failed
   */
  async requestMediaPreview(
    enableCamera: boolean = true,
    cameraDeviceId?: string,
    micDeviceId?: string
  ): Promise<MediaStream | undefined> {
    try {
      // Stop any existing preview stream first
      this.stopMediaPreview();

      const constraints: MediaStreamConstraints = {
        video: enableCamera
          ? (cameraDeviceId ? { deviceId: cameraDeviceId } : true)
          : false,
        audio: micDeviceId ? { deviceId: micDeviceId } : true
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this._previewStream.set(stream);

      // Update media state
      this.isCameraOn.set(enableCamera);
      this.isMicOn.set(true);

      console.log('Preview media stream acquired:', { enableCamera, hasVideo: stream.getVideoTracks().length > 0 });
      return stream;
    } catch (error) {
      console.error('Error requesting media preview:', error);
      return undefined;
    }
  }

  /**
   * Stop the preview stream and release camera/mic hardware
   */
  stopMediaPreview(): void {
    const stream = this._previewStream();
    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop();
        console.log(`Stopped preview track: ${track.kind}`);
      });
      this._previewStream.set(undefined);
    }
  }

  /**
   * Toggle camera in preview mode (before joining meeting)
   */
  async togglePreviewCamera(cameraDeviceId?: string): Promise<void> {
    const stream = this._previewStream();
    const newCameraState = !this.isCameraOn();

    if (!stream) {
      // No stream exists - create one if turning camera on
      if (newCameraState) {
        await this.requestMediaPreview(true, cameraDeviceId);
      }
      return;
    }

    if (newCameraState) {
      // Turning camera ON - need to get a new stream with video
      await this.requestMediaPreview(true, cameraDeviceId);
    } else {
      // Turning camera OFF - stop video tracks only
      stream.getVideoTracks().forEach(track => {
        track.stop();
        stream.removeTrack(track);
      });
      this.isCameraOn.set(false);
    }
  }

  /**
   * Toggle microphone in preview mode
   */
  togglePreviewMic(): void {
    const stream = this._previewStream();
    if (!stream) return;

    const newMicState = !this.isMicOn();
    stream.getAudioTracks().forEach(track => {
      track.enabled = newMicState;
    });
    this.isMicOn.set(newMicState);
  }

  /**
   * Release all media resources (preview + meeting)
   * Call this when completely leaving the meeting flow
   */
  releaseAllMedia(): void {
    // Stop preview stream
    this.stopMediaPreview();

    // Stop room tracks if in meeting
    const room = this.room();
    if (room) {
      try {
        room.localParticipant.setCameraEnabled(false);
        room.localParticipant.setMicrophoneEnabled(false);
        this.cameraService.stopAllTracks(room);
      } catch (error) {
        console.warn('Error releasing room media:', error);
      }
    }

    // Reset media state
    this.isCameraOn.set(false);
    this.isMicOn.set(false);
    this.localTrack.set(undefined);

    console.log('All media resources released');
  }

  // ==================== Private Helpers ====================

  /**
   * Enable camera and set local track for display
   */
  private async enableCameraInternal(room: Room): Promise<void> {
    await this.cameraService.enableCamera(room);

    const videoPub = room.localParticipant.videoTrackPublications.values().next().value;
    if (videoPub?.track) {
      this.localTrack.set(videoPub.track as LocalVideoTrack);
    }
  }

  /**
   * Enable microphone 
   */
  private async enableMicInternal(room: Room): Promise<void> {
    await this.cameraService.enableMic(room);
    // Note: Don't call setMicrophoneEnabled - cameraService.enableMic handles the track directly
  }

  /**
   * Turn camera on - creates track if needed
   */
  private async turnCameraOn(room: Room): Promise<void> {
    const existingTrack = room.localParticipant.videoTrackPublications.values().next().value;

    if (!existingTrack) {
      // No track exists (audio-only call) - create and publish one
      await this.cameraService.enableCamera(room, this.deviceService.selectedCamera());

      const videoPub = room.localParticipant.videoTrackPublications.values().next().value;
      if (videoPub?.track) {
        this.localTrack.set(videoPub.track as LocalVideoTrack);
      }
    } else {
      // Track exists - just enable it
      await room.localParticipant.setCameraEnabled(true);
      // Also update localTrack signal in case it wasn't set
      const videoPub = room.localParticipant.videoTrackPublications.values().next().value;
      if (videoPub?.track) {
        this.localTrack.set(videoPub.track as LocalVideoTrack);
      }
    }
  }

  /**
   * Turn camera off and remove background effects
   */
  private async turnCameraOff(room: Room): Promise<void> {
    room.localParticipant.setCameraEnabled(false);

    const track = this.localTrack();
    if (track) {
      await this.videoBackgroundService.removeBackground(track);
    }
  }

  /**
   * Reset all state to initial values
   */
  private resetState(): void {
    this.room.set(undefined);
    this.localTrack.set(undefined);
    this._inMeeting.set(false);
    this.isCameraOn.set(false);
    this.isMicOn.set(false);
    this.meetingId = "";
    this.user = null;
    this.maximize();
  }

  /**
   * Navigate to appropriate page after leaving meeting
   */
  private navigateAfterLeave(): void {
    if (this.local.isLoggedIn()) {
      this.nav.navigate(Dashboard, null);
    } else {
      this.nav.navigate(Login, null);
      localStorage.clear();
    }
  }

  /**
   * Get user's full name for display
   */
  private getFullName(): string {
    if (!this.user) {
      this.user = this.local.getUser();
    }

    let fullName = this.user?.firstName ?? 'Guest';
    if (this.user?.lastName) {
      fullName = `${fullName} ${this.user.lastName}`;
    }

    return fullName;
  }
}

