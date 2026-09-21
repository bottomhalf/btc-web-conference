import { Component, EventEmitter, inject, Input, Output, signal, Signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup } from '@angular/forms';
import { RemoteParticipant, LocalVideoTrack, RemoteVideoTrack } from 'livekit-client';
import { MeetingService } from '../meeting.service';
import { InvitedParticipant } from '../meeting.component';
import { CallParticipant, CallStatus, ParticipantStatus } from '../../models/conference_call/call_model';
import { VideoComponent } from '../../video/video.component';
import { NotificationService } from '../../notifications/services/notification.service';
import { ConfeetSocketService } from '../../providers/socket/confeet-socket.service';
import { LocalService } from '../../providers/services/local.service';
import { ServerEventService } from '../../providers/socket/server-events/server-event.service';

export interface RosterParticipantItem {
    id: string;
    identity: string;
    name: string;
    isLocal: boolean;
    email?: string;
    isInLiveKit: boolean;
}

/**
 * Shared Participant Roster Component
 * Used by both meeting-view and screenshare components to display
 * the list of participants in the call.
 */
@Component({
    selector: 'app-participant-roster',
    standalone: true,
    imports: [CommonModule, VideoComponent],
    templateUrl: './participant-roster.component.html',
    styleUrl: './participant-roster.component.css',
})
export class ParticipantRosterComponent implements OnInit {
    // Inject services directly
    meetingService = inject(MeetingService);
    notificationService = inject(NotificationService);
    ws = inject(ConfeetSocketService);
    local = inject(LocalService);
    serverEventService = inject(ServerEventService);

    // Required inputs
    @Input() roomForm!: FormGroup;

    // Invited participants not in the call (can be array or use invitedParticipantsArray)
    @Input() invitedParticipants: InvitedParticipant[] = [];

    // Output to close sidebar
    @Output() closeRoster = new EventEmitter<void>();

    // Search query tracking
    searchQuery = signal<string>('');

    // Track which participants are currently being called
    callingParticipants = signal<Set<string>>(new Set());

    // Track which participants did not respond
    noResponseParticipants = signal<Set<string>>(new Set());

    // Timeout duration in milliseconds (60 seconds)
    private readonly CALLING_TIMEOUT = 60000;

    onSearchInput(event: Event): void {
        const value = (event.target as HTMLInputElement).value || '';
        this.searchQuery.set(value);
        this.meetingService.filterParticipants(event);
    }

    clearSearch(): void {
        this.searchQuery.set('');
        this.meetingService.filterParticipants({ target: { value: '' } } as any);
    }

    ngOnInit() {
        // If we are the ones who initiated the call, we want to immediately show "Ringing..."
        // for all members of the conversation who are not us.
        if (this.serverEventService.callStatus() === CallStatus.INITIATED || this.serverEventService.callStatus() === CallStatus.RINGING) {
            const currentUserId = this.local.getUser()?.userId;
            const conv = this.ws.currentConversation();
            if (conv && conv.participants) {
                const callingSet = new Set(this.callingParticipants());

                conv.participants.forEach(p => {
                    if (p.userId && p.userId !== currentUserId) {
                        callingSet.add(p.userId);

                        // Set timeout to transition them to "No response" if they don't join
                        setTimeout(() => {
                            const updatedSet = new Set(this.callingParticipants());
                            if (updatedSet.has(p.userId)) {
                                updatedSet.delete(p.userId);
                                this.callingParticipants.set(updatedSet);

                                const isAccepted = this.inMeetingParticipants().some(mp => mp.id === p.userId || mp.identity === p.userId);
                                if (!isAccepted) {
                                    const newNoResponseSet = new Set(this.noResponseParticipants());
                                    newNoResponseSet.add(p.userId);
                                    this.noResponseParticipants.set(newNoResponseSet);
                                }
                            }
                        }, this.CALLING_TIMEOUT);
                    }
                });

                this.callingParticipants.set(callingSet);
            }
        }
    }

