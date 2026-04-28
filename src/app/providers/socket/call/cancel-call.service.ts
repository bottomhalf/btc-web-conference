import { Injectable } from '@angular/core';
import { ConfeetSocketService } from '../confeet-socket.service';
import { ServerEventService } from '../server-event.service';
import { CallEvents, CallStatus, CallCancelPayload } from '../../../models/conference_call/call_model';

@Injectable({
    providedIn: 'root'
})
export class CancelCallService {
    constructor(
        private ws: ConfeetSocketService,
        private serverEventService: ServerEventService
    ) {}

    execute(conversationId: string, calleeIds: string[]): void {
        this.ws.sendEvent(CallEvents.CALL_CANCEL, <CallCancelPayload>{
            conversationId: conversationId,
            calleeIds: calleeIds
        });
        this.serverEventService.callStatus.set(CallStatus.CANCELLED);
    }
}
