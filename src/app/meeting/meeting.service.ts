import { computed, Injectable, inject, signal } from '@angular/core';
import { RoomService } from './../providers/services/room.service';
import { LocalService } from './../providers/services/local.service';
import { iNavigation } from './../providers/services/iNavigation';
import { LocalVideoTrack, RemoteParticipant, RemoteVideoTrack, Room, Track } from 'livekit-client';
import { CameraService } from './../providers/services/camera.service';
import { VideoBackgroundService } from './../providers/services/video-background.service';
import { DeviceService } from '../layout/device.service';
import { ServerEventService } from '../providers/socket/server-events/server-event.service';
import { InitiateAudioCallService } from '../providers/socket/client-events/call/initiate-audio-call.service';
import { InviteCallEventService } from '../providers/socket/client-events/call/invite-call.service';
import { EndCallService } from '../providers/socket/client-events/call/end-call.service';
import { User } from '../models/model';
import { Dashboard, Login } from '../models/constant';
import { CallParticipant, ParticipantStatus } from '../models/conference_call/call_model';
import { InvitedParticipant } from './meeting.component';
import { NotificationService } from '../notifications/services/notification.service';
import { DiagnosticsService } from '../providers/services/diagnostics.service';

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

  activeSpeakers = this.roomService.activeSpeakers;
  lastActiveSpeaker = this.roomService.lastActiveSpeaker;

  sortedRemoteParticipants = computed(() => {
    const participants = Array.from(this.remoteParticipants().values());
    const active = this.activeSpeakers();
    const lastActive = this.lastActiveSpeaker();

    return participants.sort((a, b) => {
      const aSpeaking = active.has(a.identity);
      const bSpeaking = active.has(b.identity);

      if (aSpeaking && !bSpeaking) return -1;
      if (!aSpeaking && bSpeaking) return 1;

      if (a.identity === lastActive) return -1;
      if (b.identity === lastActive) return 1;

      return a.identity.localeCompare(b.identity);
    });
  });


  private cameraService = inject(CameraService);

  /** Preview stream for camera preview before joining (delegated to unified CameraService) */
  previewStream = this.cameraService.previewStream;

  /** Media state - delegated to unified CameraService */
  isCameraOn = this.cameraService.isCameraOn;
  isMicOn = this.cameraService.isMicOn;

  /** Meeting details */
  meetingId: string = "";
  private user: User | null = null;

  // ==================== Constructor ====================

  constructor(
    public roomService: RoomService,
    private local: LocalService,
    private nav: iNavigation,
    private deviceService: DeviceService,
    private serverEventService: ServerEventService,
    private initiateAudioCallService: InitiateAudioCallService,
    private inviteCallEventService: InviteCallEventService,
    private endCallService: EndCallService,
    private videoBackgroundService: VideoBackgroundService,
    private notificationService: NotificationService,
    private diagnosticsService: DiagnosticsService
  ) {
    this.roomService.incomingCommands.subscribe(cmd => {
      if (cmd.type === 'MUTE_ALL' && this.isMicOn()) {
        this.toggleMic();
        this.notificationService.showNotification({
          id: crypto.randomUUID(),
          type: 'warning',
          title: 'Muted by Host',
          content: 'The host has muted your microphone.',
          conversationId: '',
          timestamp: new Date(),
          read: false
        });
      }
    });
  }

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

  isParticipantActiveSpeaker(participantIdentity: string): boolean {
    if (!participantIdentity) return false;
    return this.activeSpeakers().has(participantIdentity);
  }

  getParticipantVideoTrack(participantIdentity: string): RemoteVideoTrack | undefined {
    return this.roomService.getParticipantVideoTrack(participantIdentity);
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
    if (request) {
      this.inviteCallEventService.execute(participant.userId, request.conversationId, 'audio');
    }
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
      this.cameraService.room.set(joinedRoom);
      this.cameraService.mediaMode.set('in-meeting');
      this.maximize();
      this._inMeeting.set(true);

      // Start video quality diagnostics
      this.diagnosticsService.start(joinedRoom);

      // Enable microphone if user wants it and device is available
      if (this.isMicOn() && hasMic) {
        await this.cameraService.enableMic(joinedRoom, this.deviceService.selectedMic() ?? undefined);
      }

      // Enable camera only if user explicitly wants it (respects audio-only calls)
      if (this.isCameraOn() && hasCam) {
        await this.cameraService.enableCamera(joinedRoom, this.deviceService.selectedCamera() ?? undefined);
        const camTrack = this.cameraService.localCameraTrack();
        if (camTrack) {
          this.localTrack.set(camTrack);
        }
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

        // Release all media resources via CameraService
        await this.cameraService.releaseAllMedia(room);
        console.log('Camera and mic disabled before leaving room');
      } catch (error) {
        console.warn('Error during media cleanup:', error);
      }
    }

    // Stop diagnostics
    this.diagnosticsService.stop();

    // Disconnect from room
    await this.roomService.leaveRoom();

    // Reset all state
    this.resetState();

    // Navigate if requested
    if (isNavigate) {
      this.navigateAfterLeave();
    }

    // Notify call service
    this.endCallService.execute();
  }

  // ==================== Media Controls ====================

  /**
   * Toggle camera on/off during a meeting
   */
  async toggleCamera(): Promise<void> {
    const room = this.room();
    if (!room) return;

    try {
      const wasOn = this.isCameraOn();
      if (wasOn) {
        const track = this.localTrack();
        if (track) {
          await this.videoBackgroundService.removeBackground(track);
        }
        await this.cameraService.disableCamera(room);
        this.localTrack.set(undefined);
      } else {
        await this.cameraService.enableCamera(room, this.deviceService.selectedCamera() ?? undefined);
        const camTrack = this.cameraService.localCameraTrack();
        if (camTrack) {
          this.localTrack.set(camTrack);
        }
      }

      this.local.setCameraStatus(this.isCameraOn());
    } catch (error) {
      console.error('Error toggling camera:', error);
    }
  }

  /**
   * Toggle microphone on/off during a meeting
   */
  async toggleMic(): Promise<void> {
    const room = this.room();
    if (!room) return;

    try {
      if (this.isMicOn()) {
        await this.cameraService.disableMic(room);
      } else {
        await this.cameraService.enableMic(room, this.deviceService.selectedMic() ?? undefined);
      }

      this.local.setMicStatus(this.isMicOn());
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
    return this.cameraService.initPreviewSession(enableCamera, cameraDeviceId, micDeviceId);
  }

  /**
   * Stop the preview stream and release camera/mic hardware
   */
  stopMediaPreview(): void {
    this.cameraService.stopMediaPreview();
  }

  /**
   * Toggle camera in preview mode (before joining meeting)
   */
  async togglePreviewCamera(cameraDeviceId?: string): Promise<void> {
    await this.cameraService.toggleCamera(undefined, cameraDeviceId);
  }

  /**
   * Toggle microphone in preview mode
   */
  togglePreviewMic(): void {
    this.cameraService.toggleMic();
  }

  /**
   * Release all media resources (preview + meeting)
   * Call this when completely leaving the meeting flow
   */
  async releaseAllMedia(): Promise<void> {
    await this.cameraService.releaseAllMedia(this.room());
    this.localTrack.set(undefined);
    console.log('All media resources released');
  }

  // ==================== Private Helpers ====================

  /**
   * Reset all state to initial values
   */
  private resetState(): void {
    this.room.set(undefined);
    this.localTrack.set(undefined);
    this._inMeeting.set(false);
    this.cameraService.releaseAllMedia();
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
