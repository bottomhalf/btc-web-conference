import { Injectable } from '@angular/core';
import { ConfeetSocketService } from '../confeet-socket.service';
import { ServerEventService } from '../server-event.service';
import { CallEvents, CallStatus, CallEndReason, CallEndPayload } from '../../../models/conference_call/call_model';

@Injectable({
    providedIn: 'root'
})
export class EndCallService {
    constructor(
        private ws: ConfeetSocketService,
        private serverEventService: ServerEventService
    ) {}

    execute(reason?: string): void {
        this.ws.sendEvent(CallEvents.CALL_END, <CallEndPayload>{
            conversationId: this.ws.currentConversationId(),
            reason: reason || CallEndReason.NORMAL
        });
        this.serverEventService.callStatus.set(CallStatus.ENDED);
    }
}
