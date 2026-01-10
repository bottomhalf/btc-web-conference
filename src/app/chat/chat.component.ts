import { Component, DestroyRef, effect, ElementRef, inject, OnDestroy, OnInit, signal, ViewChild, AfterViewChecked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { LocalService } from '../providers/services/local.service';
import { ConfeetSocketService, Message } from '../providers/socket/confeet-socket.service';
import { Subscription } from 'rxjs';
import { Conversation, Participant, SearchResult, UserDetail } from '../components/global-search/search.models';
import { ChatService } from './chat.service';
import { Router } from '@angular/router';
import { User } from '../models/model';
import { ClientEventService } from '../providers/socket/client-event.service';
import { NotificationService } from '../notifications/services/notification.service';
import { CallType } from '../models/conference_call/call_model';

@Component({
    selector: 'app-chat',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './chat.component.html',
    styleUrl: './chat.component.css',
})
export class ChatComponent implements OnInit, AfterViewChecked, OnDestroy {
    @ViewChild('messagesContainer') private messagesContainer!: ElementRef;

    // Local state managed by signals in service
    // meetingRooms and searchResults delegated to service
    isPageReady: boolean = false;
    today: Date = new Date();
    message: any = signal<string | null>('');
    // messages delegated to service
    pageIndex: number = 1;
    recieverId?: string = null;
    filterModal: FilterModal = { pageIndex: 1, pageSize: 20, searchString: '1=1' };
    conn: any = null;
    user: User = {
        isMicOn: false,
        isCameraOn: false,
    };

    searchQuery: string = '';
    // searchResults delegated to service
    isSearching: boolean = false;

    // Members dropdown state
    showMembersDropdown: boolean = false;
    showCreateGroupInput: boolean = false;
    newGroupName: string = '';
    newGroupMembers: SearchResult[] = [];
    memberSearchQuery: string = '';
    memberSearchResults: SearchResult[] = [];
    memberSearchSelectedIndex: number = -1;

    // typingUsers now comes from NotificationService
    private subscriptions = new Subscription();
    private shouldScrollToBottom = false;
    private shouldPreserveScrollPosition = false;
    private previousScrollHeight = 0;

    currentUserId: string = "";

    readonly destroyRef = inject(DestroyRef);

    constructor(
        private local: LocalService,
        private ws: ConfeetSocketService,
        public chatService: ChatService,
        private router: Router,
        public notificationService: NotificationService,
        private clientEventService: ClientEventService
    ) {
        // React to new messages by scrolling to bottom
        effect(() => {
            const messages = this.chatService.messages();
            if (messages.length > 0 && this.pageIndex === 1) {
                this.shouldScrollToBottom = true;
            }
        });
    }

    ngAfterViewChecked() {
        if (this.shouldScrollToBottom) {
            this.scrollToBottom();
            this.shouldScrollToBottom = false;
        }

        // Preserve scroll position when older messages are prepended
        if (this.shouldPreserveScrollPosition && this.messagesContainer) {
            const container = this.messagesContainer.nativeElement;
            const newScrollHeight = container.scrollHeight;
            const scrollDiff = newScrollHeight - this.previousScrollHeight;
            container.scrollTop = scrollDiff;
            this.shouldPreserveScrollPosition = false;
        }
    }

    ngOnInit() {
        this.user = this.local.getUser();
        this.currentUserId = this.user.userId;

        // Listen for global search selections
        this.subscriptions.add(
            this.chatService.openChat$.subscribe((user: any) => {
                this.startConversation(user);
            })
        );

        this.getConversations();

        var navigation = this.router.getCurrentNavigation();
        if (navigation?.extras.state?.['channel']) {
            this.startConversation(navigation?.extras.state['channel']);
        } else if (navigation?.extras.state?.['id']) {
            const conversationId = navigation?.extras.state['id'];
        }

        this.isPageReady = true;
    }

    // Get typingUsers from NotificationService
    get typingUsers(): Map<string, boolean> {
        return this.notificationService.typingUsers();
    }

    getConversations() {
        this.chatService.getMeetingRooms();
        // State handling for navigation is tricker without the direct promise return
        // We can check the signal effect or assume it loads.
        // For the navigation state check, we can check the signal value immediately if loaded, 
        // or effectively we should move this logic to a computed or effect, or just check after a small delay if strict async is needed.
        // However, since getMeetingRooms awaits, we can just await if we make this async, or use .then() on the void promise if we want.
        // But better pattern:
        // Just call it.
    }

    getCurrentInitiaLetter(conversation: Conversation): string {
        return this.chatService.getCurrentInitiaLetter(conversation, this.currentUserId);
    }

    getConversationName(conversation: Conversation): string {
        return this.chatService.getConversationName(conversation, this.currentUserId);
    }

    getUserInitiaLetter(fname: string, lname: string): string {
        return this.chatService.getUserInitiaLetter(fname, lname);
    }

    getColorFromName(fname: string, lname: string): string {
        return this.chatService.getColorFromName(fname, lname);
    }

    onSearch() {
        if (!this.searchQuery || this.searchQuery.length < 2) {
            this.chatService.searchResults.set([]);
            return;
        }

        this.isSearching = true;
        this.isSearching = true;
        this.chatService.searchUsers(this.searchQuery).then(() => {
            this.isSearching = false;
        });
    }

    isConversation(obj: UserDetail | Conversation): obj is Conversation {
        return (obj as Conversation).conversationType !== undefined;
    }

    isGroupConversation(obj: UserDetail | Conversation): obj is Conversation {
        return (obj as Conversation).conversationType === 'group';
    }

    startConversation(selectedConversation: UserDetail | Conversation) {
        if (this.isGroupConversation(selectedConversation)) {
            this.enableConversation(selectedConversation as Conversation);
        } else {
            this.enableNewConversation(selectedConversation as UserDetail);
        }
    }

    enableConversation(conversation: Conversation) {
        // Check if conversation exists
        conversation.conversationType = 'group';
        const existing = this.chatService.meetingRooms().findIndex(x => x.id === conversation.id);
        if (existing > -1) {
            this.selectChannelForConversation(this.chatService.meetingRooms()[existing]);
        } else {
            console.log("Starting new chat with", conversation);
            this.chatService.meetingRooms.update(rooms => [conversation, ...rooms]);
            this.selectChannelForConversation(conversation);
        }

        this.searchQuery = '';
        this.chatService.searchResults.set([]);
    }

    enableNewConversation(selectedUser: UserDetail) {
        // Check if conversation exists
        const existing = this.chatService.meetingRooms().findIndex(x =>
            x.participantIds.findIndex(y => y === selectedUser.userId) > -1 &&
            x.participantIds.findIndex(y => y === this.currentUserId) > -1 &&
            x.participantIds.length == 2
        );

        if (existing > -1) {
            this.selectChannelForConversation(this.chatService.meetingRooms()[existing]);
        } else {
            console.log("Starting new chat with", selectedUser);
            let newConversation: Conversation = {
                id: null,
                conversationId: null,
                conversationType: 'direct',
                conversationName: selectedUser.username,
                conversationAvatar: selectedUser.avatar,
                participantIds: [selectedUser.userId, this.currentUserId],
                participants: [
                    <Participant>{
                        userId: selectedUser.userId,
                        username: selectedUser.username,
                        firstName: selectedUser.firstName,
                        lastName: selectedUser.lastName,
                        email: selectedUser.email,
                        avatar: selectedUser.avatar,
                        joinedAt: new Date(),
                        role: 'user'
                    },
                    <Participant>{
                        userId: this.user.userId,
                        username: "",
                        firstName: this.user.firstName,
                        lastName: this.user.lastName,
                        email: this.user.email,
                        avatar: "",
                        joinedAt: new Date(),
                        role: 'user'
                    }
                ],
                createdBy: this.currentUserId,
                createdAt: new Date(),
                updatedAt: null,
                lastMessageAt: null,
                lastMessage: null,
                settings: null,
                isActive: true
            }

            this.chatService.meetingRooms.update(rooms => [newConversation, ...rooms]);
            this.selectChannelForConversation(newConversation);
        }

        this.searchQuery = '';
        this.chatService.searchResults.set([]);
    }

    selectChannelForConversation(conversation: Conversation) {
        this.ws.currentConversation.set(conversation);
        this.ws.currentConversationId.set(conversation.id);
        this.pageIndex = 1;
        this.chatService.messages.set([]); // Clear existing messages

        // Notify the NotificationService which conversation is now active
        this.notificationService.setActiveConversation(conversation.id);

        this.loadMoreMessages(true); // Pass true to scroll to bottom on first load
    }

    onScroll(event: any) {
        const element = event.target;
        // Load more when scrolled to top (for loading older messages)
        if (element.scrollTop === 0) {
            this.loadMoreMessages(false);
        }
    }

    loadMoreMessages(scrollToBottom: boolean = false) {
        if (!this.ws.currentConversation()) return;

        // Save current scroll height before loading older messages
        if (!scrollToBottom && this.messagesContainer) {
            this.previousScrollHeight = this.messagesContainer.nativeElement.scrollHeight;
        }

        this.chatService.getMessages(this.ws.currentConversation().id ?? '', this.pageIndex, 20, this.pageIndex > 1).then(() => {
            this.pageIndex = this.pageIndex + 1;
            if (scrollToBottom) {
                this.shouldScrollToBottom = true;
            } else {
                // Flag to preserve scroll position for older messages
                this.shouldPreserveScrollPosition = true;
            }
        });
    }

    sendMessage() {
        if (this.ws.currentConversation().id == null) {
            // call java to insert or create conversation channel
            this.chatService.createConversation(this.currentUserId, this.ws.currentConversation()).then((res: any) => {
                console.log("channel created", res);
                this.send(res);
            });
        } else {
            this.send(this.ws.currentConversation());
        }
    }

    private send(response: any) {
        if (this.message() != null && this.message() != '' && response.id != null) {
            var event: Message = {
                conversationId: response.id,
                messageId: crypto.randomUUID(),
                senderId: this.currentUserId,
                recievedId: this.recieverId,
                type: "text",
                body: this.message(),
                fileUrl: null,
                replyTo: null,
                mentions: [],
                reactions: [],
                clientType: "web",
                createdAt: new Date(),
                editedAt: null,
                status: 1
            }

            this.chatService.messages.update(msgs => [...msgs, event]);
            this.ws.sendMessage(event);
            this.message.set('');
            this.shouldScrollToBottom = true; // Scroll to bottom after sending
        }
    }

    scrollToBottom(): void {
        try {
            if (this.messagesContainer) {
                this.messagesContainer.nativeElement.scrollTop = this.messagesContainer.nativeElement.scrollHeight;
            }
        } catch (err) {
            console.error('Error scrolling to bottom:', err);
        }
    }

    formatTime(timestamp: number): string {
        return new Date(timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    onTyping(isTyping: boolean): void {
        if (this.ws.currentConversation().id) {
            this.ws.sendTyping(this.ws.currentConversation().id, isTyping);
        }
    }

    markAsSeen(messageId: string, conversationId: string): void {
        this.ws.markSeen(messageId, this.currentUserId, conversationId);
    }

    startAudioCall() {
        this.clientEventService.initiateAudioCall(this.currentUserId, this.ws.currentConversation().id);
        this.router.navigate(['/btc/preview'], {
            state: {
                id: this.ws.currentConversation().id,
                type: CallType.AUDIO,
                title: this.ws.currentConversation().conversationName ? this.ws.currentConversation().conversationName : 'NEW'
            }
        });
    }

    // Members Dropdown Methods
    toggleMembersDropdown(): void {
        this.showMembersDropdown = !this.showMembersDropdown;
        if (!this.showMembersDropdown) {
            this.cancelCreateGroup();
        }
    }

    cancelCreateGroup(): void {
        this.showCreateGroupInput = false;
        this.newGroupName = '';
        this.newGroupMembers = [];
        this.memberSearchQuery = '';
        this.memberSearchResults = [];
    }

    getDefaultGroupName(): string {
        const participants = this.ws.currentConversation()?.participants || [];
        if (participants.length === 0) return 'New Group';

        // Get first two names
        const names = participants.slice(0, 2).map(p => p.firstName);
        const othersCount = participants.length + this.newGroupMembers.length - 2;

        if (othersCount > 0) {
            return `${names.join(', ')} +${othersCount} others`;
        }
        return names.join(', ');
    }

    onMemberSearch(): void {
        this.memberSearchSelectedIndex = -1; // Reset selection on new search
        if (!this.memberSearchQuery || this.memberSearchQuery.length < 2) {
            this.memberSearchResults = [];
            return;
        }

        // Use the existing search functionality
        this.chatService.searchUsers(this.memberSearchQuery).then(() => {
            // Filter out members who are already in the group
            const existingIds = [
                ...this.ws.currentConversation().participants.map(p => p.userId),
                ...this.newGroupMembers.map(m => m.userId)
            ];
            this.memberSearchResults = this.chatService.searchResults()
                .filter(user => !existingIds.includes(user.userId));
        });
    }

    onMemberSearchKeydown(event: KeyboardEvent): void {
        const total = this.memberSearchResults.length;
        if (total === 0) return;

        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                this.memberSearchSelectedIndex = Math.min(this.memberSearchSelectedIndex + 1, total - 1);
                break;

            case 'ArrowUp':
                event.preventDefault();
                this.memberSearchSelectedIndex = Math.max(this.memberSearchSelectedIndex - 1, -1);
                break;

            case 'Enter':
                event.preventDefault();
                if (this.memberSearchSelectedIndex >= 0 && this.memberSearchSelectedIndex < total) {
                    this.addMemberToGroup(this.memberSearchResults[this.memberSearchSelectedIndex]);
                }
                break;

            case 'Escape':
                event.preventDefault();
                this.memberSearchQuery = '';
                this.memberSearchResults = [];
                this.memberSearchSelectedIndex = -1;
                break;
        }
    }

    addMemberToGroup(member: SearchResult): void {
        // Check if already added
        if (!this.newGroupMembers.find(m => m.conversationId === member.conversationId)) {
            this.newGroupMembers.push(member);
        }
        this.memberSearchQuery = '';
        this.memberSearchResults = [];
        this.memberSearchSelectedIndex = -1;
    }

    removeNewGroupMember(member: SearchResult): void {
        this.newGroupMembers = this.newGroupMembers.filter(m => m.conversationId !== member.conversationId);
    }

    createGroup(): void {
        const groupName = this.newGroupName.trim() || this.getDefaultGroupName();
        const newGroupMembers = this.newGroupMembers.reduce((acc, m) => [...acc, ...m.participants], []);

        const allMembers: Participant[] = [
            ...this.ws.currentConversation().participants,
            ...newGroupMembers
        ];

        // TODO: Call API to create group
        this.chatService.createGroupConversation(this.currentUserId, groupName, allMembers).then((res: any) => {
            // Reset state
            this.cancelCreateGroup();
            this.showMembersDropdown = false;
        });

    }

    ngOnDestroy(): void {
        this.subscriptions.unsubscribe();
        // Clear active conversation when leaving chat page
        this.notificationService.setActiveConversation(null);
    }
}

export interface FilterModal {
    searchString: string;
    sortBy?: string;
    pageIndex: number;
    pageSize: number;
}
