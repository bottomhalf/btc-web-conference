import { Injectable } from '@angular/core';
import { ConfeetSocketService } from '../confeet-socket.service';
import { ServerEventService } from '../server-event.service';
import { CallEvents, CallStatus, CallTimeoutPayload } from '../../../models/conference_call/call_model';

@Injectable({
    providedIn: 'root'
})
export class TestSignalService {
    constructor(
        private ws: ConfeetSocketService
    ) { }

    execute(): void {
        this.ws.sendEvent(CallEvents.CALL_TEST_SIGNAL, {});
    }
}
