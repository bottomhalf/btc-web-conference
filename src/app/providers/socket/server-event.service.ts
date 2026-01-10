import { Injectable, signal } from '@angular/core';
import { Observable, filter, map, Subscription } from 'rxjs';
import { ConfeetSocketService, WsEvent } from './confeet-socket.service';
import { LocalService } from '../services/local.service';
import {
    // Constants
    CallServerEvents,
    CallStatus,
    // Types
    CallStatusValue,
    // Server to Client Events
    CallIncomingEvent,
    CallAcceptedEvent,
    CallRejectedEvent,
    CallCancelledEvent,
    CallTimedOutEvent,
    CallEndedEvent,
    CallBusyEvent,
    CallErrorEvent,
    CallDismissedEvent,
    CallParticipant,
} from '../../models/conference_call/call_model';

@Injectable({
    providedIn: 'root'
})
export class ServerEventService {
    // =========================================================
    // Server to Client Event Observables
    // =========================================================

    /** Emits when receiving an incoming call */
    callIncoming$: Observable<CallIncomingEvent>;

    /** Emits when receiving a joining request */
    callJoiningRequest$: Observable<CallIncomingEvent>;

    /** Emits when callee accepts the call */
    callAccepted$: Observable<CallAcceptedEvent>;

    /** Emits when callee rejects the call */
    callRejected$: Observable<CallRejectedEvent>;

    /** Emits when caller dismisses the call */
    callDismissed$: Observable<CallDismissedEvent>;

    /** Emits when caller cancels before answer */
    callCancelled$: Observable<CallCancelledEvent>;

    /** Emits when call times out (no answer) */
    callTimedOut$: Observable<CallTimedOutEvent>;

    /** Emits when call ends */
    callEnded$: Observable<CallEndedEvent>;

    /** Emits when callee is busy */
    callBusy$: Observable<CallBusyEvent>;

    /** Emits when a call error occurs */
    callError$: Observable<CallErrorEvent>;

    // =========================================================
    // Call State Management
    // =========================================================

    /** Call status for UI display */
    public callStatus = signal<CallStatusValue | null>(null);

    /** Call status for UI display */
    public participantsInRoom = signal<CallParticipant[] | null>(null);

    /** Is receiving an incoming call */
    public hasIncomingCall = signal<boolean>(false);

    /** Is receiving a joining request */
    public hasJoiningRequest = signal<boolean>(false);

    /** Incoming call details */
    public incomingCall = signal<CallIncomingEvent | null>(null);

    private subscriptions = new Subscription();

    constructor(
        private ws: ConfeetSocketService,
        private local: LocalService
    ) {
        // Setup filtered observables for server events
        this.callIncoming$ = this.onCallEvent<CallIncomingEvent>(CallServerEvents.CALL_INCOMING);
        this.callJoiningRequest$ = this.onCallEvent<CallIncomingEvent>(CallServerEvents.CALL_JOINING_REQUEST);
        this.callAccepted$ = this.onCallEvent<CallAcceptedEvent>(CallServerEvents.CALL_ACCEPTED);
        this.callRejected$ = this.onCallEvent<CallRejectedEvent>(CallServerEvents.CALL_REJECTED);
        this.callDismissed$ = this.onCallEvent<CallDismissedEvent>(CallServerEvents.CALL_DISMISSED);
        this.callCancelled$ = this.onCallEvent<CallCancelledEvent>(CallServerEvents.CALL_CANCELLED);
        this.callTimedOut$ = this.onCallEvent<CallTimedOutEvent>(CallServerEvents.CALL_TIMED_OUT);
        this.callEnded$ = this.onCallEvent<CallEndedEvent>(CallServerEvents.CALL_ENDED);
        this.callBusy$ = this.onCallEvent<CallBusyEvent>(CallServerEvents.CALL_BUSY);
        this.callError$ = this.onCallEvent<CallErrorEvent>(CallServerEvents.CALL_ERROR);
    }

    /**
     * Initialize call event listeners.
     * Should be called once from LayoutComponent or NotificationService.
     */
    initialize(): void {
        this.registerCallEventHandlers();
        console.log('ServerEventService initialized');
    }

    // =========================================================
    // Private Helper Methods
    // =========================================================

