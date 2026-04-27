import { Injectable } from '@angular/core';
import { ConfeetSocketService } from '../confeet-socket.service';
import { ServerEventService } from '../server-event.service';
import { CallEvents, CallConfig, CallStatus, CallInitiatePayload, CallTypeValue } from '../../../models/conference_call/call_model';

@Injectable({
    providedIn: 'root'
})
export class InitiateGroupCallService {
    constructor(
        private ws: ConfeetSocketService,
        private serverEventService: ServerEventService
    ) {}

    execute(calleeIds: string[], conversationId: string, callType: CallTypeValue): void {
        this.ws.sendEvent(CallEvents.CALL_INITIATE, <CallInitiatePayload>{
            callId: crypto.randomUUID(),
            conversationId: conversationId,
            calleeIds: calleeIds,
            callType: callType,
            timeout: CallConfig.DEFAULT_TIMEOUT
        });
        this.serverEventService.callStatus.set(CallStatus.INITIATED);
    }
}
