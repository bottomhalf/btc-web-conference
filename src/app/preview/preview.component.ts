import { Component, ElementRef, OnDestroy, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LocalVideoTrack, Room } from 'livekit-client';
import { MediaPermissions, MediaPermissionsService } from '../providers/services/media-permission.service';
import { Subscription } from 'rxjs';
import { LocalService } from '../providers/services/local.service';
import { iNavigation } from '../providers/services/iNavigation';
import { AjaxService } from '../providers/services/ajax.service';
import { Dashboard, MeetingId } from '../models/constant';
import { ResponseModel, User } from '../models/model';
import { DeviceService } from '../layout/device.service';
import { CallType } from '../models/conference_call/call_model';
import { MeetingService } from '../meeting/meeting.service';

@Component({
    selector: 'app-preview',
    standalone: true,
    imports: [FormsModule],
    templateUrl: './preview.component.html',
    styleUrl: './preview.component.css'
})
export class PreviewComponent implements OnDestroy {
    @ViewChild('previewVideo') previewVideo!: ElementRef<HTMLVideoElement>;

    // Device selection
    selectedCamera: string | null = null;
    selectedMic: string | null = null;
    selectedSpeaker: string | null = null;

    // Room state
    room = signal<Room | undefined>(undefined);
    localTrack = signal<LocalVideoTrack | undefined>(undefined);

    // Meeting details
    meetingId: string | null = null;
    meetingTitle: string = "";
    callType: string = CallType.AUDIO;

    // Media state - now managed by MeetingService
    private subscription?: Subscription;
    permissions: MediaPermissions = {
        camera: 'unknown',
        microphone: 'unknown',
    };

    // UI state
    isLoggedIn: boolean = false;
    userName: string = "";
    passCode: string = "";
    isSubmitted: boolean = false;
    isValidMeetingId: boolean = false;

    constructor(
        private nav: iNavigation,
        private route: ActivatedRoute,
        private router: Router,
        private mediaPerm: MediaPermissionsService,
        private local: LocalService,
        private meetingService: MeetingService,
        private http: AjaxService,
        private deviceService: DeviceService
    ) {
        this.isLoggedIn = local.isLoggedIn();
        this.route.queryParamMap.subscribe(params => {
            this.meetingId = params.get(MeetingId);
        });
    }

    // ==================== Lifecycle ====================

    async ngOnInit() {
        this.initializeDeviceSelection();

        if (this.isLoggedIn) {
            this.readRoutedMeetingDetail();
            if (this.meetingId) {
                this.subscribeToPermissions();
            } else {
                await this.initializeMediaStream();
                this.subscribeToPermissions();
            }
        } else {
            this.validatMeetingId();
        }
    }

    destroyPermission() {
        this.permissions = {
            camera: 'unknown',
            microphone: 'unknown',
        };
    }

    ngOnDestroy() {
        // Use centralized cleanup
        if (!this.meetingService.inMeeting()) {
            this.meetingService.releaseAllMedia();
        }
        this.clearVideoElement();
        this.subscription?.unsubscribe();
        this.destroyPermission();
        this.mediaPerm.destroy();
    }

    // ==================== Call Type Helpers ====================

    /** Check if this is an audio-only call */
    isAudioOnlyCall(): boolean {
        return this.callType === CallType.AUDIO;
    }

    /** Check if this is a video call */
    isVideoCall(): boolean {
        return this.callType === CallType.VIDEO;
    }

    /** Get the appropriate media constraints based on call type */
    private getMediaConstraints(deviceId?: string): MediaStreamConstraints {
        if (this.isAudioOnlyCall()) {
            // Audio-only call: mic only, no video
            return {
                video: false,
                audio: deviceId ? { deviceId } : true
            };
        } else {
            // Video call: both camera and mic
            return {
                video: deviceId ? { deviceId } : true,
                audio: true
            };
        }
    }

    // ==================== Initialization ====================

    private initializeDeviceSelection() {
        this.selectedCamera = this.deviceService.selectedCamera();
        this.selectedMic = this.deviceService.selectedMic();
        this.selectedSpeaker = this.deviceService.selectedSpeaker();
    }

    /** Read meeting details from router state */
    readRoutedMeetingDetail() {
        const state = history.state;

        if (state?.id) {
            this.meetingId = state.id;
        }

        if (state?.title) {
            this.meetingTitle = state.title;
        }

        if (state?.type) {
            this.callType = state.type;
        }

        // Update camera state based on call type (will be used by initializeMediaStream)
        // Note: The actual camera state is now managed by MeetingService

        // Fallback to nav service if state is not available
        if (!this.meetingId || !this.meetingTitle) {
            const meetingDetail = this.nav.getValue();
            if (meetingDetail) {
                this.meetingId = this.meetingId || meetingDetail.meetingId;
                this.meetingTitle = this.meetingTitle || meetingDetail.title;
                this.isValidMeetingId = true;
            }
        } else {
            this.isValidMeetingId = true;
        }
    }

