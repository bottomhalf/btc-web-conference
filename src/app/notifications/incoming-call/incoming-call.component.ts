import { Component, effect, inject, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ServerEventService } from '../../providers/socket/server-event.service';
import { ClientEventService } from '../../providers/socket/client-event.service';
import { CallType } from '../../models/conference_call/call_model';
import { Router } from '@angular/router';
import { ConfeetSocketService } from '../../providers/socket/confeet-socket.service';

@Component({
    selector: 'app-incoming-call',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './incoming-call.component.html',
    styleUrl: './incoming-call.component.scss'
})
export class IncomingCallComponent implements OnDestroy {
    serverEventService = inject(ServerEventService);
    clientEventService = inject(ClientEventService);
    ws = inject(ConfeetSocketService);
    private router = inject(Router);

    private ringtoneAudio: HTMLAudioElement | null = null;
    private timerInterval: any = null;

    callDuration = signal(0);

    incomingCall = () => this.serverEventService.incomingCall();

    constructor() {
        // Watch for incoming call changes with effect
        // allowSignalWrites: true is needed because startTimer writes to callDuration signal
        effect(() => {
            const hasIncoming = this.serverEventService.hasIncomingCall();

            if (hasIncoming) {
                // Start ringtone and timer when incoming call starts
                this.startRingtone();
                this.startTimer();
            } else {
                // Stop ringtone and timer when call ends/dismissed
                this.stopRingtone();
                this.stopTimer();
            }
        }, { allowSignalWrites: true });
    }

    ngOnDestroy(): void {
        this.stopRingtone();
        this.stopTimer();
    }

    isVideoCall(): boolean {
        return this.incomingCall()?.callType === CallType.VIDEO;
    }

    getCallerName(): string {
        const call = this.incomingCall();
        return call?.callerName || call?.callerId || 'Unknown Caller';
    }

    getCallerInitial(): string {
        const name = this.getCallerName();
        return name.charAt(0).toUpperCase();
    }

    getJoinCallerName(): string {
        const request = this.incomingCall();
        return request?.callerName || request?.callerId || 'Someone';
    }

    formatTime(seconds: number): string {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    acceptCall(): void {
        const call = this.incomingCall();
        if (call && call.conversationId) {
            this.ws.currentConversationId.set(call.conversationId);
            this.stopRingtone();
            this.stopTimer();
            this.clientEventService.acceptCall(call.conversationId, call.callerId);
            this.router.navigate(['/btc/preview'], {
                state: {
                    id: call.conversationId,
                    type: call.callType || CallType.AUDIO,
                    title: call.callerName || 'NEW'
                }
            });
        }
    }

    joinCall(): void {
        const request = this.incomingCall();
        if (request && request.conversationId) {
            this.ws.currentConversationId.set(request.conversationId);
            this.stopRingtone();
            this.stopTimer();
            this.clientEventService.acceptJoiningRequest(request.conversationId, request.callerId);
            this.router.navigate(['/btc/preview'], {
                state: {
                    id: request.conversationId,
                    type: request.callType || CallType.AUDIO,
                    title: request.callerName || 'Call'
                }
            });
        }
    }

    declineCall(): void {
        const call = this.incomingCall();
        if (call) {
            this.stopRingtone();
            this.stopTimer();
            this.clientEventService.rejectCall(call.conversationId, call.callerId, 'declined');
        }
    }

    dismissJoinRequest(): void {
        const call = this.incomingCall();
        this.clientEventService.dismissJoiningRequest(call.conversationId, call.callerId);
    }

    private startRingtone(): void {
        try {
            // Use absolute path - Angular serves assets from root
            this.ringtoneAudio = new Audio('assets/ringtone.mp3');
            this.ringtoneAudio.loop = true;
            this.ringtoneAudio.volume = 0.7;

            // Resume AudioContext if suspended (required after user interaction)
            this.resumeAudioContext();

            // Try to play
            const playPromise = this.ringtoneAudio.play();

            if (playPromise !== undefined) {
                playPromise
                    .then(() => {
                        console.log('Ringtone playing successfully');
                    })
                    .catch(err => {
                        console.warn('Ringtone autoplay blocked:', err.message);
                        // Try alternative: play on any user interaction with the popup
                        this.setupPlayOnInteraction();
                    });
            }
        } catch (error) {
            console.error('Error initializing ringtone:', error);
        }
    }

    /**
     * Resume AudioContext - helps with autoplay on some browsers
     */
    private resumeAudioContext(): void {
        const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
            const audioContext = new AudioContextClass();
            if (audioContext.state === 'suspended') {
                audioContext.resume();
            }
        }
    }

    /**
     * Setup listener to play audio when user interacts with the call popup
     */
    private setupPlayOnInteraction(): void {
        const playOnce = () => {
            if (this.ringtoneAudio) {
                this.ringtoneAudio.play().catch(() => { });
            }
            document.removeEventListener('click', playOnce);
            document.removeEventListener('touchstart', playOnce);
        };

        document.addEventListener('click', playOnce, { once: true });
        document.addEventListener('touchstart', playOnce, { once: true });
    }

    private stopRingtone(): void {
        if (this.ringtoneAudio) {
            this.ringtoneAudio.pause();
            this.ringtoneAudio.currentTime = 0;
            this.ringtoneAudio = null;
        }
    }

    private startTimer(): void {
        this.callDuration.set(0);
        this.timerInterval = setInterval(() => {
            this.callDuration.update(d => d + 1);
        }, 1000);
    }

    private stopTimer(): void {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }
}
