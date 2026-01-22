import { AfterViewInit, Component, ElementRef, Input, OnChanges, SimpleChanges, ViewChild, Signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LocalVideoTrack, RemoteTrackPublication } from 'livekit-client';
import { VideoComponent } from '../../video/video.component';
import { MeetingService } from '../meeting.service';

/**
 * Screen Share View Component
 * Displays the screen share content (local or remote)
 * No longer handles participant roster - that's now in meeting.component
 */
@Component({
    selector: 'app-screenshare',
    standalone: true,
    imports: [CommonModule, VideoComponent],
    templateUrl: './screenshare.component.html',
    styleUrl: './screenshare.component.css',
})
export class ScreenshareComponent implements AfterViewInit, OnChanges {
    @ViewChild('screenPreview') screenPreview!: ElementRef<HTMLVideoElement>;

    // Inputs from parent component
    @Input() isMyshareScreen: boolean = false;
    @Input() localScreenTrack: LocalVideoTrack | null = null;
    @Input() remoteSharescreenTrack!: Signal<{ participantIdentity: string; trackPublication: RemoteTrackPublication } | null>;

    private isViewReady = false;

    // Inject services directly
    meetingService = inject(MeetingService);

    ngAfterViewInit(): void {
        this.isViewReady = true;
        this.attachLocalScreenTrack();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if ((changes['localScreenTrack'] || changes['isMyshareScreen']) && this.isViewReady) {
            this.attachLocalScreenTrack();
        }
    }

    /**
     * Attach the local screen track to the video preview element
     */
    private attachLocalScreenTrack(): void {
        if (this.localScreenTrack && this.screenPreview?.nativeElement && this.isMyshareScreen) {
            this.localScreenTrack.attach(this.screenPreview.nativeElement);
            console.log('ScreenshareComponent: Local screen track attached to preview');
        }
    }

    /**
     * Get the native video element reference for external usage
     */
    getScreenPreviewElement(): HTMLVideoElement | null {
        return this.screenPreview?.nativeElement || null;
    }
}
