import { Injectable, signal } from '@angular/core';
import { filter, map, Observable, Subject, takeUntil } from 'rxjs';
import { User } from '../../models/model';
import { Conversation } from '../../components/global-search/search.models';

@Injectable({
    providedIn: 'root',
})
export class ConfeetSocketService {
    private ws: WebSocket | null = null;
    private messageSubject = new Subject<WsEvent>();

    // Exposed observables for each event type
    newMessage$: Observable<Message>;
    messageSent$: Observable<Message>;
    delivered$: Observable<MessageDelivered>;
    seen$: Observable<MessageSeen>;
    userTyping$: Observable<TypingIndicator>;
    error$: Observable<ErrorPayload>;
    pong$: Observable<PongPayload>;

    //--------------------------------------------------------------
    currentConversation = signal<Conversation | null>(null);
    currentConversationId = signal<string | null>(null);

    private reconnectInterval = 3000;
    private heartbeatInterval = 30000; // 30 seconds
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private senderId!: string;
    private url!: string;

    constructor() {
        // Setup filtered observables
        this.newMessage$ = this.onEvent<Message>(WsEvents.NEW_MESSAGE);
        this.messageSent$ = this.onEvent<Message>(WsEvents.MESSAGE_SENT);
        this.delivered$ = this.onEvent<MessageDelivered>(WsEvents.DELIVERED);
        this.seen$ = this.onEvent<MessageSeen>(WsEvents.SEEN);
        this.userTyping$ = this.onEvent<TypingIndicator>(WsEvents.USER_TYPING);
        this.error$ = this.onEvent<ErrorPayload>(WsEvents.ERROR);
        this.pong$ = this.onEvent<PongPayload>(WsEvents.PONG);
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
        };

        this.ws.onmessage = (event) => {
            this.messageSubject.next(JSON.parse(event.data));
        };

        this.ws.onerror = (error) => {
            console.error('WS error:', error);
        };

        this.ws.onclose = () => {
            console.warn('WS closed, reconnecting...');
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
    markSeen(id: string, userId: string, conversationId: string): void {
        this.send(WsEvents.MARK_SEEN, {
            id,
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
    body: string;
    fileUrl?: string | null;
    replyTo?: string | null;
    mentions: [];
    reactions: Array<Reactions>;
    clientType: 'web',
    createdAt?: Date,
    editedAt?: Date | null,
    status?: number;
    recievedId?: string;
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
    id: string;
    conversationId: string;
    seenBy: string;
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
    HEARTBEAT: 'heartbeat', // Client sends ping for heartbeat

    // Server -> Client
    NEW_MESSAGE: 'new_message',
    MESSAGE_SENT: 'message_sent',
    DELIVERED: 'delivered',
    SEEN: 'seen',
    USER_TYPING: 'user_typing',
    ERROR: 'error',
    PONG: 'pong' // Server responds with pong
} as const;