import { afterNextRender, AfterViewInit, Component, computed, effect, ElementRef, HostListener, OnDestroy, OnInit, signal, ViewChild } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { createLocalScreenTracks, LocalTrackPublication, LocalVideoTrack, RemoteVideoTrack, Room, Track } from 'livekit-client';
import { RoomService } from '../providers/services/room.service';
import { AudioComponent } from '../audio/audio.component';
import { VideoComponent } from '../video/video.component';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { interval, Subscription } from 'rxjs';
import { MediaPermissions, MediaPermissionsService } from '../providers/services/media-permission.service';
import { BackgroundOption, BackgroundType, VideoBackgroundService } from '../providers/services/video-background.service';
import { LocalService } from '../providers/services/local.service';
import { ScreenRecorderService } from '../providers/services/screen-recorder.service';
import { NgbTooltipConfig, NgbTooltipModule, NgbSlide } from '@ng-bootstrap/ng-bootstrap';
import { NetworkService } from '../providers/services/network.service';
import { CameraService } from '../providers/services/camera.service';
import { iNavigation } from '../providers/services/iNavigation';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { Offcanvas } from 'bootstrap';
import { User } from '../models/model';
import { hand_down, hand_raise } from '../models/constant';
import { MeetingService } from './meeting.service';
import { ServerEventService } from '../providers/socket/server-event.service';

import { ParticipantRosterComponent } from './participant-roster/participant-roster.component';
import { ScreenshareComponent } from './screenshare/screenshare.component';
import { ChatContainerComponent } from '../chat/chat-container/chat-container.component';
import { ConfeetSocketService } from '../providers/socket/confeet-socket.service';
import { ChatServerService } from '../providers/services/chat.server.service';
import { NotificationService } from '../notifications/services/notification.service';
import { ChatService } from '../chat/chat.service';
import { Conversation } from '../components/global-search/search.models';

@Component({
    selector: 'app-meeting',
    standalone: true,
    imports: [FormsModule, ReactiveFormsModule, AudioComponent, VideoComponent, CommonModule, NgbTooltipModule, ParticipantRosterComponent, NgbSlide, ScreenshareComponent, ChatContainerComponent],
    templateUrl: './meeting.component.html',
    styleUrls: [
        './meeting.component.css',
        './screenshare/screenshare.component.css',
        './meeting-view/meeting-view.component.css'
    ],
    providers: [NgbTooltipConfig],
    host: {
        '[class.minimized]': 'meetingService.isMinimized()',
        '[class.maximized]': '!meetingService.isMinimized()'
    },
    animations: [
        trigger('slideFade', [
            state('hidden', style({ opacity: 0, height: '0px', overflow: 'hidden', width: '0px' })),
            state('visible', style({ opacity: 1, height: '*', overflow: 'hidden' })),
            transition('hidden <=> visible', animate('300ms ease'))
        ])
    ]
})
export class MeetingComponent implements OnInit, AfterViewInit, OnDestroy {
    // Reference to the dedicated <video> element for screen sharing
    @ViewChild('screenPreview') screenPreview!: ElementRef<HTMLVideoElement>;
    @ViewChild(ScreenshareComponent) screenshareComponent!: ScreenshareComponent;
    @ViewChild('seetingOffCanvas') offcanvasRef!: ElementRef;
    private offcanvasInstance!: Offcanvas;
    @ViewChild('virtualBackgroundOffcanvas') virtualBackgroundOffcanvasRef!: ElementRef;
    private virtualBackgroundOffcanvasInstance!: Offcanvas;
    @ViewChild('chatOffCanvas') chatOffCanvasRef!: ElementRef;
    private chatOffCanvasInstance!: Offcanvas;
    roomForm = new FormGroup({
        roomName: new FormControl('Test Room', Validators.required),
        participantName: new FormControl('Participant' + Math.floor(Math.random() * 100), Validators.required),
    });

