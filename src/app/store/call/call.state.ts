import {
    CallIncomingEvent,
    CallParticipant,
    CallStatusValue,
    GroupNotificationEvent,
} from '../../models/conference_call/call_model';

/**
 * CallState defines the shape of the entire call-related state.
 * All fields are managed exclusively by CallStore.
 */
export interface CallState {
    /** Current call status (ringing, accepted, ended, etc.) */
    callStatus: CallStatusValue | null;

    /** Participants currently in the call room */
    participantsInRoom: CallParticipant[];

    /** Whether this user has an incoming call alert showing */
    hasIncomingCall: boolean;

    /** Whether this user has a joining request alert showing */
    hasJoiningRequest: boolean;

    /** Full details of the incoming call / joining request */
    incomingCall: CallIncomingEvent | null;

    /** Latest group notification received */
    groupNotification: GroupNotificationEvent | null;
}

/** The initial (clean) state applied on app start and after reset */
export const initialCallState: CallState = {
    callStatus: null,
    participantsInRoom: [],
    hasIncomingCall: false,
    hasJoiningRequest: false,
    incomingCall: null,
    groupNotification: null,
};