    /** Validate meeting ID for non-logged-in users */
    async validatMeetingId() {
        if (!this.meetingId) {
            this.isValidMeetingId = false;
            return;
        }

        const match = this.meetingId.match(/_(\d+)$/);
        const meetingDetailId = match ? +match[1] : null;
        const updatedId = this.meetingId.replace(/_\d+$/, "");

        try {
            const res: ResponseModel = await this.http.post('meeting/validateMeeting', {
                meetingId: updatedId,
                meetingDetailId
            });

            if (res.ResponseBody) {
                this.isValidMeetingId = true;
                this.meetingTitle = res.ResponseBody.title;
                await this.initializeMediaStream();
                this.subscribeToPermissions();
            }
        } catch (e) {
            this.isValidMeetingId = false;
        }
    }

    private subscribeToPermissions() {
        this.subscription = this.mediaPerm.permissions$.subscribe(permissions => {
            this.permissions = permissions;

            const hasRequiredPermissions = this.isAudioOnlyCall()
                ? permissions.microphone === 'granted'
                : permissions.camera === 'granted' && permissions.microphone === 'granted';

            if (hasRequiredPermissions) {
                this.joinRoom();
            }
        });
    }

    // ==================== Media Stream Management ====================

    /** Initialize media stream based on call type - uses centralized MeetingService */
    private async initializeMediaStream() {
        const stream = await this.meetingService.requestMediaPreview(
            this.isVideoCall(),
            this.selectedCamera ?? undefined,
            this.selectedMic ?? undefined
        );

        if (stream) {
            this.attachStreamToVideo(stream);
        }
    }

    /** Start camera & mic preview with selected devices - uses centralized MeetingService */
    async startPreview() {
        const stream = await this.meetingService.requestMediaPreview(
            this.isVideoCall(),
            this.selectedCamera ?? undefined,
            this.selectedMic ?? undefined
        );

        if (stream) {
            this.attachStreamToVideo(stream);
        }
    }

    /** Stop preview - uses centralized MeetingService */
    async stopPreview() {
        this.meetingService.stopMediaPreview();
        this.clearVideoElement();
    }

    private attachStreamToVideo(stream?: MediaStream) {
        const mediaStream = stream || this.meetingService.previewStream();
        if (this.previewVideo?.nativeElement && mediaStream) {
            this.previewVideo.nativeElement.srcObject = mediaStream;
            this.previewVideo.nativeElement.muted = true;
            this.previewVideo.nativeElement.play();
        }
    }

    private clearVideoElement() {
        if (this.previewVideo?.nativeElement) {
            this.previewVideo.nativeElement.srcObject = null;
        }
    }

    // Removed cleanupMediaStream - now using meetingService.releaseAllMedia()

    // ==================== Room Actions ====================

    async joinRoom() {
        this.isSubmitted = true;

        // Validate permissions based on call type
        if (!this.validatePermissions()) {
            return;
        }

        // Validate user name for non-logged-in users
        if (!this.isLoggedIn && !this.userName) {
            alert("Please add your name");
            return;
        }

        // Stop the preview stream before joining - LiveKit will create its own stream
        this.meetingService.stopMediaPreview();
        this.clearVideoElement();

        this.saveUser();
        this.meetingService.meetingId = this.meetingId;
        this.meetingService.maximize();
        this.meetingService.userJoinRoom();
    }

    private validatePermissions(): boolean {
        if (this.isVideoCall() && this.permissions.camera !== 'granted') {
            alert("Please allow camera access for video calls.");
            return false;
        }

        if (this.permissions.microphone !== 'granted') {
            alert("Please allow microphone access.");
            return false;
        }

        return true;
    }

    // ==================== Device Selection ====================

    async onCameraChange(event: any) {
        this.selectedCamera = event.target.value;
        if (this.isVideoCall()) {
            await this.startPreview();
        }
    }

    async onMicChange(event: any) {
        this.selectedMic = event.target.value;
        await this.startPreview();
    }

    onSpeakerChange(event: any) {
        this.selectedSpeaker = event.target.value;
        if (this.previewVideo?.nativeElement && typeof this.previewVideo.nativeElement.setSinkId === 'function') {
            this.previewVideo.nativeElement.setSinkId(this.selectedSpeaker!);
        }
    }

    // ==================== Toggle Controls ====================

    /** Toggle camera - uses centralized MeetingService */
    async toggleCamera() {
        if (!this.isVideoCall()) {
            return; // Cannot toggle camera in audio-only calls
        }

        await this.meetingService.togglePreviewCamera(this.selectedCamera ?? undefined);

        // Re-attach stream to video element
        const stream = this.meetingService.previewStream();
        if (stream) {
            this.attachStreamToVideo(stream);
        } else {
            this.clearVideoElement();
        }
    }

    /** Toggle mic - uses centralized MeetingService */
    toggleMic() {
        this.meetingService.togglePreviewMic();
    }

    // ==================== User Management ====================

    private saveUser() {
        let user: User;

        // Use centralized state from MeetingService
        const isCameraOn = this.meetingService.isCameraOn();
        const isMicOn = this.meetingService.isMicOn();

        if (this.local.isLoggedIn()) {
            user = this.local.getUser();
            user.isCameraOn = this.isVideoCall() && isCameraOn;
            user.isMicOn = isMicOn;
        } else {
            user = {
                isMicOn: isMicOn,
                isCameraOn: this.isVideoCall() && isCameraOn,
                firstName: this.userName,
                isLogin: false,
            };
        }

        this.local.setUser(user);
    }

    // ==================== Navigation ====================

    navToDahsboard() {
        this.nav.navigate(Dashboard, null);
    }
}
