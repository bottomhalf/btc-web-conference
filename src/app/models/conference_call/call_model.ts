// ============================================
// Call Event Types - Client to Server
// ============================================
export const CallEvents = {
    // EventCallInitiate - Caller initiates a call to callee(s)
    CALL_INITIATE: 'call:initiate',

    // EventCallStarted - Either party joins an existing call
    CALL_STARTED: 'call:started',

    // EventCallAccept - Callee accepts the incoming call
    CALL_ACCEPT: 'call:accept',

    // EventCallReject - Callee rejects the incoming call
    CALL_REJECT: 'call:reject',

    // EventCallDismiss - Caller cancels before callee answers
    CALL_DISMISS: 'call:dismiss',

    // EventCallCancel - Caller cancels before callee answers
    CALL_CANCEL: 'call:cancel',

    // EventCallTimeout - Callee didn't answer within timeout period
    CALL_TIMEOUT: 'call:timeout',

    // EventCallEnd - Either party ends an ongoing call
    CALL_END: 'call:end',

    // EventJoiningRequest - Either party ends an ongoing call
    JOINING_REQUEST: 'call:raise-joining-request',

    // EventGroupNotification - Notify group members of call status changes
    EVENT_GROUP_NOTIFICATION: 'call:group-notification'
} as const;

// ============================================
// Call Event Types - Server to Client
// ============================================
export const CallServerEvents = {
    // EventCallIncoming - Notify callee of incoming call
    CALL_INCOMING: 'call:incoming',

    // EventCallJoiningRequest - Notify callee of joining request
    CALL_JOINING_REQUEST: 'call:joining_request',

    // EventCallJoiningRequest - Notify callee of joining request
    CALL_RAISED_REQUEST: 'call:raise-joining-request',

    // EventCallAccepted - Notify caller that callee accepted
    CALL_ACCEPTED: 'call:accepted',

    // EventCallRejected - Notify caller that callee rejected
    CALL_REJECTED: 'call:rejected',

    // EventCallDismissed - Notify caller that callee dismissed
    CALL_DISMISSED: 'call:dismissed',

    // EventCallCancelled - Notify callee that caller cancelled
    CALL_CANCELLED: 'call:cancelled',

    // EventCallTimedOut - Notify caller that call timed out (no answer)
    CALL_TIMED_OUT: 'call:timed_out',

    // EventCallEnded - Notify other party that call ended
    CALL_ENDED: 'call:ended',

    // EventCallBusy - Notify caller that callee is busy
    CALL_BUSY: 'call:busy',

    // EventCallError - Notify of call-related errors
    CALL_ERROR: 'call:error',

    // EventGroupNotification - Notify group members of call status changes
    CALL_GROUP_NOTIFICATION: 'call:group-notification'
} as const;

/** CallErrorEvent is sent when a call error occurs */
export const NotificationEventType = {
    GN_GROUP_CREATED: "group:created",
    GN_GROUP_DELETED: "group:deleted",
    GN_GROUP_RENAMED: "group:renamed",
    GN_GROUP_MEMBER_ADDED: "group:member_added"
} as const;


// ============================================
// Call Types
// ============================================
export const CallType = {
    AUDIO: 'audio',
    VIDEO: 'video'
} as const;

// ============================================
// Call Status Constants
// ============================================
export const ParticipantStatus = {
    RINGING: 1,
    ACCEPTED: 2,
    REJECTED: 3,
    TIMEOUT: 4,
    LEFT: 5,
    DIMISS: 6,
} as const;

// ============================================
// Call Status Constants
// ============================================
export const CallStatus = {
    INITIATED: 1,
    RINGING: 2,
    ACCEPTED: 3,
    REJECTED: 4,
    CANCELLED: 5,
    TIMEOUT: 6,
    ENDED: 7,
    BUSY: 8,
    FAILED: 9,
    MISSED: 10,
    JOINING_REQUEST: 11,
    DISMISSED: 12,
    RAISED_JOINING_REQUEST: 13
} as const;

// ============================================
// Call End Reasons
// ============================================
export const CallEndReason = {
    NORMAL: 'normal',         // Normal hangup
    BUSY: 'busy',             // Callee was busy
    TIMEOUT: 'timeout',       // No answer
    REJECTED: 'rejected',     // Callee rejected
    CANCELLED: 'cancelled',   // Caller cancelled
    ERROR: 'error',           // Technical error
    NO_NETWORK: 'no_network'  // Network issue
} as const;

// ============================================
// Call Configuration
// ============================================
export const CallConfig = {
    // DefaultCallTimeout is the default ring timeout in seconds
    DEFAULT_TIMEOUT: 40,

    // MaxCallTimeout is the maximum allowed ring timeout in seconds
    MAX_TIMEOUT: 120
} as const;

// ============================================
// Type Definitions for type-safety
// ============================================
export type CallEventType = typeof CallEvents[keyof typeof CallEvents];
export type CallServerEventType = typeof CallServerEvents[keyof typeof CallServerEvents];
export type CallTypeValue = typeof CallType[keyof typeof CallType];
export type CallStatusValue = typeof CallStatus[keyof typeof CallStatus];
export type CallEndReasonValue = typeof CallEndReason[keyof typeof CallEndReason];


