import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, input, viewChild, effect } from '@angular/core';
import { LocalVideoTrack, RemoteVideoTrack } from 'livekit-client';
import { MeetingService } from '../meeting/meeting.service';

@Component({
    selector: 'video-component',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './video.component.html',
    styleUrl: './video.component.css',
})
export class VideoComponent implements AfterViewInit, OnDestroy {
    videoElement = viewChild<ElementRef<HTMLVideoElement>>('videoElement');

    track = input.required<LocalVideoTrack | RemoteVideoTrack>();
    participantIdentity = input.required<string>();
    local = input(false);
    isMute = input(false);
    isScreenShare = input(false);

    private attachedElement: HTMLVideoElement | null = null;

    constructor(public meetingService: MeetingService) {
        // Use effect to react to track changes
        effect(() => {
            const currentTrack = this.track();
            if (currentTrack && this.videoElement()) {
                this.attachTrack();
            }
        });
    }

    ngAfterViewInit() {
        this.attachTrack();
    }

    private attachTrack() {
        const videoEl = this.videoElement()?.nativeElement;
        const currentTrack = this.track();

        if (videoEl && currentTrack && this.attachedElement !== videoEl) {
            try {
                // Attach to this video element (tracks can be attached to multiple elements)
                currentTrack.attach(videoEl);
                this.attachedElement = videoEl;
            } catch (error) {
                console.error('Error attaching video track:', error);
            }
        }
    }

    ngOnDestroy() {
        // CRITICAL FIX: DO NOT detach tracks on component destroy
        // When minimize() triggers change detection, *ngIf may recreate this component
        // Detaching here causes black screens - LiveKit tracks should persist!
        // The track will be properly cleaned up when the actual meeting ends.

        /* COMMENTED OUT - Causes track loss during minimize()
        if (this.attachedElement) {
            try {
                this.track()?.detach(this.attachedElement);
            } catch (error) {
                console.error('Error detaching video track:', error);
            }
            this.attachedElement = null;
        }
        */
    }

}
