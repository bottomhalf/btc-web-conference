import { Injectable, signal } from '@angular/core';
import { filter, map, Observable, Subject, takeUntil, BehaviorSubject } from 'rxjs';
import { User } from '../../models/model';
import { Conversation } from '../../components/global-search/search.models';
import { environment } from '../../../environments/environment';

@Injectable({
    providedIn: 'root',
})
export class ConfeetSocketService {
    private ws: WebSocket | null = null;
    private messageSubject = new Subject<WsEvent>();
    private isConnectedSubject = new BehaviorSubject<boolean>(false);
    public isConnected$ = this.isConnectedSubject.asObservable();

    // Exposed observables for each event type
    incomingMessage$: Observable<Message>;
    outgoingMessage$: Observable<Message>;
    delivered$: Observable<MessageDelivered>;
    seen$: Observable<MessageSeen>;
    userTyping$: Observable<TypingIndicator>;
    error$: Observable<ErrorPayload>;
    pong$: Observable<PongPayload>;
    initUserList$: Observable<User[]>;
    messageReacted$: Observable<any>;
    userStatus$: Observable<any>;
    //--------------------------------------------------------------
    currentConversation = signal<Conversation | null>(null);
    currentConversationId = signal<string | null>(null);

    private reconnectInterval = 3000;
    private heartbeatInterval = environment.heartbeatInterval; // 30 seconds
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private senderId!: string;
    private url!: string;

    constructor() {
        // Setup filtered observables
        this.incomingMessage$ = this.onEvent<Message>(WsEvents.NEW_MESSAGE);
        this.outgoingMessage$ = this.onEvent<Message>(WsEvents.MESSAGE_SENT);
        this.delivered$ = this.onEvent<MessageDelivered>(WsEvents.DELIVERED);
        this.seen$ = this.onEvent<MessageSeen>(WsEvents.MARK_SEEN);
        this.userTyping$ = this.onEvent<TypingIndicator>(WsEvents.USER_TYPING);
        this.error$ = this.onEvent<ErrorPayload>(WsEvents.ERROR);
        this.pong$ = this.onEvent<PongPayload>(WsEvents.PONG);
        this.initUserList$ = this.onEvent<User[]>(WsEvents.INIT_USERLIST);
        this.messageReacted$ = this.onEvent<any>(WsEvents.MESSAGE_REACTED);
        this.userStatus$ = this.onEvent<any>(WsEvents.USER_STATUS);
        console.log(this.initUserList$)
    }

    connect(url: string, senderId: string) {
        this.url = url;
        this.senderId = senderId;

        if (this.ws) return;

        this.initSocket();
    }

    private initSocket() {
        console.log("Connecting to: " + this.url);
        this.ws = new WebSocket(`${this.url}?userId=${this.senderId}`);

        this.ws.onopen = () => {
            console.log('WS connected');
            this.sendPing(this.senderId);
            this.startHeartbeat(this.senderId);
            this.isConnectedSubject.next(true);
        };

        this.ws.onmessage = (event) => {
            this.messageSubject.next(JSON.parse(event.data));
        };

        this.ws.onerror = (error) => {
            console.error('WS error:', error);
        };

        this.ws.onclose = () => {
            console.warn('WS closed, reconnecting...');
            this.isConnectedSubject.next(false);
            this.stopHeartbeat();
            this.ws = null;

            setTimeout(() => this.initSocket(), this.reconnectInterval);
        };
    }

    // Generic event listener
    private onEvent<T>(eventType: string): Observable<T> {
        return this.messageSubject.pipe(
            filter(e => e.event === eventType),
            map(e => e.payload as T)
        );
    }

    // Send message
    sendMessage(message: Partial<Message>): void {
        this.send(WsEvents.SEND_MESSAGE, message);
    }

    // Send message reaction
    sendMessageReaction(payload: { messageId: string, conversationId: string, userId: number | string, emoji: string }): void {
        this.send(WsEvents.REACT_MESSAGE, payload);
    }

    // Send message
    getInitUser(): void {
        return this.send(WsEvents.INIT_USERLIST, {});
    }