// ============================================
// Call Model - Database/State Model
// ============================================

// /** Call represents a call session (can be stored in DB for call history) */
// export interface Call {
//     id?: string;                    // MongoDB ObjectID as string
//     conversationId: string;         // Associated conversation
//     callerId: string;               // User who initiated the call
//     calleeIds: string[];            // User(s) being called
//     callType: CallTypeValue;        // "audio" or "video"
//     status: CallStatusValue;        // Current call status
//     roomName?: string;              // LiveKit room name
//     startedAt?: Date;               // When call was accepted
//     endedAt?: Date;                 // When call ended
//     duration: number;               // Call duration in seconds
//     endReason?: CallEndReasonValue; // Why call ended
//     createdAt: Date;                // When call was initiated
//     updatedAt: Date;                // Last update time
// }

/** CallParticipant tracks individual participant status in a call */
export interface CallParticipant {
    userId: string;
    name: string; // Display name
    avatar: string; // Avatar URL
    email: string; // Email address
    status: CallStatusValue;        // Participant-specific status
    joinedAt?: Date;                // When they joined
    leftAt?: Date;                  // When they left
    endReason?: CallEndReasonValue; // Why they left
}


// ============================================
// WebSocket Event Payloads - Client to Server
// ============================================

/** CallInitiatePayload is sent by caller to initiate a call */
export interface CallInitiatePayload {
    conversationId: string;         // Conversation/room ID
    calleeIds: string[];            // User(s) to call
    callType: CallTypeValue;        // "audio" or "video"
    timeout?: number;               // Ring timeout in seconds (default 40)
}

/** CallAcceptPayload is sent by callee to accept a call */
export interface CallAcceptPayload {
    conversationId: string;
    callerId: string;
}

/** CallRejectPayload is sent by callee to reject a call */
export interface CallRejectPayload {
    conversationId: string;
    callerId: string;
    reason?: string;                // Optional rejection reason
}

/** CallDismissPayload is sent by caller to dismiss a call */
export interface CallDismissPayload {
    conversationId: string;
    callerId: string;
    reason?: string;                // Optional rejection reason
}

/** CallCancelPayload is sent by caller to cancel before answer */
export interface CallCancelPayload {
    conversationId: string;
    calleeIds: string[];
}

/** CallTimeoutPayload is sent by callee when ring timeout occurs */
export interface CallTimeoutPayload {
    conversationId: string;
    callerId: string;
}

/** CallEndPayload is sent to end an ongoing call */
export interface CallEndPayload {
    conversationId: string;
    reason?: string;
}


// ============================================
// WebSocket Event Payloads - Server to Client
// ============================================

/** CallIncomingEvent is sent to callee(s) when receiving a call */
export interface CallIncomingEvent {
    conversationId: string;
    callerId: string;
    callerName?: string;            // Display name
    callerAvatar?: string;          // Avatar URL
    callType: CallTypeValue;        // "audio" or "video"
    participants: Record<string, CallParticipant>;
    timeout: number;                // Seconds until timeout
    timestamp: number;              // Unix timestamp
}

/** GroupNotificationEvent is sent to group members when receiving a notification */
export interface GroupNotificationEvent {
    conversationId: string;
    notificationType: string; // "accept", "reject", "dismiss", "timeout"
    callerId: string;
}

/** CallAcceptedEvent is sent to caller when callee accepts */
export interface CallAcceptedEvent {
    conversationId: string;
    acceptedBy: string;             // UserID who accepted
    roomName: string;               // LiveKit room name
    token: string;                  // LiveKit access token for caller
    timestamp: number;
}

/** CallRejectedEvent is sent to caller when callee rejects */
export interface CallRejectedEvent {
    conversationId: string;
    rejectedBy: string;
    reason?: string;
    timestamp: number;
}

/** CallDismissedEvent is sent to caller when callee dismisses */
export interface CallDismissedEvent {
    callId: string;
    dismissedBy: string;
    reason?: string;
    timestamp: number;
}

/** CallCancelledEvent is sent to callee when caller cancels */
export interface CallCancelledEvent {
    conversationId: string;
    cancelledBy: string;
    timestamp: number;
}

/** CallTimedOutEvent is sent to caller when call times out */
export interface CallTimedOutEvent {
    conversationId: string;
    timestamp: number;
}

/** CallEndedEvent is sent when call ends */
export interface CallEndedEvent {
    conversationId: string;
    endedBy: string;
    reason: string;
    duration: number;               // Call duration in seconds
    timestamp: number;
}

/** CallBusyEvent is sent to caller when callee is busy */
export interface CallBusyEvent {
    conversationId: string;
    busyUser: string;
    timestamp: number;
}

/** CallErrorEvent is sent when a call error occurs */
export interface CallErrorEvent {
    conversationId: string;
    error: string;
    code?: string;
    timestamp: number;
}