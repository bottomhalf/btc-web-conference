import { Injectable } from '@angular/core';
import { ConfeetSocketService } from '../confeet-socket.service';
import { ServerEventService } from '../server-event.service';
import { CallEvents, CallStatus, CallRejectPayload } from '../../../models/conference_call/call_model';

@Injectable({
    providedIn: 'root'
})
export class RejectCallService {
    constructor(
        private ws: ConfeetSocketService,
        private serverEventService: ServerEventService
    ) {}

    execute(conversationId: string, callerId: string, reason?: string): void {
        this.ws.sendEvent(CallEvents.CALL_REJECT, <CallRejectPayload>{
            conversationId: conversationId,
            callerId: callerId,
            reason: reason
        });
        this.serverEventService.hasIncomingCall.set(false);
        this.serverEventService.callStatus.set(CallStatus.REJECTED);
    }
}