    remoteTracksMap = this.roomService.remoteTracksMap;
    remoteParticipants = this.roomService.remoteParticipants;
    remoteSharescreenTrack = this.roomService.remoteSharescreenTrack;
    cameras: MediaDeviceInfo[] = [];
    microphones: MediaDeviceInfo[] = [];
    speakers: MediaDeviceInfo[] = [];
    selectedCamera: string | null = null;
    selectedMic: string | null = null;
    selectedSpeaker: string | null = null;
    meetingId: string | null = null;
    currentScreenTrack: RemoteVideoTrack | null = null;
    private subs: Subscription[] = [];
    currentTime: Date = new Date();
    private timerSubscription: Subscription | undefined;
    permissions: MediaPermissions = {
        camera: 'unknown',
        microphone: 'unknown',
    };
    private subscription?: Subscription;
    @ViewChild('microphoneActiveModal') microphoneActiveModal!: ElementRef;
    @ViewChild('cameraActiveModal') cameraActiveModal!: ElementRef;
    @ViewChild('shareMeetingURLModal') shareMeetingURLModal!: ElementRef;
    private modalInstance: any;
    private videoModalInstance: any;
    private shareLinkModalInstance: any;
    currentBrowser: string = "";
    textMessage: string = "";

    /** Get video track for a participant */
    getVideoTrack(participantIdentity: string) {
        return this.roomService.getParticipantVideoTrack(participantIdentity);
    }

    backgroundOptions: BackgroundOption[] = [];
    selectedBackground: BackgroundOption | null = null;
    isProcessing = false;
    // Subscriptions - consolidated for cleanup
    private subscriptions = new Subscription();
    isMyshareScreen: boolean = false;
    localScreenTrack: LocalVideoTrack | null = null;
    mediaRecorder!: MediaRecorder;
    recordedChunks: BlobPart[] = [];
    meetingUrl = window.location.href;
    whatsappUrl: string = "";
    gmailUrl: string = "";

    // Draggable mini window state
    private dragging = false;
    private dragStartX = 0;
    private dragStartY = 0;
    private dragOrigLeft = 0;
    private dragOrigTop = 0;
    private hasDragged = false; // Track if user actually dragged
    tweetUrl: string = "";
    linkedInUrl: string = "";
    user: User | null = null;
    remoteAudio!: HTMLAudioElement;
    recordingAndType: RecordingAndType = { isAudioRecording: false, isRecording: false, isTranscribe: false, isVideoRecording: false };
    timeInSeconds: number = 0;
    private watchSubscription: Subscription | null = null;
    private timer$ = interval(1000);
    handRaised: boolean = false;
    private notified = new Set<string>(); // tracks who is already raised
    isViewParticipant: boolean = false;
    participantFilter: string = '';
    isChatEnabled: boolean = false;

    // Use signal for participant filter to make it reactive
    private participantFilterSignal = signal('');

    toggleParticipanatsList() {
        this.isViewParticipant = !this.isViewParticipant;
    }

    filterParticipants(event: Event): void {
        const target = event.target as HTMLInputElement;
        this.participantFilterSignal.set(target.value);
    }

    // Getter methods to expose meetingService signals reactively
    get room() { return this.meetingService.room; }
    get localTrack() { return this.meetingService.localTrack; }

    constructor(
        private cameraService: CameraService,
        private route: ActivatedRoute,
        private eventService: ServerEventService,
        public roomService: RoomService,
        private nav: iNavigation,
        private router: Router,
        private mediaPerm: MediaPermissionsService,
        public videoBackgroundService: VideoBackgroundService,
        private local: LocalService,
        private recorder: ScreenRecorderService,
        public network: NetworkService,
        public meetingService: MeetingService,
        private elRef: ElementRef,
        private ws: ConfeetSocketService,
        private chatService: ChatService,
        private notificationService: NotificationService,
        private tooltipConfig: NgbTooltipConfig
    ) {
        // Configure tooltips to only show on hover (prevents unintended click events)
        this.tooltipConfig.triggers = 'hover';
        this.tooltipConfig.container = 'body';

        // Initialize virtual background service
        this.videoBackgroundService.initialize().catch(console.error);

        effect(() => {
            const list = this.roomService.handChnageStatus();

            // Collect current raised hands
            const currentlyRaised = new Set(list.filter(u => u.isHandRaise).map(u => u.name));

            // Find newly raised (in current but not in notified)
            currentlyRaised.forEach(name => {
                if (!this.notified.has(name)) {
                    this.showNotification(`${name} raised hand ✋`);
                }
            });

            // Find newly lowered (in notified but not in current)
            this.notified.forEach(name => {
                if (!currentlyRaised.has(name)) {
                    this.notified.delete(name);
                }
            });

            // Update our tracking set
            this.notified = currentlyRaised;
        });
    }