    updateStatus(status: string): void {
        this.send(WsEvents.UPDATE_STATUS, { status });
    }

    // Mark as delivered
    markDelivered(id: string, userId: string, conversationId: string): void {
        this.send(WsEvents.MARK_DELIVERED, {
            id,
            conversationId,
            userId,
            deliveredAt: new Date().toISOString()
        });
    }

    // Mark as seen
    markSeen(messageId: string, userId: string, conversationId: string): void {
        this.send(WsEvents.MARK_SEEN, {
            messageId,
            conversationId,
            userId,
            seenAt: new Date().toISOString()
        });
    }

    // Send typing indicator
    sendTyping(conversationId: string, isTyping: boolean): void {
        this.send(WsEvents.TYPING, {
            conversationId,
            isTyping
        });
    }

    // Expose messageSubject for other services (like ServerEventService)
    getMessageSubject() {
        return this.messageSubject;
    }

    // Expose send method for other services
    sendEvent<T>(event: string, payload: T): void {
        this.send(event, payload);
    }

    // Generic send method
    private send<T>(event: string, payload: T): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            const wsEvent: WsEvent<T> = { event, payload };
            this.ws.send(JSON.stringify(wsEvent));
        }
    }

    disconnect(): void {
        this.stopHeartbeat();
        this.isConnectedSubject.next(false);
        this.ws?.close();
        this.ws = null;
    }

    // Heartbeat methods
    private startHeartbeat(userId: string): void {
        this.stopHeartbeat(); // Clear any existing timer
        console.log('Starting heartbeat with interval:', this.heartbeatInterval, 'ms');

        this.heartbeatTimer = setInterval(() => {
            this.sendPing(userId);
        }, this.heartbeatInterval);
    }

    private stopHeartbeat(): void {
        if (this.heartbeatTimer) {
            console.log('Stopping heartbeat');
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    private sendPing(userId: string): void {
        console.log('Sending heartbeat ping');
        this.send(WsEvents.HEARTBEAT, { userId });
    }
}


export interface Message {
    id?: string;
    messageId: string;
    conversationId: string;
    senderId: string;
    type: 'text' | 'audio' | 'video' | 'image' | 'file';
    content: string;
    fileUrl?: string | null;
    replyTo?: string | null;
    mentions: [];
    reactions: Array<Reactions>;
    clientType: 'web',
    createdAt?: Date,
    editedAt?: Date | null,
    status?: number;
    recievedId?: string;
    isMentioned?: boolean;
    seenByUserIds?: string[];
}

export interface Reactions {
    userId: string;
    emoji: string;
}

export interface MessageDelivered {
    id: string;
    conversationId: string;
    deliveredTo: string;
    deliveredAt: string;
}

export interface MessageSeen {
    messageId: string;
    conversationId: string;
    userId: string;
    seenAt: string;
}

export interface TypingIndicator {
    conversationId: string;
    userId: string;
    isTyping: boolean;
}

export interface WsEvent<T = any> {
    event: string;
    payload: T;
}

export interface ErrorPayload {
    code: number;
    message: string;
}

export interface PongPayload {
    timestamp: string;
}

// Event type constants (matching Go backend)
export const WsEvents = {
    // Client -> Server
    SEND_MESSAGE: 'send_message',
    MARK_DELIVERED: 'mark_delivered',
    MARK_SEEN: 'mark_seen',
    TYPING: 'typing',
    AUDIO_CALL_REQUEST: 'audio_call_request',
    REACT_MESSAGE: 'react_message',
    HEARTBEAT: 'heartbeat', // Client sends ping for heartbeat
    INIT_USERLIST: 'init_userlist',
    UPDATE_STATUS: 'update_status',

    // Server -> Client
    NEW_MESSAGE: 'new_message',
    MESSAGE_SENT: 'message_sent',
    MESSAGE_REACTED: 'message_reacted',
    DELIVERED: 'delivered',
    SEEN: 'mark_seen',
    USER_TYPING: 'user_typing',
    USER_STATUS: 'user_status',
    ERROR: 'error',
    PONG: 'pong' // Server responds with pong
} as const;