    getOthersInvited(): CallParticipant[] {
        // 1. Get the list of invited participants from the backend event
        const backendInvited = this.meetingService.filteredInvitedParticipants(false);
        const othersInvitedMap = new Map<string, CallParticipant>();

        backendInvited.forEach(p => {
            if (p.userId) {
                othersInvitedMap.set(p.userId, p);
            }
        });

        // 2. Merge with the members of the current conversation (if they aren't already in the meeting)
        const conv = this.ws.currentConversation();
        const currentUserId = this.local.getUser()?.userId;

        if (conv && conv.participants) {
            conv.participants.forEach(p => {
                if (p.userId && p.userId !== currentUserId && !othersInvitedMap.has(p.userId)) {
                    // Map conversation participant to CallParticipant format
                    othersInvitedMap.set(p.userId, {
                        userId: p.userId,
                        name: `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.email || 'Unknown',
                        email: p.email,
                        avatar: p.avatar || '',
                        status: CallStatus.INITIATED
                    });
                }
            });
        }

        // 3. Filter out anyone who is actually already in the meeting
        const inMeeting = this.inMeetingParticipants();
        const finalOthers: CallParticipant[] = [];

        othersInvitedMap.forEach(p => {
            const isAlreadyInMeeting = inMeeting.some(mp =>
                mp.id === p.userId ||
                mp.identity === p.name ||
                (p.email && mp.identity === p.email)
            );

            if (!isAlreadyInMeeting) {
                finalOthers.push(p);
            }
        });

        // 4. Apply the search filter if any
        const filterValue = (this.meetingService as any).participantFilterSignal ? (this.meetingService as any).participantFilterSignal().toLowerCase().trim() : '';
        if (!filterValue) {
            return finalOthers;
        }

        return finalOthers.filter(p =>
            (p.name && p.name.toLowerCase().includes(filterValue)) ||
            (p.email && p.email.toLowerCase().includes(filterValue))
        );
    }

    isCallingParticipant(userId: string): boolean {
        return this.callingParticipants().has(userId);
    }

    isNoResponseParticipant(userId: string): boolean {
        return this.noResponseParticipants().has(userId);
    }

    inMeetingParticipants(): RosterParticipantItem[] {
        const filterValue = (this.meetingService as any).participantFilterSignal ? (this.meetingService as any).participantFilterSignal().toLowerCase().trim() : '';
        const list: RosterParticipantItem[] = [];

        // 1. Local participant (You)
        const localName = this.roomForm?.value?.participantName || 'You';
        list.push({
            id: 'local-you',
            identity: localName,
            name: localName,
            isLocal: true,
            isInLiveKit: true
        });

        // 2. All LiveKit remote participants (who are actually in the meeting room)
        const lkParticipants = this.meetingService.remoteParticipants();
        lkParticipants.forEach((rp, identity) => {
            list.push({
                id: rp.sid || identity,
                identity: identity,
                name: rp.name || identity,
                isLocal: false,
                isInLiveKit: true
            });
        });

        // 3. Any backend accepted participants from serverEventService (filteredInvitedParticipants(true))
        // just in case someone is accepted via websocket but hasn't completed LiveKit join yet
        const acceptedBackend = this.meetingService.filteredInvitedParticipants(true);
        if (acceptedBackend && acceptedBackend.length) {
            acceptedBackend.forEach((p) => {
                const alreadyAdded = list.some(item =>
                    item.identity === p.name ||
                    item.name === p.name ||
                    (p.email && item.identity === p.email) ||
                    item.id === p.userId
                );
                if (!alreadyAdded) {
                    list.push({
                        id: p.userId,
                        identity: p.name || p.email || p.userId,
                        name: p.name,
                        email: p.email,
                        isLocal: false,
                        isInLiveKit: false
                    });
                }
            });
        }

        // Filter by search query if any
        if (!filterValue) {
            return list;
        }
        return list.filter(p =>
            p.name.toLowerCase().includes(filterValue) ||
            p.identity.toLowerCase().includes(filterValue) ||
            (p.email && p.email.toLowerCase().includes(filterValue))
        );
    }

    isAudioEnabled(p: RosterParticipantItem): boolean {
        if (p.isLocal) {
            return this.meetingService.isMicOn();
        }
        return this.meetingService.isParticipantAudioEnabled(p.identity);
    }

    isCameraEnabled(p: RosterParticipantItem): boolean {
        if (p.isLocal) {
            return this.meetingService.isCameraOn();
        }
        return this.meetingService.isParticipantCameraEnabled(p.identity);
    }

    getVideoTrack(p: RosterParticipantItem): LocalVideoTrack | RemoteVideoTrack | undefined {
        if (p.isLocal) {
            return this.meetingService.localTrack() || undefined;
        }
        return this.meetingService.getParticipantVideoTrack(p.identity);
    }

    hasVideoTrack(p: RosterParticipantItem): boolean {
        return this.isCameraEnabled(p) && !!this.getVideoTrack(p);
    }

    requestToJoin(invited: CallParticipant): void {
        // Add to calling set and remove from noResponse set
        const currentCallingSet = new Set(this.callingParticipants());
        currentCallingSet.add(invited.userId);
        this.callingParticipants.set(currentCallingSet);

        const currentNoResponseSet = new Set(this.noResponseParticipants());
        if (currentNoResponseSet.has(invited.userId)) {
            currentNoResponseSet.delete(invited.userId);
            this.noResponseParticipants.set(currentNoResponseSet);
        }

        // Call the service method
        this.meetingService.requestToJoin(invited);

        // Reset after timeout
        setTimeout(() => {
            const updatedSet = new Set(this.callingParticipants());
            if (updatedSet.has(invited.userId)) {
                updatedSet.delete(invited.userId);
                this.callingParticipants.set(updatedSet);

                // Show timeout notification if the user is still not in the meeting room
                const isAccepted = this.meetingService.filteredInvitedParticipants(true).some(p => p.userId === invited.userId);
                if (!isAccepted) {
                    // Move to no response set
                    const newNoResponseSet = new Set(this.noResponseParticipants());
                    newNoResponseSet.add(invited.userId);
                    this.noResponseParticipants.set(newNoResponseSet);

                    this.notificationService.showNotification({
                        id: crypto.randomUUID(),
                        type: 'warning',
                        title: 'No response',
                        content: `${invited.name} did not answer the call.`,
                        conversationId: '',
                        timestamp: new Date(),
                        read: false
                    });
                }
            }
        }, this.CALLING_TIMEOUT);
    }
}

