import { Injectable } from '@angular/core';
import { ConfeetSocketService } from '../confeet-socket.service';
import { ServerEventService } from '../server-event.service';
import { CallEvents, CallEndReason, CallDismissPayload } from '../../../models/conference_call/call_model';

@Injectable({
    providedIn: 'root'
})
export class DismissJoiningRequestService {
    constructor(
        private ws: ConfeetSocketService,
        private serverEventService: ServerEventService
    ) {}

    execute(conversationId: string, callerId: string, reason?: string): void {
        this.ws.sendEvent(CallEvents.CALL_DISMISS, <CallDismissPayload>{
            conversationId: conversationId,
            callerId: callerId,
            reason: reason || CallEndReason.NORMAL
        });
        this.serverEventService.hasIncomingCall.set(false);
        this.serverEventService.hasJoiningRequest.set(false);
    }
}