    /**
     * Generic event filter for call events
     */
    private onCallEvent<T>(eventType: string): Observable<T> {
        return this.ws.getMessageSubject().pipe(
            filter((e: WsEvent) => e.event === eventType),
            map((e: WsEvent) => e.payload as T)
        );
    }

    private updateParticipantsInRoom(event: Record<string, CallParticipant>): void {
        // Check if incomingCall exists and has participants
        if (event && Object.keys(event).length > 0) {
            this.participantsInRoom.set(Object.keys(event).map(x => event[x]));
        } else {
            this.participantsInRoom.set([]);
        }
    }

    /**
     * Register handlers for incoming call events
     */
    private registerCallEventHandlers(): void {
        // Handle incoming call (only for callees, not the caller)
        this.subscriptions.add(
            this.callIncoming$.subscribe(event => {
                const currentUser = this.local.getUser();

                // Skip if I am the caller (I should not get notified of my own call)
                if (currentUser && event.callerId === currentUser.userId) {
                    console.log('Ignoring incoming call event - I am the caller');
                    return;
                }

                // Only set data for callees
                this.incomingCall.set(event);
                this.hasIncomingCall.set(true);
                this.callStatus.set(CallStatus.RINGING);
                console.log('Incoming call from:', event.callerId);
            })
        );

        // Handle joining request (call already in progress, user invited to join)
        this.subscriptions.add(
            this.callJoiningRequest$.subscribe(event => {
                const currentUser = this.local.getUser();

                this.updateParticipantsInRoom(event.participants);
                // Skip if I am the caller (I should not get notified of my own call)
                if (currentUser && event.callerId === currentUser.userId) {
                    console.log('Ignoring joining request event - I am the caller');
                    return;
                }

                // Only set data for callees
                this.incomingCall.set(event);
                this.hasJoiningRequest.set(true);
                this.callStatus.set(CallStatus.JOINING_REQUEST);
                console.log('Joining request from:', event.callerId);
            })
        );

        // Handle call accepted
        this.subscriptions.add(
            this.callAccepted$.subscribe(event => {
                this.callStatus.set(CallStatus.ACCEPTED);
                console.log('Call accepted by:', event.acceptedBy);
                // TODO: Connect to LiveKit room with event.roomName and event.token
            })
        );

        // Handle call rejected
        this.subscriptions.add(
            this.callRejected$.subscribe(event => {
                this.callStatus.set(CallStatus.REJECTED);
                this.resetCallState();
                console.log('Call rejected by:', event.rejectedBy);
            })
        );

        // Handle call dismissed
        this.subscriptions.add(
            this.callDismissed$.subscribe(event => {
                console.log('Call dismissed by:', JSON.stringify(event));
            })
        );

        // Handle call cancelled
        this.subscriptions.add(
            this.callCancelled$.subscribe(event => {
                this.callStatus.set(CallStatus.CANCELLED);
                this.hasIncomingCall.set(false);
                this.incomingCall.set(null);
                console.log('Call cancelled by:', event.cancelledBy);
            })
        );

        // Handle call timeout
        this.subscriptions.add(
            this.callTimedOut$.subscribe(event => {
                this.callStatus.set(CallStatus.TIMEOUT);
                this.resetCallState();
                console.log('Call timed out:', event.conversationId);
            })
        );

        // Handle call ended
        this.subscriptions.add(
            this.callEnded$.subscribe(event => {
                this.callStatus.set(CallStatus.ENDED);
                this.resetCallState();
                console.log('Call ended by:', event.endedBy, 'Duration:', event.duration);
            })
        );

        // Handle callee busy
        this.subscriptions.add(
            this.callBusy$.subscribe(event => {
                this.callStatus.set(CallStatus.BUSY);
                this.resetCallState();
                console.log('User busy:', event.busyUser);
            })
        );

        // Handle call error
        this.subscriptions.add(
            this.callError$.subscribe(event => {
                this.callStatus.set(CallStatus.FAILED);
                this.resetCallState();
                console.error('Call error:', event.error);
            })
        );
    }

    /**
     * Reset all call state
     */
    private resetCallState(): void {
        this.hasIncomingCall.set(false);
        this.incomingCall.set(null);
    }

    /**
     * Cleanup subscriptions
     */
    destroy(): void {
        this.subscriptions.unsubscribe();
    }
}
