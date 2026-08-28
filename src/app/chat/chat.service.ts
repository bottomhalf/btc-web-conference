import { Injectable, Injector, signal } from '@angular/core';
import { Subject, Subscription, filter, take } from 'rxjs';
import { Conversation, Participant, SearchResult, UserDetail } from '../components/global-search/search.models';
import { HttpService } from '../providers/services/http.service';
import {
    ConfeetSocketService, Message, MessageDelivered,
    MessageSeen, TypingIndicator, ErrorPayload
}
    from '../providers/socket/confeet-socket.service';
import { GetStatusName, ResponseModel, User } from '../models/model';
import { LocalService } from '../providers/services/local.service';
import { ChatDbService } from '../core/services/chat-db.service';
import { NotificationService } from '../notifications/services/notification.service';

@Injectable({
    providedIn: 'root'
})
export class ChatService {
    public openChat$ = new Subject<any>();

    // Signals for State Management
    public meetingRooms = signal<Conversation[]>([]);
    public messages = signal<Message[]>([]);
    public searchResults = signal<SearchResult[]>([]);
    public userSearchResults = signal<UserDetail[]>([]);
    public isLoading = signal<boolean>(false);
    public isMessagesLoading = signal<boolean>(false);
    public scrollAtBottom = signal<boolean>(false);
    public snackBarState = signal<boolean>(false);
    public snackbarMessageId = signal<string | null>(null);
    public snackbarConversationId = signal<string | null>(null);

    public toggleMessageSnackBar(flag: boolean) {
        this.snackBarState.set(flag);
    }

    public setSnackBarState(flag: boolean, messageId?: string, conversationId?: string) {
        this.snackBarState.set(flag);
        if (flag) {
            this.snackbarMessageId.set(messageId || null);
            this.snackbarConversationId.set(conversationId || null);
        } else {
            this.snackbarMessageId.set(null);
            this.snackbarConversationId.set(null);
        }
    }

    private _isChatActive = signal<boolean>(false);
    readonly isChatActive = this._isChatActive.asReadonly();
    private currentUserId: string = "";

    // Lazy NotificationService to avoid circular dependency
    private _notificationService: NotificationService | null = null;
    private get notifService(): NotificationService {
        if (!this._notificationService) {
            this._notificationService = this.injector.get(NotificationService);
        }
        return this._notificationService;
    }

    private socketSubscriptions = new Subscription();
    private processedMessageIds = new Set<string>();

    constructor(private http: HttpService,
        private ws: ConfeetSocketService,
        private local: LocalService,
        private chatDb: ChatDbService,
        private injector: Injector
    ) {
        const user = this.local.getUser();
        if (user) {
            this.currentUserId = user.userId;
        }
        this.startAutoRetryLoop();
    }

    private startAutoRetryLoop(): void {
        // Run every 5 seconds
        setInterval(async () => {
            if (!this.currentUserId) return;
            try {
                const pending = await this.chatDb.getAllPendingMessages();
                if (!pending || pending.length === 0) return;

                const now = Date.now();
                const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;

                for (const msg of pending) {
                    if (now - msg.timestamp > FIFTEEN_DAYS_MS) {
                        // Message expired (older than 15 days), remove from queue
                        console.warn(`Message ${msg.messageId} expired after 15 days of retries.`);
                        await this.chatDb.removePendingMessage(msg.messageId);
                    } else {
                        // Resend via WebSocket
                        this.ws.sendMessage(msg.payload);
                        await this.chatDb.incrementRetryCount(msg.messageId);
                    }
                }
            } catch (err) {
                console.error('Error in auto-retry loop:', err);
            }
        }, 30000);
    }

    setIsChatStatus(isActive: boolean, requestFrom: string = 'Auto') {
        console.log('[IsChatStatus changed from: ' + requestFrom + '] ------------------------: ', isActive);
        this._isChatActive.set(isActive);
    }

    // HTTP Methods
    async getMeetingRooms(): Promise<void> {
        this.isLoading.set(true);
        this.ws.isConnected$.pipe(
            filter(isConnected => isConnected),
            take(1)
        ).subscribe(() => {
            this.ws.getInitUser();
        });
        // const res = await this.http.get(`conversations/rooms?pageNumber=1&pageSize=20`);
        // if (res.isSuccess && res.responseBody) {
        //     this.meetingRooms.set(res.responseBody.data || []);
        // }
        this.isLoading.set(false);
    }