    async ngOnInit() {
        //this.meetingId = this.route.snapshot.paramMap.get('id');
        this.meetingId = this.meetingService.meetingId;

        if (!this.local.isValidUser()) {
            this.router.navigate(['/btc/preview'], { queryParams: { meetingid: this.meetingId } });
        }
        this.setInitialDetail();
        // Load default backgrounds
        this.backgroundOptions = this.videoBackgroundService.getBackgrounds();
        await this.getDeviceDetail();

        // Subscribe to current background
        this.subscriptions.add(
            this.videoBackgroundService.getCurrentBackground().subscribe(bg => {
                this.selectedBackground = bg;
            })
        );

        // Subscribe to processing status
        this.subscriptions.add(
            this.videoBackgroundService.getProcessingStatus().subscribe(status => {
                this.isProcessing = status;
            })
        );

        // IMPORTANT: Subscribe to screen share updates BEFORE joining room
        // This ensures we receive events that fire during room connection
        this.subs.push(
            this.roomService.latestScreenShare.subscribe(share => {
                console.log('latestScreenShare subscription triggered:', share);
                if (share) {
                    this.attachScreen(share.track);
                } else {
                    this.detachScreen();
                }
            })
        );

        // Using snapshot (loads once) - join room AFTER subscriptions are set up
        if (this.meetingId) {
            await this.meetingService.joinRoom();
        }

        if (this.meetingService.inMeeting()) {
            history.pushState(null, '', window.location.href);
            window.addEventListener('popstate', this.popStateListener);
        }

    }

    toggleChatWindow() {
        this.isChatEnabled = !this.isChatEnabled;
        if (this.isChatEnabled) {
            this.enableChat();
        } else {
            this.chatService.setIsChatStatus(this.isChatEnabled, 'Meeting component');
        }
    }

    enableChat() {
        const conversation: Conversation = {
            id: this.meetingId,
            conversationId: this.meetingId,
            conversationType: 'group',
            participantIds: [],
            participants: [],
            conversationName: this.meetingId,
            conversationAvatar: '',
            createdBy: this.user.userId,
            createdAt: new Date(),
            updatedAt: new Date(),
            lastMessage: null,
            lastMessageAt: new Date(),
            isActive: true,
            settings: null
        };
        this.ws.currentConversation.set(conversation);
        this.ws.currentConversationId.set(this.meetingId);

        this.chatService.messages.set([]); // Clear existing messages

        // Notify the NotificationService which conversation is now active
        this.notificationService.setActiveConversation(this.meetingId);
    }

    private setInitialDetail() {
        this.currentBrowser = this.local.getBrowserName();
        this.user = this.local.getUser();
        this.roomForm.get('participantName')?.setValue(this.getFullName());
        this.timerSubscription = interval(60 * 1000).subscribe(() => {
            this.currentTime = new Date();
        });
        this.subscription = this.mediaPerm.permissions$.subscribe(
            permissions => {
                this.permissions = permissions;
            }
        );
    }

    private async getDeviceDetail() {
        const devices = await navigator.mediaDevices.enumerateDevices();
        this.cameras = devices.filter(d => d.kind === 'videoinput');
        this.microphones = devices.filter(d => d.kind === 'audioinput');
        this.speakers = devices.filter(d => d.kind === 'audiooutput');

        this.selectedCamera = this.cameras[0]?.deviceId || null;
        this.selectedMic = this.microphones[0]?.deviceId || null;
        this.selectedSpeaker = this.speakers[0]?.deviceId || null;
    }

    ngAfterViewInit() {
        const modalEl = document.getElementById('microphoneActiveModal');
        if (modalEl) {
            // @ts-ignore (bootstrap comes from CDN)
            this.modalInstance = new bootstrap.Modal(modalEl);

            modalEl.addEventListener('shown.bs.modal', () => {
                this.microphoneActiveModal?.nativeElement.focus();
            });
        }

        const cameraActiveModal = document.getElementById('cameraActiveModal');
        if (cameraActiveModal) {
            // @ts-ignore (bootstrap comes from CDN)
            this.videoModalInstance = new bootstrap.Modal(cameraActiveModal);

            cameraActiveModal.addEventListener('shown.bs.modal', () => {
                this.cameraActiveModal?.nativeElement.focus();
            });
        }
    }


