import { Injectable, signal } from '@angular/core';
import { initialCallState } from './call.state';
import {
    CallStatusValue,
    CallIncomingEvent,
    CallParticipant,
    GroupNotificationEvent,
} from '../../models/conference_call/call_model';

/**
 * CallStore — the single source of truth for all real-time call state.
 *
 * Built with native Angular 18 signals — no external package needed.
 *
 * Components and services never mutate signals directly.
 * They call semantic methods here (setRinging, setEnded, reset…)
 * which keeps every state transition explicit, debuggable, and testable.
 */
@Injectable({ providedIn: 'root' })
export class CallStore {

    // ── Public writable signals ───────────────────────────────────────────────
    // Kept writable so existing call services (accept-call, reject-call, etc.)
    // that call serverEventService.callStatus.set(...) continue to work with
    // zero changes. All NEW code should go through the semantic methods below.

    /** Current call status (ringing, accepted, ended…) */
    readonly callStatus = signal<CallStatusValue | null>(initialCallState.callStatus);

    /** Participants currently in the call room */
    readonly participantsInRoom = signal<CallParticipant[]>(initialCallState.participantsInRoom);

    /** Whether the incoming call notification is visible */
    readonly hasIncomingCall = signal<boolean>(initialCallState.hasIncomingCall);

    /** Whether the joining request notification is visible */
    readonly hasJoiningRequest = signal<boolean>(initialCallState.hasJoiningRequest);

    /** Full details of the active incoming call or joining request */
    readonly incomingCall = signal<CallIncomingEvent | null>(initialCallState.incomingCall);

    /** Latest group notification (group created, member added, etc.) */
    readonly groupNotification = signal<GroupNotificationEvent | null>(initialCallState.groupNotification);

    // ── State Mutation Methods ───────────────────────────────────────────────

    /** Incoming call received — mark the UI as ringing. */
    setRinging(event: CallIncomingEvent, status: CallStatusValue): void {
        this.incomingCall.set(event);
        this.hasIncomingCall.set(true);
        this.callStatus.set(status);
    }

    /** Joining request received — show joining request UI. */
    setJoiningRequest(event: CallIncomingEvent, status: CallStatusValue): void {
        this.incomingCall.set(event);
        this.hasJoiningRequest.set(true);
        this.callStatus.set(status);
    }

    /** Update the list of participants currently in the call room. */
    setParticipantsInRoom(participants: Record<string, CallParticipant>): void {
        const list = participants && Object.keys(participants).length > 0
            ? Object.keys(participants).map(k => participants[k])
            : [];
        this.participantsInRoom.set(list);
    }

    /** Call was accepted by the callee. */
    setAccepted(status: CallStatusValue): void {
        this.callStatus.set(status);
    }

    /** Call was rejected — clear incoming state. */
    setRejected(status: CallStatusValue): void {
        this.callStatus.set(status);
        this.hasIncomingCall.set(false);
        this.incomingCall.set(null);
    }

    /** Caller cancelled before the call was answered. */
    setCancelled(status: CallStatusValue): void {
        this.callStatus.set(status);
        this.hasIncomingCall.set(false);
        this.incomingCall.set(null);
    }

    /** Call timed out with no answer. */
    setTimedOut(status: CallStatusValue): void {
        this.callStatus.set(status);
        this.hasIncomingCall.set(false);
        this.incomingCall.set(null);
    }

    /** Call ended by either party. */
    setEnded(status: CallStatusValue): void {
        this.callStatus.set(status);
        this.hasIncomingCall.set(false);
        this.incomingCall.set(null);
    }

    /** Callee was busy. */
    setBusy(status: CallStatusValue): void {
        this.callStatus.set(status);
        this.hasIncomingCall.set(false);
        this.incomingCall.set(null);
    }

    /** A call error occurred. */
    setFailed(status: CallStatusValue): void {
        this.callStatus.set(status);
        this.hasIncomingCall.set(false);
        this.incomingCall.set(null);
    }

    /** Call was dismissed — no state reset currently needed. */
    setDismissed(): void {
        // intentionally empty; extend if UI needs to react to this
    }

    /** Store a received group notification. */
    setGroupNotification(event: GroupNotificationEvent): void {
        this.groupNotification.set(event);
    }

    /**
     * Hard reset — returns everything to the initial clean state.
     * Call this on logout or after a call fully completes.
     */
    reset(): void {
        this.callStatus.set(initialCallState.callStatus);
        this.participantsInRoom.set(initialCallState.participantsInRoom);
        this.hasIncomingCall.set(initialCallState.hasIncomingCall);
        this.hasJoiningRequest.set(initialCallState.hasJoiningRequest);
        this.incomingCall.set(initialCallState.incomingCall);
        this.groupNotification.set(initialCallState.groupNotification);
    }
}
