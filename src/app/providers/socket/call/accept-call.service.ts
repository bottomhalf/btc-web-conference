import { Injectable } from '@angular/core';
import { ConfeetSocketService } from '../confeet-socket.service';
import { ServerEventService } from '../server-event.service';
import { CallEvents, CallStatus, CallAcceptPayload } from '../../../models/conference_call/call_model';

@Injectable({
    providedIn: 'root'
})
export class AcceptCallService {
    constructor(
        private ws: ConfeetSocketService,
        private serverEventService: ServerEventService
    ) {}

    execute(conversationId: string, callerId: string): void {
        this.ws.sendEvent(CallEvents.CALL_ACCEPT, <CallAcceptPayload>{
            conversationId: conversationId,
            callerId: callerId
        });
        this.serverEventService.hasIncomingCall.set(false);
        this.serverEventService.callStatus.set(CallStatus.ACCEPTED);
    }
}
