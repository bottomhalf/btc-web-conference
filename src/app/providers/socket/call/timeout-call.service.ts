import { Injectable } from '@angular/core';
import { ConfeetSocketService } from '../confeet-socket.service';
import { ServerEventService } from '../server-event.service';
import { CallEvents, CallStatus, CallTimeoutPayload } from '../../../models/conference_call/call_model';

@Injectable({
    providedIn: 'root'
})
export class TimeoutCallService {
    constructor(
        private ws: ConfeetSocketService,
        private serverEventService: ServerEventService
    ) {}

    execute(conversationId: string, callerId: string): void {
        this.ws.sendEvent(CallEvents.CALL_TIMEOUT, <CallTimeoutPayload>{
            conversationId: conversationId,
            callerId: callerId
        });
        this.serverEventService.callStatus.set(CallStatus.TIMEOUT);
    }
}
