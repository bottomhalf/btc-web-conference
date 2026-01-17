import { Injectable, signal } from '@angular/core';
import { ConfeetSocketService } from './confeet-socket.service';
import {
    // Constants
    CallEvents,
    CallType,
    CallConfig,
    CallStatus,
    CallEndReason,
    // Types
    CallTypeValue,
    CallStatusValue,
    // Client to Server Payloads
    CallInitiatePayload,
    CallAcceptPayload,
    CallRejectPayload,
    CallCancelPayload,
    CallTimeoutPayload,
    CallEndPayload,
    CallDismissPayload,
    GroupNotificationEvent,
    NotificationEventType,
} from '../../models/conference_call/call_model';
import { ServerEventService } from './server-event.service';

@Injectable({
    providedIn: 'root'
})
export class ClientEventService {
    // =========================================================
    // Call State Management (shared with ServerEventService)
    // =========================================================

    /** Call status for UI display */
    public callStatus = this.serverEventService.callStatus;

    /** Is receiving an incoming call */
    public hasIncomingCall = this.serverEventService.hasIncomingCall;

    /** Is receiving a joining request */
    public hasJoiningRequest = this.serverEventService.hasJoiningRequest;

    constructor(
        private serverEventService: ServerEventService,
        private ws: ConfeetSocketService
    ) { }

    // =========================================================
    // Client to Server Methods (Send Events)
    // =========================================================

    /**
     * Join a audio call to a user
     */
    joinCall(calleeId: string, conversationId: string): void {
        this.send(CallEvents.CALL_STARTED, <CallInitiatePayload>{
            conversationId: conversationId,
            calleeIds: [calleeId],
            callType: CallType.AUDIO,
            timeout: CallConfig.DEFAULT_TIMEOUT
        });
        this.callStatus.set(CallStatus.INITIATED);
    }

    /**
     * Initiate a audio call to a user
     */
    initiateAudioJoiningRequest(calleeId: string, conversationId: string): void {
        this.send(CallEvents.JOINING_REQUEST, <CallInitiatePayload>{
            callId: crypto.randomUUID(),
            conversationId: conversationId,
            calleeIds: [calleeId],
            callType: CallType.AUDIO,
            timeout: CallConfig.DEFAULT_TIMEOUT
        });
        this.callStatus.set(CallStatus.INITIATED);
    }

    /**
     * Initiate a audio call to a user
     */
    initiateVideoJoiningRequest(calleeId: string, conversationId: string): void {
        this.send(CallEvents.JOINING_REQUEST, <CallInitiatePayload>{
            callId: crypto.randomUUID(),
            conversationId: conversationId,
            calleeIds: [calleeId],
            callType: CallType.VIDEO,
            timeout: CallConfig.DEFAULT_TIMEOUT
        });
        this.callStatus.set(CallStatus.INITIATED);
    }

    /**
     * Initiate a audio call to a user
     */
    initiateAudioCall(calleeId: string, conversationId: string): void {
        this.send(CallEvents.CALL_INITIATE, <CallInitiatePayload>{
            conversationId: conversationId,
            calleeIds: [calleeId],
            callType: CallType.AUDIO,
            timeout: CallConfig.DEFAULT_TIMEOUT
        });
        this.callStatus.set(CallStatus.INITIATED);
    }

    /**
     * Initiate a video call to a user
     */
    initiateVideoCall(calleeId: string, conversationId: string): void {
        this.send(CallEvents.CALL_INITIATE, <CallInitiatePayload>{
            callId: crypto.randomUUID(),
            conversationId: conversationId,
            calleeIds: [calleeId],
            callType: CallType.VIDEO,
            timeout: CallConfig.DEFAULT_TIMEOUT
        });
        this.callStatus.set(CallStatus.INITIATED);
    }

    /**
     * Initiate a group call to multiple users
     */
    initiateGroupCall(calleeIds: string[], conversationId: string, callType: CallTypeValue): void {
        this.send(CallEvents.CALL_INITIATE, <CallInitiatePayload>{
            callId: crypto.randomUUID(),
            conversationId: conversationId,
            calleeIds: calleeIds,
            callType: callType,
            timeout: CallConfig.DEFAULT_TIMEOUT
        });
        this.callStatus.set(CallStatus.INITIATED);
    }

    /**
     * Accept an incoming call
     */
    notifyGroupCreated(conversationId: string, callerId: string): void {
        this.send(CallEvents.EVENT_GROUP_NOTIFICATION, <GroupNotificationEvent>{
            conversationId: conversationId,
            notificationType: NotificationEventType.GN_GROUP_CREATED,
            callerId: callerId
        });
    }

    /**
     * Accept an incoming call
     */
    acceptCall(conversationId: string, callerId: string): void {
        this.send(CallEvents.CALL_ACCEPT, <CallAcceptPayload>{
            conversationId: conversationId,
            callerId: callerId
        });
        this.hasIncomingCall.set(false);
        this.callStatus.set(CallStatus.ACCEPTED);
    }

    /**
     * Reject an incoming call
     */
    rejectCall(conversationId: string, callerId: string, reason?: string): void {
        this.send(CallEvents.CALL_REJECT, <CallRejectPayload>{
            conversationId: conversationId,
            callerId: callerId,
            reason: reason
        });
        this.hasIncomingCall.set(false);
        this.callStatus.set(CallStatus.REJECTED);
    }

    /**
     * Cancel an outgoing call before it's answered
     */
    cancelCall(conversationId: string, calleeIds: string[]): void {
        this.send(CallEvents.CALL_CANCEL, <CallCancelPayload>{
            conversationId: conversationId,
            calleeIds: calleeIds
        });
        this.callStatus.set(CallStatus.CANCELLED);
    }

    /**
     * Report call timeout (no answer)
     */
    timeoutCall(conversationId: string, callerId: string): void {
        this.send(CallEvents.CALL_TIMEOUT, <CallTimeoutPayload>{
            conversationId: conversationId,
            callerId: callerId
        });
        this.callStatus.set(CallStatus.TIMEOUT);
    }

    /**
     * End an ongoing call
     */
    endCall(reason?: string): void {
        this.send(CallEvents.CALL_END, <CallEndPayload>{
            conversationId: this.ws.currentConversationId(),
            reason: reason || CallEndReason.NORMAL
        });
        this.callStatus.set(CallStatus.ENDED);
    }

    /**
     * Accept a joining request (join an ongoing call)
     */
    acceptJoiningRequest(conversationId: string, callerId: string): void {
        this.send(CallEvents.CALL_ACCEPT, <CallAcceptPayload>{
            conversationId: conversationId,
            callerId: callerId
        });
        this.hasJoiningRequest.set(false);
        this.hasIncomingCall.set(false);
        this.callStatus.set(CallStatus.ACCEPTED);
    }

    /**
     * Dismiss/ignore a joining request
     */
    dismissJoiningRequest(conversationId: string, callerId: string, reason?: string): void {
        this.send(CallEvents.CALL_DISMISS, <CallDismissPayload>{
            conversationId: conversationId,
            callerId: callerId,
            reason: reason || CallEndReason.NORMAL
        });
        this.hasIncomingCall.set(false);
        this.hasJoiningRequest.set(false);
    }

    // =========================================================
    // Private Helper Methods
    // =========================================================

    /**
     * Generic send method using socket service
     */
    private send<T>(event: string, payload: T): void {
        this.ws.sendEvent(event, payload);
    }
}