    async leaveRoom(isNavigate: boolean = false) {
        await this.meetingService.leaveRoom(isNavigate);
    }

    // ==================== Media Controls ====================

    async toggleCamera() {
        await this.meetingService.toggleCamera();
    }

    async toggleMic() {
        await this.meetingService.toggleMic();
    }

    async shareScreen() {
        try {
            if (!this.room()) return;

            // Save current mic state before screen share
            const wasMicOn = this.meetingService.isMicOn();
            console.log('=== SCREEN SHARE START ===');
            console.log('Mic state before screen share:', wasMicOn);

            // IMPORTANT: If no audio track exists, create one BEFORE screen share
            // This ensures WebRTC SDP renegotiation happens with audio already in place
            const existingAudioPub = this.room()?.localParticipant.audioTrackPublications.values().next().value;
            if (!existingAudioPub?.track) {
                console.log('No audio track exists - creating one BEFORE screen share...');
                await this.room()?.localParticipant.setMicrophoneEnabled(true);
                console.log('Audio track created');

                // If mic was supposed to be off, mute it
                if (!wasMicOn) {
                    console.log('Muting audio track since mic was off...');
                    const newAudioPub = this.room()?.localParticipant.audioTrackPublications.values().next().value;
                    if (newAudioPub?.track) {
                        await newAudioPub.track.mute();
                        console.log('Audio track muted');
                    }
                }
            }

            // Log current audio track state before screen share
            const audioTrackBefore = this.room()?.localParticipant.audioTrackPublications.values().next().value?.track;
            console.log('Audio track before screen share:', {
                exists: !!audioTrackBefore,
                isMuted: audioTrackBefore?.isMuted,
                mediaStreamTrackEnabled: audioTrackBefore?.mediaStreamTrack?.enabled,
                mediaStreamTrackReadyState: audioTrackBefore?.mediaStreamTrack?.readyState
            });

            // FIXED: Set audio to false to prevent system audio from conflicting with microphone
            // If you want screen audio, you would need to handle it separately and publish it
            const screenTracks = await createLocalScreenTracks({
                audio: false, // Changed from true - prevents mic conflict
                resolution: { width: 1920, height: 1080 },
            });

            // Get only the video track
            const screenTrack = screenTracks.find(t => t.kind === 'video');

            if (!screenTrack || screenTrack.mediaStreamTrack.readyState === 'ended') {
                console.warn('User cancelled screen share or no video track');
                return;
            }

            this.isMyshareScreen = true;
            this.localScreenTrack = screenTrack as LocalVideoTrack;

            // Detect when user presses "Stop sharing" in browser UI
            screenTrack.mediaStreamTrack.onended = () => {
                this.stopScreenShare();
            };

            console.log('Publishing screen track...');
            await this.room()?.localParticipant.publishTrack(screenTrack);

            // Attach to the screenshare component's preview element
            const previewElement = this.screenshareComponent?.getScreenPreviewElement();
            if (previewElement) {
                screenTrack.attach(previewElement);
            }
            console.log('Screen track published');

            console.log('=== SCREEN SHARE END ===');
        } catch (error) {
            console.warn('Screen share cancelled or failed:', error);
        }
    }

    async stopScreenShare() {
        if (!this.room) return;

        this.isMyshareScreen = false;
        this.localScreenTrack = null;

        const publications = this.room()?.localParticipant.videoTrackPublications;
        publications?.forEach(async (pub: LocalTrackPublication) => {
            if (pub.source === Track.Source.ScreenShare && pub.track) {
                const track = pub.track;
                await this.room()?.localParticipant.unpublishTrack(track);
                track.stop();
            }
        });

        this.roomService.latestScreenShare.next(null);
    }

    showUserMicActivePopup() {
        if (this.modalInstance) {
            this.modalInstance.show();
        }
    }