    async getPresignedUrl(payload: { fileName: string, contentType: string, conversationId: string }): Promise<any> {
        return this.http.post('storage/presigned-url', payload);
    }

    async startMultipartUpload(payload: { fileName: string, contentType: string, conversationId: string }): Promise<any> {
        return this.http.post('storage/multipart/start', payload);
    }

    updateUserStatus(userId: string, status: string): void {
        this.searchResults.update(results => {
            return results.map(res => {
                const parts = res.participants?.map(p => p.userId === userId ? { ...p, status: status } : p) || [];
                return { ...res, participants: parts as any };
            });
        });

        this.meetingRooms.update(rooms => {
            return rooms.map(room => {
                const parts = room.participants?.map(p => p.userId === userId ? { ...p, status: status } : p) || [];
                return { ...room, participants: parts as any };
            });
        });
    }

    async getMultipartPreSignedUrl(payload: { fileKey: string, uploadId: string, partNumber: number }): Promise<any> {
        return this.http.post('storage/multipart/url', payload);
    }

    async completeMultipartUpload(payload: { fileKey: string, uploadId: string, parts: { partNumber: number, eTag: string }[] }): Promise<any> {
        return this.http.post('storage/multipart/complete', payload);
    }

    async deleteFile(fileKey: string): Promise<any> {
        return this.http.delete(`storage/delete?fileKey=${encodeURIComponent(fileKey)}`);
    }

    async searchUsers(term: string): Promise<void> {
        if (!term) {
            this.searchResults.set([]);
            return;
        }
        this.isLoading.set(true);
        const res = await this.http.get(`search/typeahead?q=${term}&fs=y`);
        if (res.isSuccess) {
            this.filterSearchResults(res.responseBody['results']);
        }
        this.isLoading.set(false);
    }

    filterSearchResults(results: any): SearchResult[] {
        this.searchResults.set([]);
        if (!results || (!results['users'] && !results['conversations'])) return this.searchResults();

        if (results['users']) {
            this.searchResults.set((results['users'] as UserDetail[]).map(user => ({
                avatar: user.avatar,
                conversationId: user.id,
                email: user.email,
                userId: user.id,
                participants: [{
                    userId: user.id,
                    username: user.username,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email,
                    avatar: user.avatar,
                    joinedAt: null,
                    role: 'member',
                    status: (user.status || 'offline').toLowerCase()
                }],
                name: user.firstName + ' ' + user.lastName,
                type: 'user',
                designation: user.designation
            })));
        }

        if (results['conversations']) {
            let conversations = (results['conversations'] as Conversation[]).map(conversation => (<SearchResult>{
                avatar: conversation.avatar,
                conversationId: conversation.id,
                participants: conversation.participants,
                name: conversation.title,
                type: 'group',
                userId: null,
                designation: null
            }));

            this.searchResults.update((current) => [...current, ...conversations]);
        }

        return this.searchResults();
    }

    updateConversationLastMessage(message: any): void {
        const conversation = this.meetingRooms().find(x => x.id === message.conversationId);
        if (conversation) {
            const currentRooms = this.meetingRooms();
            const updatedRooms = currentRooms.map(x => x.id === conversation.id ? {
                ...x,
                lastMessageAt: message.createdAt ? new Date(message.createdAt) : new Date(),
                lastMessage: {
                    messageId: message.messageId,
                    content: message.content,
                    senderId: message.senderId,
                    senderName: message.senderName || '',
                    sentAt: message.createdAt ? new Date(message.createdAt) : new Date()
                }
            } : x);

            const sortedRooms = updatedRooms.sort((a, b) => {
                let timeA = Date.now();
                if (a.lastMessageAt) {
                    const dateA = new Date(a.lastMessageAt);
                    if (!isNaN(dateA.getTime())) {
                        timeA = dateA.getTime();
                    }
                }
                let timeB = 0;
                if (b.lastMessageAt) {
                    const dateB = new Date(b.lastMessageAt);
                    if (!isNaN(dateB.getTime())) {
                        timeB = dateB.getTime();
                    }
                }
                return timeB - timeA;
            });

            this.meetingRooms.set([...sortedRooms]);
        }
    }

