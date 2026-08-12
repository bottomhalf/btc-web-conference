import { AfterViewInit, Component, ElementRef, Input, OnChanges, SimpleChanges, ViewChild, Signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LocalVideoTrack, RemoteTrackPublication, RemoteVideoTrack } from 'livekit-client';
import { MeetingService } from '../meeting.service';

/**
 * Screen Share View Component
 * Displays the screen share content (local or remote)
 * No longer handles participant roster - that's now in meeting.component
 */
@Component({
    selector: 'app-screenshare',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './screenshare.component.html',
    styleUrl: './screenshare.component.css',
})
export class ScreenshareComponent implements AfterViewInit, OnChanges {
    @ViewChild('screenPreview') screenPreview!: ElementRef<HTMLVideoElement>;

    // Inputs from parent component
    @Input() isMyshareScreen: boolean = false;
    @Input() localScreenTrack: LocalVideoTrack | null = null;
    @Input() remoteVideoTrack: RemoteVideoTrack | null = null;
    @Input() remoteSharescreenTrack!: Signal<{ participantIdentity: string; trackPublication: RemoteTrackPublication } | null>;

    private isViewReady = false;
    private attachedRemoteTrack: RemoteVideoTrack | null = null;

    // Inject services directly
    meetingService = inject(MeetingService);

    ngAfterViewInit(): void {
        this.isViewReady = true;
        this.attachLocalScreenTrack();
        this.attachRemoteScreenTrack();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if ((changes['localScreenTrack'] || changes['isMyshareScreen']) && this.isViewReady) {
            this.attachLocalScreenTrack();
        }
        if (changes['remoteVideoTrack'] && this.isViewReady) {
            this.attachRemoteScreenTrack();
        }
    }

    /**
     * Attach the local screen track to the video preview element
     */
    private attachLocalScreenTrack(): void {
        if (this.localScreenTrack && this.screenPreview?.nativeElement && this.isMyshareScreen) {
            if (this.attachedRemoteTrack) {
                this.attachedRemoteTrack.detach(this.screenPreview.nativeElement);
                this.attachedRemoteTrack = null;
            }
            this.localScreenTrack.attach(this.screenPreview.nativeElement);
            console.log('ScreenshareComponent: Local screen track attached to preview');
        }
    }

    /**
     * Attach the remote screen track to the video preview element
     */
    private attachRemoteScreenTrack(): void {
        if (!this.isViewReady || !this.screenPreview?.nativeElement) return;
        
        // Always detach previous remote track
        if (this.attachedRemoteTrack) {
            this.attachedRemoteTrack.detach(this.screenPreview.nativeElement);
            this.attachedRemoteTrack = null;
        }

        if (this.remoteVideoTrack && !this.isMyshareScreen) {
            this.remoteVideoTrack.attach(this.screenPreview.nativeElement);
            this.attachedRemoteTrack = this.remoteVideoTrack;
            console.log('ScreenshareComponent: Remote screen track attached to preview');
        } else if (!this.remoteVideoTrack && !this.isMyshareScreen && this.screenPreview?.nativeElement) {
            this.screenPreview.nativeElement.srcObject = null;
        }
    }

    /**
     * Get the native video element reference for external usage
     */
    getScreenPreviewElement(): HTMLVideoElement | null {
        return this.screenPreview?.nativeElement || null;
    }
}
