import { Injectable, signal, computed } from '@angular/core';
import { ChatService } from '../../chat/chat.service';

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
    public activeConversationId = signal<string | null>(null);

    private initialized = false;

    constructor(
        private chatService: ChatService
    ) { }

    /**
     * Initialize global WebSocket event subscriptions.
     * Should be called once from LayoutComponent after socket connection.
     */
    initialize(): void {
        if (this.initialized) {
            console.warn('NotificationService already initialized');
            return;
        }

        this.chatService.handleSocketEvents();
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
     * Cleanup subscriptions and clear local state
     */
    destroy(): void {
        this.chatService.destroySocketSubscriptions();
        this.initialized = false;
        this.clearAllNotifications();
        this.unreadCounts.set(new Map());
        this.typingUsers.set(new Map());
        this.activeConversationId.set(null);
    }
}