    async getMessages(conversationId: string, page: number, limit: number, append: boolean = false): Promise<void> {
        if (page === 1 || !append) {
            this.isMessagesLoading.set(true);
        }
        try {
            // isLoading not set here to avoid flickering entire chat on pagination
            const res = await this.http.get(`messages/get?id=${conversationId ?? ''}&page=${page}&limit=${limit}`);
            if (res.isSuccess && res.responseBody && res.responseBody.searchResult.messages) {
                var messages = res.responseBody.searchResult.messages;
                for (let i = 0; i < messages.length; i++) {
                    messages[i].isMentioned = this.isMentioned(messages[i]);
                    messages[i].status = messages[i].status || 1;
                }

                // Get local pending messages for this conversation
                const allPending = await this.chatDb.getAllPendingMessages();
                const conversationPending = allPending
                    .filter(p => p.roomId === conversationId)
                    .map(p => p.payload)
                    .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

                messages.reverse();

                if (append) {
                    if (page > 1) {
                        this.messages.update(current => [...messages, ...current]);
                    } else {
                        this.messages.set([...messages, ...conversationPending]);
                    }
                } else {
                    this.messages.set([...messages, ...conversationPending]);
                }
            }
        } finally {
            if (page === 1 || !append) {
                this.isMessagesLoading.set(false);
            }
        }
    }

    private isMentioned(msg: any): boolean {
        if (!msg || !msg.content || msg.senderId === this.currentUserId) return false;
        if (msg.mentions && Array.isArray(msg.mentions) && msg.mentions.length > 0) {
            if (msg.mentions.some((m: any) => m === this.currentUserId || m.userId === this.currentUserId)) {
                return true;
            }
        }
        // if (this.user && this.user.firstName && msg.content.toLowerCase().includes(this.user.firstName.toLowerCase())) {
        //   return true;
        // }
        return false;
    }

    async createConversation(userId: string, conversation: Conversation): Promise<ResponseModel> {
        const res = await this.http.post(`conversations/create/${userId}`, conversation);
        // If successful, we might want to refresh meeting rooms or add this one
        if (res.isSuccess) {
            this.getMeetingRooms();
        }
        return res; // Keep return for Component to know ID of new chat
    }

    async createGroupConversation(userId: string, createGroupRequest: any): Promise<ResponseModel> {
        const res = await this.http.post(`conversations/build-group/${userId}`, createGroupRequest);
        // If successful, we might want to refresh meeting rooms or add this one
        if (res.isSuccess) {
            this.getMeetingRooms();
        }
        return res; // Keep return for Component to know ID of new chat
    }

    async addMembersToGroup(conversationId: string, addedBy: string, userIds: string[]) {
        try {
            const url = `conversations/add-members/${conversationId}?addedBy=${addedBy}`;
            const res: any = await this.http.post(url, userIds);
            return res;
        } catch (error) {
            console.error('Error adding members:', error);
            throw error;
        }
    }

    // Helper Methods
    getConversationName(conversation: Conversation, currentUserId: string): string {
        if (!conversation) return 'Unknown';
        if (conversation.type?.toLowerCase() === 'group') {
            return conversation.title || 'Group';
        } else {
            let participants = (conversation.participants || []).filter((x) => x && x.userId != currentUserId);
            if (participants.length == 0) return conversation.title || 'Unknown';

            if (participants.length == 1) {
                const name = ((participants[0].firstName || '') + ' ' + (participants[0].lastName || '')).trim();
                return name || conversation.title || 'Unknown';
            } else if (participants.length > 2) {
                return (participants[0].firstName || '') + ' and ' + (participants[1].firstName || '');
            } else {
                return (participants[0].firstName || '') + ', ' + (participants[1].firstName || '') + ' +' + `${participants.length - 2}`;
            }
        }
    }

    getCurrentInitiaLetter(conversation: Conversation, currentUserId: string): string {
        if (!conversation) return '';
        if (conversation.type?.toLowerCase() === 'group') {
            return this.getUserInitiaLetter(conversation.title || 'GRP', '');
        }

        let participants = (conversation.participants || []).filter((x) => x && x.userId != currentUserId);
        if (participants.length == 0) return this.getUserInitiaLetter(conversation.title || '', '');

        if (participants.length == 1) {
            return this.getUserInitiaLetter(participants[0].firstName || '', participants[0].lastName || '');
        } else {
            return this.getUserInitiaLetter(conversation.title || 'GRP', '');
        }
    }

