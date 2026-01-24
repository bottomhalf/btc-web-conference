import { Injectable, signal, computed } from '@angular/core';
import { Subscription } from 'rxjs';
import {
    ConfeetSocketService, Message, MessageDelivered,
    MessageSeen, TypingIndicator, ErrorPayload
}
    from '../../providers/socket/confeet-socket.service';

import { LastMessage } from '../../components/global-search/search.models';
import { ChatService } from '../../chat/chat.service';
import { User } from '../../models/model';
import { LocalService } from '../../providers/services/local.service';

export interface AppNotification {
    id: string;
    type: 'message' | 'delivered' | 'seen' | 'typing' | 'error';
    title: string;
    body: string;
    conversationId: string;
    timestamp: Date;
    read: boolean;
}

@Injectable({
    providedIn: 'root'
})
export class NotificationService {
    // Global state signals
    public unreadCounts = signal<Map<string, number>>(new Map());
    public notifications = signal<AppNotification[]>([]);
    public typingUsers = signal<Map<string, boolean>>(new Map());

    // Computed signals
    public totalUnreadCount = computed(() => {
        let total = 0;
        this.unreadCounts().forEach(count => total += count);
        return total;
    });

    // Active conversation tracking (set by ChatComponent)
    private activeConversationId = signal<string | null>(null);

    private subscriptions = new Subscription();
    private initialized = false;
    private user: User = null;

    constructor(
        private ws: ConfeetSocketService,
        private chatService: ChatService,
        private local: LocalService
    ) {
        this.user = this.local.getUser();
    }

    /**
     * Initialize global WebSocket event subscriptions.
     * Should be called once from LayoutComponent after socket connection.
     */
    initialize(): void {
        if (this.initialized) {
            console.warn('NotificationService already initialized');
            return;
        }

        this.registerGlobalEvents();
        this.initialized = true;
        console.log('NotificationService initialized');
    }

    /**
     * Set the currently active conversation (when user opens a chat)
     */
    setActiveConversation(conversationId: string | null): void {
        this.activeConversationId.set(conversationId);

        // Clear unread count for this conversation
        if (conversationId) {
            this.markConversationRead(conversationId);
        }
    }

    /**
     * Mark all messages in a conversation as read
     */
    markConversationRead(conversationId: string): void {
        this.unreadCounts.update(counts => {
            const newCounts = new Map(counts);
            newCounts.delete(conversationId);
            return newCounts;
        });
    }

    /**
     * Add a new message to the active conversation's message list
     */
    addMessageToActiveConversation(message: Message): void {
        if (message.senderId === this.user.userId) {
            this.chatService.messages.update(msgs =>
                msgs.map(x => x.messageId === message.messageId ? { ...x, status: message.status } : x)
            );
        } else {
            this.chatService.messages.update(msgs => [...msgs, message]);
            // Auto mark as delivered
            this.ws.markDelivered(message.id!, this.user.userId, message.conversationId);
        }
    }

    /**
     * Register all WebSocket event subscriptions globally
     */
    private registerGlobalEvents(): void {
        // New message received
        this.subscriptions.add(
            this.ws.incomingMessage$.subscribe(message => {
                this.handleNewMessage(message);
            })
        );

        // Message sent confirmation
        this.subscriptions.add(
            this.ws.outgoingMessage$.subscribe(message => {
                this.handleMessageSent(message);
            })
        );

        // Delivery receipt
        this.subscriptions.add(
            this.ws.delivered$.subscribe(delivered => {
                this.handleDelivered(delivered);
            })
        );

        // Read receipt
        this.subscriptions.add(
            this.ws.seen$.subscribe(seen => {
                this.handleSeen(seen);
            })
        );

        // Typing indicator
        this.subscriptions.add(
            this.ws.userTyping$.subscribe(typing => {
                this.handleTyping(typing);
            })
        );

        // Error handling
        this.subscriptions.add(
            this.ws.error$.subscribe(error => {
                this.handleError(error);
            })
        );
    }

