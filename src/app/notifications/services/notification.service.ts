import { Injectable, signal, computed } from '@angular/core';
import { Subscription } from 'rxjs';
import {
    ConfeetSocketService, Message, MessageDelivered,
    MessageSeen, TypingIndicator, ErrorPayload
}
    from '../../providers/socket/confeet-socket.service';

import { Conversation, Participant, LastMessage } from '../../components/global-search/search.models';
import { ChatService } from '../../chat/chat.service';
import { GetStatusName, User } from '../../models/model';
import { LocalService } from '../../providers/services/local.service';
import { ChatDbService } from '../../core/services/chat-db.service';

export interface AppNotification {
    id: string;
    type: 'message' | 'delivered' | 'seen' | 'typing' | 'error' | 'warning';
    title: string;
    content: string;
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
        private local: LocalService,
        private chatDb: ChatDbService
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
                msgs.map(x => x.messageId === message.messageId ? { ...x, status: message.status || 1, id: message.id } : x)
            );
            // Remove from IndexedDB once acknowledged by the server
            if (message.messageId) {
                this.chatDb.removePendingMessage(message.messageId);
            }
        } else {
            this.chatService.messages.update(msgs => [...msgs, message]);
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

        // New message received
        this.subscriptions.add(
            this.ws.initUserList$.subscribe(message => {
                console.log("initUserList", message);
                this.handleInitUserList(message);
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

        // Message reactions
        this.subscriptions.add(
            this.ws.messageReacted$.subscribe(event => {
                this.handleMessageReacted(event);
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

    private handleInitUserList(message: any) {
        let rawConversations: any[] = [];
        if (message && message.conversations && Array.isArray(message.conversations)) {
            rawConversations = message.conversations;
        } else if (Array.isArray(message)) {
            rawConversations = message;
        }

        if (rawConversations.length > 0 || (message && message.conversations)) {
            const mappedRooms: Conversation[] = (rawConversations || []).map((conv: any) => {
                const members = conv.members || [];
                const participants: Participant[] = members.map((m: any) => ({
                    userId: m.user_id || m.userId || '',
                    username: m.email || m.username || '',
                    firstName: m.first_name || m.firstName || '',
                    lastName: m.last_name || m.lastName || '',
                    email: m.email || '',
                    avatar: m.avatar || '',
                    joinedAt: null,
                    role: m.role || 'member',
                    status: GetStatusName(m.status),
                    lastSeen: m.last_seen || m.lastSeen || 0
                }));
                const participantIds = participants.map(p => p.userId);

                return {
                    id: conv.id || conv.conversation_id || conv.conversationId || '',
                    avatar: conv.avatar || '',
                    createdAt: null,
                    createdBy: '',
                    description: '',
                    lastMessageAt: conv.last_message_at ? new Date(conv.last_message_at) : null,
                    lastMessageId: conv.last_message ? (conv.last_message.messageId || '') : '',
                    memberCount: participants.length,
                    settings: null,
                    title: conv.title || conv.conversationName || '',
                    type: (conv.type || '').toUpperCase() === 'GROUP' ? 'GROUP' : 'DIRECT',
                    searchableMemberInfo: [],
                    participantIds: participantIds,
                    participants: participants,
                    deleted: false,

                    // Legacy fallback fields for backward compatibility
                    conversationId: conv.id || conv.conversation_id || conv.conversationId || '',
                    conversationType: (conv.type || '').toLowerCase() === 'group' ? 'group' : 'direct',
                    conversationName: conv.title || conv.conversationName || '',
                    conversationAvatar: conv.avatar || '',
                    lastMessage: conv.last_message || null,
                    isActive: true
                };
            });

            this.chatService.meetingRooms.set(mappedRooms);
        }

        let chatUsers: User[] = [];
        let users: User[] = [];
        let groups: User[] = [];
        if (message && message["conversation_users"]) {
            users = message["conversation_users"] as User[];
        }

        if (message && message["conversation_groups"]) {
            groups = message["conversation_groups"] as User[];
        }
    }

    private handleNewMessage(message: Message | string): void {
        if (typeof message === 'string') {
            try {
                const decoded = atob(message);
                message = JSON.parse(decoded) as Message;
            } catch (e) {
                console.error('Failed to decode/parse base64 message:', e);
                return;
            }
        }

        // Add to current chat view
        this.addMessageToActiveConversation(message);

        if (this.activeConversationId() !== message.conversationId) {
            // Increment unread count for this conversation
            this.unreadCounts.update(counts => {
                const newCounts = new Map(counts);
                const current = newCounts.get(message.conversationId) || 0;
                newCounts.set(message.conversationId, current + 1);
                return newCounts;
            });
            const senderName = (message as any).senderName;
            // Show notification
            this.showNotification({
                id: message.messageId,
                type: 'message',
                title: senderName,
                content: message.content,
                conversationId: message.conversationId,
                timestamp: new Date(),
                read: false
            });
        }

        // Update conversation's last message in the list
        this.updateConversationLastMessage(message);

        // Acknowledge message seen
        this.chatService.sendMarkedSeen(message);
    }

    private handleMessageSent(message: Message | string): void {
        if (typeof message === 'string') {
            try {
                const decoded = atob(message);
                message = JSON.parse(decoded) as Message;
            } catch (e) {
                console.error('Failed to decode/parse base64 message sent confirmation:', e);
                return;
            }
        }
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
        const msg = this.chatService.messages().find(m => m.messageId === seen.messageId);
        if (msg) {
            // Mark as seen in UI            
            this.chatService.messages.update(msgs =>
                msgs.map(x => {
                    if (x.messageId === seen.messageId) {
                        const seenByUserIds = x.seenByUserIds || [];
                        const updatedSeenByUserIds = seenByUserIds.includes(seen.userId) ? seenByUserIds : [...seenByUserIds, seen.userId];
                        return { ...x, status: 3, seenByUserIds: updatedSeenByUserIds };
                    }
                    return x;
                })
            );

            console.log('Message seen: ', seen.messageId);
        }
    }

    private handleMessageReacted(event: any): void {
        const payload = event && event.payload ? event.payload : event;
        if (!payload || !payload.messageId) return;
        this.chatService.messages.update(msgs =>
            msgs.map(m => (m.id === payload.messageId || (m as any).messageId === payload.messageId) ? { ...m, reactions: payload.reactions || [] } : m)
        );
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
            content: error.message,
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
                        content: message.content,
                        senderId: message.senderId,
                        sentAt: message.createdAt
                    }
                } : x)
            );
        }
    }

    showNotification(notification: AppNotification): void {
        // Add to notifications list
        this.notifications.update(notifs => [notification, ...notifs].slice(0, 50));

        // Show browser notification if permission granted
        if (Notification.permission === 'granted') {
            new Notification(notification.title, {
                body: notification.content,
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