    getUserInitiaLetter(fname: string, lname: string): string {
        var name = fname + ' ' + (lname != null && lname != '' ? lname : '');
        if (!name) return '';

        const words = name.split(' ').slice(0, 2);
        const initials = words
            .map((x) => {
                if (x.length > 0) {
                    return x.charAt(0).toUpperCase();
                }
                return '';
            })
            .join('');

        return initials;
    }

    getColorFromName(fname: string, lname: string): string {
        var name = fname + ' ' + (lname != null && lname != '' ? lname : '');
        // Predefined color palette (Google Meet style soft colors)
        const colors = [
            '#f28b829f',
            '#FDD663',
            '#81C995',
            '#AECBFA',
            '#D7AEFB',
            '#FFB300',
            '#34A853',
            '#4285F4',
            '#FBBC05',
            '#ff8075ff',
            '#9AA0A6',
            '#F6C7B6',
        ];

        // Create hash from name
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }

        // Pick color based on hash
        const index = Math.abs(hash) % colors.length;
        return colors[index];
    }

    async userAutocompleteSerach(term: string): Promise<SearchResult[]> {
        if (!term) {
            this.searchResults.set([]);
            return [];
        }
        this.isLoading.set(true);
        const res = await this.http.get(`users/search?term=${term}&pageNumber=1&pageSize=30`);
        let results: SearchResult[] = [];
        if (res.isSuccess && res.responseBody && res.responseBody.data) {
            results = (res.responseBody.data as any[]).map(user => ({
                avatar: user.avatar || '',
                conversationId: user.id || user.userId || '',
                participants: [{
                    userId: user.userId || user.id || '',
                    username: user.username || user.email || '',
                    firstName: user.firstName || '',
                    lastName: user.lastName || '',
                    email: user.email || '',
                    avatar: user.avatar || '',
                    joinedAt: null,
                    role: 'member',
                    status: (user.status || 'offline').toLowerCase()
                }],
                name: user.name || ((user.firstName || '') + ' ' + (user.lastName || '')).trim() || user.email || 'Unknown',
                type: 'user',
                userId: user.userId || user.id || '',
                designation: user.designation || user.email || 'Member'
            }));
            this.searchResults.set(results);
        } else {
            this.searchResults.set([]);
        }
        this.isLoading.set(false);
        return results;
    }

    sendMarkedSeen(messageId: string, conversationId: string) {
        this.ws.markSeen(messageId, this.currentUserId, conversationId);
        this.snackbarMessageId.set(null);
        this.snackbarConversationId.set(null);
    }

    clearSessionData(): void {
        this.messages.set([]);
        this.meetingRooms.set([]);
        this.searchResults.set([]);
        this.userSearchResults.set([]);
    }

    // ==========================================
    // Socket Event Handling
    // ==========================================

    /**
     * Register all WebSocket event subscriptions
     */
    handleSocketEvents(): void {
        // New message received
        this.socketSubscriptions.add(
            this.ws.incomingMessage$.subscribe(message => {
                this.handleNewMessage(message);
            })
        );

        // Init user list received
        this.socketSubscriptions.add(
            this.ws.initUserList$.subscribe(message => {
                console.log("initUserList", message);
                this.handleInitUserList(message);
            })
        );

        // Message sent confirmation
        this.socketSubscriptions.add(
            this.ws.outgoingMessage$.subscribe(message => {
                this.handleMessageSent(message);
            })
        );

        // Delivery receipt
        this.socketSubscriptions.add(
            this.ws.delivered$.subscribe(delivered => {
                this.handleDelivered(delivered);
            })
        );

        // Read receipt
        this.socketSubscriptions.add(
            this.ws.seen$.subscribe(seen => {
                this.handleSeen(seen);
            })
        );

        // Message reactions
        this.socketSubscriptions.add(
            this.ws.messageReacted$.subscribe(event => {
                this.handleMessageReacted(event);
            })
        );

        // Typing indicator
        this.socketSubscriptions.add(
            this.ws.userTyping$.subscribe(typing => {
                this.handleTyping(typing);
            })
        );

        // Error handling
        this.socketSubscriptions.add(
            this.ws.error$.subscribe(error => {
                this.handleError(error);
            })
        );
    }

    /**
     * Add a new message to the active conversation's message list
     */
    private updateMessageState(message: Message): boolean {
        if (message.senderId === this.currentUserId) {
            if (this.notifService.activeConversationId() === message.conversationId) {
                this.messages.update(msgs =>
                    msgs.map(x => x.messageId === message.messageId ? { ...x, status: message.status || 1, id: message.id } : x)
                );
            }
            // Remove from IndexedDB once acknowledged by the server
            if (message.messageId) {
                this.chatDb.removePendingMessage(message.messageId);
            }
            return true;
        } else {
            if (this.notifService.activeConversationId() === message.conversationId) {
                this.messages.update(msgs => [...msgs, message]);
            }
            return false;
        }
    }

    private handleInitUserList(message: any) {
        let rawConversations: any[] = [];
        if (message && message.conversations && Array.isArray(message.conversations)) {
            rawConversations = message.conversations;
        } else if (Array.isArray(message)) {
            rawConversations = message;
        }

        rawConversations.sort((a, b) => {
            const timeA = a.last_message_at ? Number(a.last_message_at) : 0;
            const timeB = b.last_message_at ? Number(b.last_message_at) : 0;
            return timeB - timeA;
        });

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

            this.meetingRooms.set(mappedRooms);
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

        if (message.messageId) {
            if (this.processedMessageIds.has(message.messageId)) {
                return;
            }
            this.processedMessageIds.add(message.messageId);

            if (this.processedMessageIds.size > 1000) {
                const iterator = this.processedMessageIds.values();
                for (let i = 0; i < 500; i++) {
                    this.processedMessageIds.delete(iterator.next().value);
                }
            }
        }

        // Add to current chat view && remove from pending messages if it's a sent message
        // If the message is from the current user, update its state and return early
        if (this.updateMessageState(message)) return;

        if (this.notifService.activeConversationId() !== message.conversationId) {
            // Increment unread count for this conversation
            this.notifService.unreadCounts.update(counts => {
                const newCounts = new Map(counts);
                const current = newCounts.get(message.conversationId) || 0;
                newCounts.set(message.conversationId, current + 1);
                return newCounts;
            });
            const senderName = (message as any).senderName;
            // Show notification
            this.notifService.showNotification({
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
        if (this.scrollAtBottom()) {
            this.sendMarkedSeen(message.messageId, message.conversationId);
        } else {
            this.setSnackBarState(true, message.messageId, message.conversationId);
        }
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
        
        // Always update message state to ensure it is removed from the pending queue.
        // updateMessageState will internally handle checking the activeConversationId for UI updates.
        this.updateMessageState(message);

        // Update conversation's last message
        this.updateConversationLastMessage(message);
    }

    private handleDelivered(delivered: MessageDelivered): void {
        // Update message status in active conversation
        const msg = this.messages().find(m => m.id === delivered.id);
        if (msg) {
            // Mark as delivered in UI
            console.log('Message delivered:', delivered.id);
            this.messages.update(msgs =>
                msgs.map(x => x.id === delivered.id ? { ...x, status: 2 } : x)
            );
        }
    }

    private handleSeen(seen: MessageSeen): void {
        // Update message status in active conversation
        const msg = this.messages().find(m => m.messageId === seen.messageId);
        if (msg) {
            // Mark as seen in UI            
            this.messages.update(msgs =>
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
        this.messages.update(msgs =>
            msgs.map(m => (m.id === payload.messageId || (m as any).messageId === payload.messageId) ? { ...m, reactions: payload.reactions || [] } : m)
        );
    }

    private handleTyping(typing: TypingIndicator): void {
        this.notifService.typingUsers.update(users => {
            const newUsers = new Map(users);
            newUsers.set(typing.userId, typing.isTyping);
            return newUsers;
        });
    }

    private handleError(error: ErrorPayload): void {
        console.error('WebSocket error:', error.message);

        this.notifService.showNotification({
            id: crypto.randomUUID(),
            type: 'error',
            title: 'Connection Error',
            content: error.message,
            conversationId: '',
            timestamp: new Date(),
            read: false
        });
    }

    /**
     * Cleanup socket subscriptions
     */
    destroySocketSubscriptions(): void {
        this.socketSubscriptions.unsubscribe();
        this.socketSubscriptions = new Subscription();
    }
}