    private handleNewMessage(message: Message): void {
        const isActiveConversation = this.activeConversationId() === message.conversationId;

        if (isActiveConversation && this.chatService.isChatActive()) {
            // Add to current chat view
            this.addMessageToActiveConversation(message);
        } else {
            // Increment unread count for this conversation
            this.unreadCounts.update(counts => {
                const newCounts = new Map(counts);
                const current = newCounts.get(message.conversationId) || 0;
                newCounts.set(message.conversationId, current + 1);
                return newCounts;
            });

            // Show notification
            this.showNotification({
                id: message.messageId,
                type: 'message',
                title: 'New Message',
                body: message.body,
                conversationId: message.conversationId,
                timestamp: new Date(),
                read: false
            });
        }

        // Update conversation's last message in the list
        this.updateConversationLastMessage(message);
    }

    private handleMessageSent(message: Message): void {
        const isActiveConversation = this.activeConversationId() === message.conversationId;

        if (isActiveConversation && this.chatService.isChatActive()) {
            // Update local message with server-assigned id and timestamp
            this.addMessageToActiveConversation(message);
        }

        // Update conversation's last message
        this.updateConversationLastMessage(message);
    }

    private handleDelivered(delivered: MessageDelivered): void {
        // Update message status in active conversation
        const msg = this.chatService.messages().find(m => m.id === delivered.id);
        if (msg) {
            // Mark as delivered in UI
            console.log('Message delivered:', delivered.id);
            this.chatService.messages.update(msgs =>
                msgs.map(x => x.id === delivered.id ? { ...x, status: 2 } : x)
            );
        }
    }

    private handleSeen(seen: MessageSeen): void {
        // Update message status in active conversation
        const msg = this.chatService.messages().find(m => m.id === seen.id);
        if (msg) {
            // Mark as seen in UI
            console.log('Message seen:', seen.id);
            this.chatService.messages.update(msgs =>
                msgs.map(x => x.id === seen.id ? { ...x, status: 3 } : x)
            );
        }
    }

    private handleTyping(typing: TypingIndicator): void {
        this.typingUsers.update(users => {
            const newUsers = new Map(users);
            newUsers.set(typing.userId, typing.isTyping);
            return newUsers;
        });
    }

    private handleError(error: ErrorPayload): void {
        console.error('WebSocket error:', error.message);

        this.showNotification({
            id: crypto.randomUUID(),
            type: 'error',
            title: 'Connection Error',
            body: error.message,
            conversationId: '',
            timestamp: new Date(),
            read: false
        });
    }

    private updateConversationLastMessage(message: Message): void {
        const conversation = this.chatService.meetingRooms().find(x => x.id === message.conversationId);
        if (conversation) {
            this.chatService.meetingRooms.update(
                rooms => rooms.map(x => x.id === conversation.id ? {
                    ...x,
                    lastMessage: <LastMessage>{
                        messageId: message.messageId,
                        content: message.body,
                        senderId: message.senderId,
                        sentAt: message.createdAt
                    }
                } : x)
            );
        }
    }

    private showNotification(notification: AppNotification): void {
        // Add to notifications list
        this.notifications.update(notifs => [notification, ...notifs].slice(0, 50));

        // Show browser notification if permission granted
        if (Notification.permission === 'granted') {
            new Notification(notification.title, {
                body: notification.body,
                icon: '/assets/icons/notification-icon.png',
                tag: notification.id
            });
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission();
        }
    }

    /**
     * Clear a specific notification
     */
    clearNotification(notificationId: string): void {
        this.notifications.update(notifs =>
            notifs.filter(n => n.id !== notificationId)
        );
    }

    /**
     * Clear all notifications
     */
    clearAllNotifications(): void {
        this.notifications.set([]);
    }

    /**
     * Cleanup subscriptions (typically not needed for root service)
     */
    destroy(): void {
        this.subscriptions.unsubscribe();
        this.initialized = false;
    }
}