    async activeMic() {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Stop the stream immediately - we only needed it to trigger permission prompt
        stream.getTracks().forEach(track => track.stop());
    }

    showUseCameraActivePopup() {
        if (this.videoModalInstance) {
            this.videoModalInstance.show();
        }
    }


    // ==================== Lifecycle Cleanup ====================

    async ngOnDestroy() {
        // CRITICAL: Stop all tracks and leave room before destroying component
        await this.leaveRoom();
        if (this.timerSubscription) {
            this.timerSubscription.unsubscribe();
        }
        if (this.subscription) {
            this.subscription.unsubscribe();
        }
        this.mediaPerm.destroy();
        this.subscriptions.unsubscribe();
        this.subs.forEach(s => s.unsubscribe());
        this.detachScreen();
        this.stopTimer();
    }

    async selectBackground(option: BackgroundOption) {
        if (this.isProcessing) return;
        if (!this.localTrack()) {
            throw new Error('Camera must be enabled to apply virtual background');
        }

        this.selectedBackground = option;
        try {
            await this.videoBackgroundService.applyBackground(this.localTrack()!, this.selectedBackground);
        } catch (error) {
            console.error('Failed to apply virtual background:', error);
            throw error;
        }
    }

    getBackgroundTypeIcon(type: BackgroundType): string {
        switch (type) {
            case BackgroundType.NONE:
                return 'close';
            case BackgroundType.BLUR:
                return 'blur_on';
            case BackgroundType.IMAGE:
                return 'image';
            default:
                return 'help';
        }
    }

