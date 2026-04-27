import { Injectable } from '@angular/core';
import { ConfeetSocketService } from '../confeet-socket.service';
import { ServerEventService } from '../server-event.service';
import { CallEvents, CallType, CallConfig, CallStatus, CallInitiatePayload } from '../../../models/conference_call/call_model';

@Injectable({
    providedIn: 'root'
})
export class InitiateVideoJoiningRequestService {
    constructor(
        private ws: ConfeetSocketService,
        private serverEventService: ServerEventService
    ) {}

    execute(calleeId: string, conversationId: string): void {
        this.ws.sendEvent(CallEvents.JOINING_REQUEST, <CallInitiatePayload>{
            callId: crypto.randomUUID(),
            conversationId: conversationId,
            calleeIds: [calleeId],
            callType: CallType.VIDEO,
            timeout: CallConfig.DEFAULT_TIMEOUT
        });
        this.serverEventService.callStatus.set(CallStatus.INITIATED);
    }
}
