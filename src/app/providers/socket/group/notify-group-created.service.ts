import { Injectable } from '@angular/core';
import { ConfeetSocketService } from '../confeet-socket.service';
import { CallEvents, GroupNotificationEvent, NotificationEventType } from '../../../models/conference_call/call_model';

@Injectable({
    providedIn: 'root'
})
export class NotifyGroupCreatedService {
    constructor(
        private ws: ConfeetSocketService
    ) {}

    execute(conversationId: string, callerId: string): void {
        this.ws.sendEvent(CallEvents.EVENT_GROUP_NOTIFICATION, <GroupNotificationEvent>{
            conversationId: conversationId,
            notificationType: NotificationEventType.GN_GROUP_CREATED,
            callerId: callerId
        });
    }
}