    sharePopupModal() {
        if (this.shareLinkModalInstance) {
            const encodedUrl = encodeURIComponent(`Join my meeting: ${window.location.href}`);
            this.whatsappUrl = `https://wa.me/?text=${encodedUrl}`;
            this.gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&su=Join Meeting&body=${encodedUrl}`;
            this.tweetUrl = `https://twitter.com/intent/tweet?text=${encodedUrl}`;
            this.linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${window.location.href}`;
            this.shareLinkModalInstance.show();
        }
    }

    copyLink() {
        navigator.clipboard.writeText(this.meetingUrl);
        alert("Meeting link copied!");
    }

    toggleHandRaise() {
        this.handRaised = !this.handRaised;
        const message = JSON.stringify({
            type: this.handRaised ? hand_raise : hand_down,
            raised: this.handRaised
        });

        this.room()?.localParticipant.publishData(
            new TextEncoder().encode(message),
            {
                reliable: true,
                topic: 'hand_signal'
            }
        );
    }

    sendReaction(emoji: string) {
        this.roomService.sendReaction(emoji, 'You')
    }

    sendChat(event: any) {
        event.preventDefault();
        if (this.textMessage) {
            this.roomService.sendChat(this.textMessage, this.roomForm.value.participantName!, true);
            this.textMessage = "";
            const audio = new Audio('/assets/message-pop-alert.mp3');
            audio.play().catch(() => { });
        }
    }

    async changeMicrophone(deviceId: string) {
        if (!this.room) return;

        try {
            // Replace mic with the new selected device
            await this.room()?.localParticipant.setMicrophoneEnabled(true, { deviceId });
        } catch (err) {
            console.error('Failed to change microphone', err);
        }
    }

    async changeSpeaker(deviceId: string) {
        if (this.remoteAudio && (this.remoteAudio as any).setSinkId) {
            try {
                await (this.remoteAudio as any).setSinkId(deviceId);
                console.log('Speaker switched to:', deviceId);
            } catch (err) {
                console.error('Error switching speaker', err);
            }
        } else {
            console.warn('setSinkId not supported in this browser');
        }
    }

    private attachScreen(track: RemoteVideoTrack) {
        this.detachScreen(); // clean up previous
        this.currentScreenTrack = track;
        const previewElement = this.screenshareComponent?.getScreenPreviewElement();
        if (previewElement) {
            track.attach(previewElement);
        }
    }

    private detachScreen() {
        // Even if the component is hidden and previewElement is null,
        // we still need to detach the track and reset state
        if (this.currentScreenTrack) {
            const previewElement = this.screenshareComponent?.getScreenPreviewElement();
            if (previewElement) {
                this.currentScreenTrack.detach(previewElement);
                previewElement.srcObject = null;
            } else {
                // If element is not available, detach from all elements
                this.currentScreenTrack.detach();
            }
            this.currentScreenTrack = null;
        }
        // Always reset the local screen share flag
        this.isMyshareScreen = false;
    }

    // Screen Recording Methods
    async startScreenVideoAudio() {
        this.startTimer();
        this.recordingAndType = { isRecording: true, isAudioRecording: false, isTranscribe: false, isVideoRecording: true };
        await this.recorder.startRecording({ video: true, audio: true, source: 'screen' });
    }

    async startScreenVideo() {
        this.startTimer();
        this.recordingAndType = { isRecording: true, isAudioRecording: false, isTranscribe: false, isVideoRecording: true };
        await this.recorder.startRecording({ video: true, audio: false, source: 'screen' });
    }

    // Camera Recording Methods
    async startCameraVideoAudio() {
        this.startTimer();
        this.recordingAndType = { isRecording: true, isAudioRecording: false, isTranscribe: false, isVideoRecording: true };
        await this.recorder.startRecording({ video: true, audio: true, source: 'camera' });
    }

    async startCameraVideo() {
        this.startTimer();
        this.recordingAndType = { isRecording: true, isAudioRecording: false, isTranscribe: false, isVideoRecording: true };
        await this.recorder.startRecording({ video: true, audio: false, source: 'camera' });
    }

    // Audio Only Recording
    async startAudio() {
        this.startTimer();
        this.recordingAndType = { isRecording: true, isAudioRecording: true, isTranscribe: false, isVideoRecording: false };
        await this.recorder.startRecording({ video: false, audio: true, source: 'camera' });
    }

    async startTranscribe() {
        this.startTimer();
        this.recordingAndType = { isRecording: true, isAudioRecording: true, isTranscribe: true, isVideoRecording: false };
        await this.recorder.startRecording({ video: false, audio: true, source: 'camera' });
    }

    // Pause/Resume Recording
    togglePauseResume() {
        this.recorder.togglePauseResume();
    }

    // Cancel Recording
    cancelRecording() {
        this.recorder.cancelRecording();
        this.stopTimer();
        this.recordingAndType = { isRecording: false, isAudioRecording: false, isTranscribe: false, isVideoRecording: false };
    }

    async stopRecording() {
        try {
            this.stopTimer();
            this.recordingAndType.isRecording = false;
            const blob = await this.recorder.stopRecording();
            const name = `recording_${crypto.randomUUID()}`;
            if (this.recordingAndType.isTranscribe) {
                this.recorder.downloadAudioToText(blob, name);
            } else {
                this.recorder.downloadRecording(blob, name);
            }
            this.recordingAndType = { isRecording: false, isAudioRecording: false, isTranscribe: false, isVideoRecording: false };
        } catch (err) {
            alert('Error stopping recording: ' + err);
        }
    }

    private startTimer(): void {
        this.timeInSeconds = 0;
        this.watchSubscription = this.timer$.subscribe(() => {
            this.timeInSeconds++;
        });
    }

    private stopTimer(): void {
        if (this.watchSubscription) {
            this.watchSubscription.unsubscribe();
            this.watchSubscription = null;
        }
        this.timeInSeconds = 0;
    }

    public formatTime(totalSeconds: number): string {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        // Use String.padStart() to ensure two digits
        const formattedMinutes = String(minutes).padStart(2, '0');
        const formattedSeconds = String(seconds).padStart(2, '0');

        return `${formattedMinutes}:${formattedSeconds}`;
    }

    private showNotification(message: string) {
        const toast = document.createElement('div');
        toast.className = 'toast align-items-center text-bg-primary border-0 show position-fixed top-0 end-0 m-3';
        toast.style.zIndex = '1055';
        toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">${message}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto"></button>
        </div>
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    private getFullName(): string {
        let fullName = this.user?.firstName;
        if (this.user?.lastName)
            fullName = fullName + " " + this.user.lastName;

        return fullName;
    }

    private popStateListener = (event: PopStateEvent) => {
        if (this.meetingService.inMeeting()) {
            history.pushState(null, '', window.location.href); // push state back
            alert('You cannot navigate back during a meeting.');
        }
    };

    @HostListener('window:beforeunload', ['$event'])
    handleBeforeUnload(event: BeforeUnloadEvent) {
        if (this.meetingService.inMeeting()) {
            event.preventDefault();
            // Modern browsers ignore custom text and show a generic confirm
            event.returnValue = '';
            return '';
        }
        return;
    }

    openSeetingOffCanvas() {
        this.offcanvasInstance = new Offcanvas(this.offcanvasRef.nativeElement);
        this.offcanvasInstance.show();
    }

    closeSeetingOffCanvas() {
        this.offcanvasInstance.hide();
    }

    openVirtualBackgroundOffcanvas() {
        this.virtualBackgroundOffcanvasInstance = new Offcanvas(this.virtualBackgroundOffcanvasRef.nativeElement);
        this.virtualBackgroundOffcanvasInstance.show();
    }

    closeVirtualBackgroundOffcanvas() {
        this.virtualBackgroundOffcanvasInstance.hide();
    }

    openChatOffCanvas() {
        this.chatOffCanvasInstance = new Offcanvas(this.chatOffCanvasRef.nativeElement);
        this.chatOffCanvasInstance.show();
    }

    closeChatOffCanvas() {
        this.chatOffCanvasInstance.hide();
    }

    // ========================================
    // DRAGGABLE MINI WINDOW FUNCTIONALITY
    // ========================================


    // Remove @HostListener since we're using template event binding now
    onMiniMouseDown(e: MouseEvent) {
        if (!this.meetingService.isMinimized()) return;

        this.dragging = true;
        this.hasDragged = false; // Reset drag flag
        const target = e.currentTarget as HTMLElement;
        const rect = target.getBoundingClientRect();
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.dragOrigLeft = rect.left;
        this.dragOrigTop = rect.top;
        e.preventDefault();
    }

    @HostListener('document:mousemove', ['$event'])
    onMiniMouseMove(e: MouseEvent) {
        if (!this.dragging) return;

        const dx = e.clientX - this.dragStartX;
        const dy = e.clientY - this.dragStartY;

        // Only start dragging if moved more than 5px (prevents accidental drags)
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
            this.hasDragged = true;
        }

        if (!this.hasDragged) return; // Don't update position until drag threshold is met

        // Get the full-container div element
        const el = (this.elRef.nativeElement as HTMLElement).querySelector('.full-container') as HTMLElement;
        if (!el) return;

        const rect = el.getBoundingClientRect();

        // Calculate new position with viewport boundaries
        const viewportWidth = document.documentElement.clientWidth;
        const viewportHeight = document.documentElement.clientHeight;

        let newLeft = this.dragOrigLeft + dx;
        let newTop = this.dragOrigTop + dy;

        // Clamp to viewport
        newLeft = Math.max(0, Math.min(newLeft, viewportWidth - rect.width));
        newTop = Math.max(0, Math.min(newTop, viewportHeight - rect.height));

        el.style.left = `${newLeft}px`;
        el.style.top = `${newTop}px`;
    }

    @HostListener('document:mouseup')
    onMiniMouseUp() {
        this.dragging = false;
    }

    // Remove @HostListener since we're using template event binding now
    onMiniDoubleClick(e: MouseEvent) {
        if (this.meetingService.isMinimized() && !this.hasDragged) {
            let event: any = e.currentTarget;
            event.removeAttribute('style');
            this.meetingService.maximize();
            e.stopPropagation();
        }
    }

    // ========================================
    // MINI MODE HELPER METHODS
    // ========================================

    getUserInitiaLetter(): string {
        const name = this.getFullName();
        if (!name) return "";

        const words = name.split(' ').slice(0, 2);
        const initials = words.map(x => {
            if (x.length > 0) {
                return x.charAt(0).toUpperCase();
            }
            return '';
        }).join('');

        return initials;
    }

    getColorFromName(): string {
        const name = this.getFullName();
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
}


interface RecordingAndType {
    isRecording: boolean;
    isAudioRecording: boolean;
    isVideoRecording: boolean;
    isTranscribe: boolean;
}

export interface Reaction {
    id: number;
    emoji: string;
    name: string;
}

export interface InvitedParticipant {
    name: string;
    id: string;
    email: string;
    invited: boolean;
}