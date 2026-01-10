import { Component, EventEmitter, inject, Input, Output, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup } from '@angular/forms';
import { RemoteParticipant } from 'livekit-client';
import { MeetingService } from '../meeting.service';
import { InvitedParticipant } from '../meeting.component';

/**
 * Shared Participant Roster Component
 * Used by both meeting-view and screenshare components to display
 * the list of participants in the call.
 */
@Component({
    selector: 'app-participant-roster',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './participant-roster.component.html',
    styleUrl: './participant-roster.component.css',
})
export class ParticipantRosterComponent {
    // Inject services directly
    meetingService = inject(MeetingService);

    // Required inputs
    @Input() roomForm!: FormGroup;
    @Input() participantFilter: string = '';
    @Input() remoteUsersCount: number = 0;

    // Remote participants - uses a Signal that can come from either source
    @Input() remoteParticipants!: Signal<Map<string, RemoteParticipant>>;

    // Invited participants not in the call (can be array or use invitedParticipantsArray)
    @Input() invitedParticipants: InvitedParticipant[] = [];

    // Helper functions passed from parent
    @Input() getColorFromName!: (name: string) => string;
    @Input() getUserInitiaLetter!: (name: string) => string;
    @Input() isParticipantAudioEnabled!: (identity: string) => boolean;
    @Input() isParticipantCameraEnabled!: (identity: string) => boolean;

    // Events
    //    @Output() onFilterParticipants = new EventEmitter<Event>();
    @Output() onRequestToJoin = new EventEmitter<InvitedParticipant>();

    raiseJoiningRequest(invited: InvitedParticipant): void {
        this.meetingService.requestToJoin(invited);
    }

    // filterParticipants(event: Event): void {
    //     this.onFilterParticipants.emit(event);
    // }

    requestToJoin(invited: InvitedParticipant): void {
        this.onRequestToJoin.emit(invited);
    }
}
