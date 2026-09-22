import { Injectable } from '@angular/core';
import { ConfeetSocketService } from '../../confeet-socket.service';
import { ServerEventService } from '../../server-events/server-event.service';
import { CallEvents, CallType, CallConfig, CallStatus, CallInitiatePayload, CallEndReason } from '../../../../models/conference_call/call_model';
import { LocalService } from '../../../services/local.service';
import { TimeoutCallService } from './timeout-call.service';
import { EndCallService } from './end-call.service';
import { NotificationService } from '../../../../notifications/services/notification.service';

@Injectable({
    providedIn: 'root'
})
export class InitiateAudioCallService {
    constructor(
        private ws: ConfeetSocketService,
        private serverEventService: ServerEventService,
        private local: LocalService,
        private timeoutCallService: TimeoutCallService,
        private endCallService: EndCallService,
        private notificationService: NotificationService
    ) { }

    execute(calleeIds: string | string[], conversationId: string, isDirectCall: boolean = false): void {
        const ids = Array.isArray(calleeIds) ? calleeIds : [calleeIds];
        const user = this.local.getUser();
        const callerId = user?.userId || '';

        this.ws.sendEvent(CallEvents.CALL_INITIATE, <CallInitiatePayload>{
            conversationId: conversationId,
            senderId: callerId,
            receiverId: '',
            calleeIds: ids,
            isGroup: !isDirectCall,
            callType: CallType.AUDIO,
            timeout: CallConfig.DEFAULT_TIMEOUT
        });
        this.serverEventService.callStatus.set(CallStatus.INITIATED);

        // Start 120s ring timeout
        setTimeout(() => {
            // Check if call is still ringing/initiated (hasn't been accepted/rejected/ended)
            if (this.serverEventService.callStatus() === CallStatus.INITIATED || this.serverEventService.callStatus() === CallStatus.RINGING) {
                // Time's up! No one answered.

                // Notify the server/callee to stop ringing
                // Note: For multiple callees, this just sends to the room or first callee
                const targetId = ids.length > 0 ? ids[0] : '';
                this.timeoutCallService.execute(conversationId, targetId);

                if (isDirectCall || ids.length === 1) {
                    // For direct calls, disconnect the caller as requested
                    this.notificationService.showNotification({
                        id: crypto.randomUUID(),
                        type: 'warning',
                        title: 'No Answer',
                        content: 'The user did not respond in 2 minutes. Disconnecting call.',
                        conversationId: '',
                        timestamp: new Date(),
                        read: false
                    });
                    this.endCallService.execute(CallEndReason.TIMEOUT);
                } else {
                    // For group calls, just show a message but keep caller in the room
                    this.notificationService.showNotification({
                        id: crypto.randomUUID(),
                        type: 'warning',
                        title: 'No Answer',
                        content: 'One or more users did not respond.',
                        conversationId: '',
                        timestamp: new Date(),
                        read: false
                    });
                }
            }
        }, 120 * 1000); // 120 seconds
    }
}
