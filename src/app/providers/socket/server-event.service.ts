import { Injectable } from '@angular/core';
import { Observable, filter, map, Subscription } from 'rxjs';
import { registerCallEventHandlers } from './server-event.handlers';
import { ConfeetSocketService, WsEvent } from './confeet-socket.service';
import { LocalService } from '../services/local.service';
import {
    // Constants
    CallServerEvents,
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
    GroupNotificationEvent,
} from '../../models/conference_call/call_model';
import { CallStore } from '../../store/call/call.store';

@Injectable({
    providedIn: 'root'
})
export class ServerEventService {

    // =========================================================
    // Server to Client Event Observables
    // (These are pure WebSocket stream filters — no state here)
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

    /** Emits when a call joining request is raised */
    callRaisedJoiningRequest$: Observable<CallIncomingEvent>;

    /** Emits when a group notification is received */
    groupNotification$: Observable<GroupNotificationEvent>;

    // =========================================================
    // Call State — proxied from CallStore
    // All components injecting ServerEventService continue to
    // work with these signals without any change at all.
    // =========================================================

    /** Call status for UI display */
    get callStatus() { return this.store.callStatus; }

    /** Participants currently in the room */
    get participantsInRoom() { return this.store.participantsInRoom; }

    /** Is receiving an incoming call */
    get hasIncomingCall() { return this.store.hasIncomingCall; }

    /** Is receiving a joining request */
    get hasJoiningRequest() { return this.store.hasJoiningRequest; }

    /** Incoming call details */
    get incomingCall() { return this.store.incomingCall; }

    /** Latest group notification */
    get groupNotification() { return this.store.groupNotification; }

    // =========================================================
    // Internal
    // =========================================================

    /** Subscription bag — exposed so server-event.handlers can add to it */
    public subscriptions = new Subscription();

    /** The store — exposed so server-event.handlers can call its methods */
    public store: CallStore;

    constructor(
        private ws: ConfeetSocketService,
        private local: LocalService,
        store: CallStore
    ) {
        this.store = store;

        // Wire up the filtered WebSocket observables
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
        this.callRaisedJoiningRequest$ = this.onCallEvent<CallIncomingEvent>(CallServerEvents.CALL_RAISED_REQUEST);
        this.groupNotification$ = this.onCallEvent<GroupNotificationEvent>(CallServerEvents.CALL_GROUP_NOTIFICATION);
    }

    // =========================================================
    // Public API
    // =========================================================

    /**
     * Initialize call event listeners.
     * Should be called once from LayoutComponent or NotificationService.
     */
    initialize(): void {
        registerCallEventHandlers(this, this.local);
        console.log('[ServerEventService] Initialized with NgRx SignalStore');
    }

    /**
     * Convenience helper — delegates to the store.
     * Kept for backward-compatibility with any code that calls this directly.
     */
    public updateParticipantsInRoom(event: Record<string, CallParticipant>): void {
        this.store.setParticipantsInRoom(event);
    }

    /**
     * Convenience helper — delegates to the store.
     * Kept for backward-compatibility with any code that calls this directly.
     */
    public resetCallState(): void {
        this.store.reset();
    }

    /**
     * Cleanup subscriptions on destroy.
     */
    destroy(): void {
        this.subscriptions.unsubscribe();
    }

    // =========================================================
    // Private Helpers
    // =========================================================

    /**
     * Generic typed filter over the WebSocket message stream.
     */
    private onCallEvent<T>(eventType: string): Observable<T> {
        return this.ws.getMessageSubject().pipe(
            filter((e: WsEvent) => e.event === eventType),
            map((e: WsEvent) => e.payload as T)
        );
    }
}
