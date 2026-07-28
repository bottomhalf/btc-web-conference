import { Component, DestroyRef, effect, inject, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { LocalService } from '../providers/services/local.service';
import { ConfeetSocketService, Message } from '../providers/socket/confeet-socket.service';
import { Subscription } from 'rxjs';
import { Conversation, Participant, SearchResult, UserDetail } from '../components/global-search/search.models';
import { ChatService } from './chat.service';
import { Router } from '@angular/router';
import { ResponseModel, User } from '../models/model';

import { NotificationService } from '../notifications/services/notification.service';
import { ServerEventService } from '../providers/socket/server-events/server-event.service';
import { ChatContainerComponent } from './chat-container/chat-container.component';
import { TestSignalService } from '../providers/socket/client-events/call/test-sinal.service';
import { MultiUserAutocompleteComponent } from '../shared/components/multi-user-autocomplete/multi-user-autocomplete.component';
import { NotifyGroupCreatedService } from '../providers/socket/client-events/group/notify-group-created.service';
import { MobileChatComponent } from './mobile-chat/mobile-chat.component';

@Component({
    selector: 'app-chat',
    standalone: true,
    imports: [CommonModule, FormsModule, ChatContainerComponent, MultiUserAutocompleteComponent, MobileChatComponent],
    templateUrl: './chat.component.html',
    styleUrl: './chat.component.css',
})
export class ChatComponent implements OnInit, OnDestroy {
    // Local state managed by signals in service
    isPageReady: boolean = false;
    today: Date = new Date();
    recieverId?: string = null;
    filterModal: FilterModal = { pageIndex: 1, pageSize: 20, searchString: '1=1' };
    conn: any = null;
    user: User = {
        isMicOn: false,
        isCameraOn: false,
    };

    searchQuery: string = '';
    isSearching: boolean = false;

    // New Chat Popup state
    showNewChatPopup: boolean = false;
    popupMode: 'new-chat' | 'create-group' = 'new-chat';

    // Sidebar collapsible section state
    isChatSectionCollapsed: boolean = false;
    isSpacesSectionCollapsed: boolean = false;

    // New Group Members for popup creation
    newGroupName: string = '';
    newGroupMembers: SearchResult[] = [];
    memberSearchQuery: string = '';
    memberSearchResults: SearchResult[] = [];
    memberSearchSelectedIndex: number = -1;
    isCreatingGroup: boolean = false;

    // Status Popover state (sidebar avatar)
    showStatusPopover: boolean = false;
    popoverTop: number = 0;
    popoverLeft: number = 0;
    userStatus: 'available' | 'busy' | 'dnd' | 'away' | 'offline' = 'available';
    statusMessage: string = '';
    editingStatusMessage: boolean = false;
    tempStatusMessage: string = '';

    failedAvatars = new Set<string>();

    onAvatarError(url: string | null | undefined): void {
        if (url) {
            this.failedAvatars.add(url);
        }
    }

    readonly statusOptions = [
        { value: 'available', label: 'Available', color: '#92c353', icon: '✓' },
        { value: 'busy', label: 'Busy', color: '#c4314b', icon: '⊘' },
        { value: 'dnd', label: 'Do not disturb', color: '#c4314b', icon: '⊝' },
        { value: 'away', label: 'Be right back', color: '#f8d22a', icon: '○' },
        { value: 'offline', label: 'Appear offline', color: '#8a8886', icon: '○' },
    ] as const;

    private subscriptions = new Subscription();
    currentUserId: string = "";

    readonly destroyRef = inject(DestroyRef);

    constructor(
        private local: LocalService,
        private ws: ConfeetSocketService,
        public chatService: ChatService,
        private router: Router,
        public notificationService: NotificationService,
        private serverEventService: ServerEventService,
        private testSignalService: TestSignalService,
        private notifyGroupCreatedService: NotifyGroupCreatedService
    ) {
        // React to group notifications
        effect(() => {
            const groupNotification = this.serverEventService.groupNotification();
            if (groupNotification) {
                this.chatService.getMeetingRooms();
                return;
            }
        }, { allowSignalWrites: true });
    }

    ngOnInit() {
        this.testSignalService.execute();
        this.user = this.local.getUser();
        this.currentUserId = this.user.userId;

        // Listen for global search selections
        this.subscriptions.add(
            this.chatService.openChat$.subscribe((user: any) => {
                this.startConversation(user);
            })
        );

        // Listen for user status updates from other users
        this.subscriptions.add(
            this.ws.userStatus$.subscribe((statusUpdate: any) => {
                console.log("Received status update:", statusUpdate);
                // The payload from Go is currently model.UserStatus { UserID string, Status string }
                if (statusUpdate && statusUpdate.user_id && statusUpdate.status) {
                    const userId = statusUpdate.user_id;
                    const status = statusUpdate.status;

                    // Update user's status in the current search results or contact list if needed
                    // Usually we might need a centralized presence service, but for now we can update 
                    // the current user's local state if it's them, or rely on avatar status bindings.
                    // If it's the current user:
                    if (userId === this.currentUserId) {
                        this.userStatus = status;
                    }
                    // For other users, if you have a local list, update it.
                    // This can be expanded based on how you store remote user statuses.
                    this.chatService.updateUserStatus(userId, status);
                }
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

    get directConversations(): Conversation[] {
        return this.chatService.meetingRooms().filter(c => c && c.type?.toLowerCase() !== 'group');
    }

    get groupConversations(): Conversation[] {
        return this.chatService.meetingRooms().filter(c => c && c.type?.toLowerCase() === 'group');
    }

    toggleChatSection(): void {
        this.isChatSectionCollapsed = !this.isChatSectionCollapsed;
    }

    toggleSpacesSection(): void {
        this.isSpacesSectionCollapsed = !this.isSpacesSectionCollapsed;
    }

    openNewChatPopupWithMode(mode: 'new-chat' | 'create-group', event?: Event): void {
        if (event) {
            event.stopPropagation();
        }
        this.popupMode = mode;
        this.showNewChatPopup = true;
        this.searchQuery = '';
        this.memberSearchQuery = '';
    }

    getConversationAvatar(conversation: Conversation): string {
        if (!conversation) return '';
        if (conversation.type?.toLowerCase() === 'group') {
            return conversation.avatar || '';
        }
        const participants = (conversation.participants || []).filter(p => p && p.userId !== this.currentUserId);
        if (participants.length > 0 && participants[0].avatar) {
            return participants[0].avatar;
        }
        return conversation.avatar || '';
    }

    getDirectUserStatus(conversation: Conversation): string {
        if (!conversation || conversation.type?.toLowerCase() === 'group') return '';
        const participants = (conversation.participants || []).filter(p => p && p.userId !== this.currentUserId);
        if (participants.length > 0) {
            return (participants[0].status || 'offline').toLowerCase();
        }
        return 'offline';
    }

    getDirectUserStatusColor(conversation: Conversation): string {
        const status = this.getDirectUserStatus(conversation);
        switch (status) {
            case 'available':
            case 'online':
                return '#34A853'; // Google Green
            case 'busy':
            case 'dnd':
                return '#EA4335'; // Google Red
            case 'away':
            case 'brb':
                return '#FBBC05'; // Google Yellow
            default:
                return '#9AA0A6'; // Google Gray
        }
    }

    getNormalizedStatus(statusInput: string): string {
        const s = (statusInput || '').toLowerCase();
        if (s === 'available' || s === 'online') return 'online';
        if (s === 'busy' || s === 'dnd') return 'busy';
        return 'offline';
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
        return (obj as Conversation).type !== undefined || (obj as Conversation).conversationType !== undefined;
    }

    isGroupConversation(obj: UserDetail | Conversation): obj is Conversation {
        return (obj as Conversation).type?.toLowerCase() === 'group' || (obj as Conversation).conversationType === 'group';
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
        conversation.type = 'GROUP';
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
                avatar: selectedUser.avatar || '',
                createdAt: new Date(),
                createdBy: this.currentUserId,
                description: '',
                lastMessageAt: null,
                lastMessageId: null,
                memberCount: 2,
                settings: {
                    allowReactions: true,
                    allowPinning: true,
                    adminOnlyPost: false
                },
                title: selectedUser.username,
                type: 'DIRECT',
                searchableMemberInfo: [],
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
                        role: 'user',
                        status: (selectedUser.status || 'offline').toLowerCase()
                    },
                    <Participant>{
                        userId: this.user.userId,
                        username: "",
                        firstName: this.user.firstName,
                        lastName: this.user.lastName,
                        email: this.user.email,
                        avatar: "",
                        joinedAt: new Date(),
                        role: 'user',
                        status: this.userStatus
                    }
                ],
                deleted: false,

                // Legacy fallback support for older modules
                conversationId: null,
                conversationType: 'direct',
                conversationName: selectedUser.username,
                conversationAvatar: selectedUser.avatar,
                isActive: true
            }

            this.chatService.meetingRooms.update(rooms => [newConversation, ...rooms]);
            this.selectChannelForConversation(newConversation);
        }

        this.searchQuery = '';
        this.chatService.searchResults.set([]);
    }

    selectChannelForConversation(conversation: Conversation) {
        if (!conversation) return;
        const currentId = this.ws.currentConversationId();
        const targetId = conversation.id || conversation.conversationId || '';
        if (currentId && targetId && currentId === targetId && this.chatService.messages().length > 0) {
            return;
        }

        this.chatService.isMessagesLoading.set(true);
        this.ws.currentConversation.set(conversation);
        this.ws.currentConversationId.set(targetId || null);

        this.chatService.messages.set([]); // Clear existing messages

        // Notify the NotificationService which conversation is now active
        if (targetId) {
            this.notificationService.setActiveConversation(targetId);
        }
    }

    isConversationSelected(item: Conversation): boolean {
        return Boolean(item && (item.id === this.ws.currentConversationId() || item.conversationId === this.ws.currentConversationId()));
    }

    // New Chat Popup Methods
    toggleNewChatPopup(): void {
        this.showNewChatPopup = !this.showNewChatPopup;
    }

    closeNewChatPopup(): void {
        this.showNewChatPopup = false;
        this.popupMode = 'new-chat';
        this.searchQuery = '';
        this.memberSearchQuery = '';
        this.newGroupMembers = [];
        this.newGroupName = '';
        this.memberSearchResults = [];
    }

    onMemberSearch(query: string): void {
        this.memberSearchQuery = query;
        if (!query || query.trim().length < 2) {
            this.memberSearchResults = [];
            return;
        }
        this.chatService.userAutocompleteSerach(query).then((res: SearchResult[]) => {
            this.memberSearchResults = (res || []).filter(u => u.userId !== this.currentUserId);
        });
    }

    onSelectedMembersChange(users: SearchResult[]): void {
        this.newGroupMembers = users;
    }

    removeNewGroupMember(user: SearchResult): void {
        this.newGroupMembers = this.newGroupMembers.filter(m => m.conversationId !== user.conversationId && (!m.userId || m.userId !== user.userId));
    }

    createGroup(): void {
        if (!this.newGroupName.trim() || this.newGroupMembers.length === 0 || this.isCreatingGroup) return;

        this.isCreatingGroup = true;
        const selectedParticipants = this.newGroupMembers.reduce((acc, m) => [...acc, ...(m.participants || [])], []);

        const allMembers: string[] = selectedParticipants.map(m => m.userId || '');
        allMembers.push(this.currentUserId);
        const createGroupRequest: any = {
            groupName: this.newGroupName.trim(),
            memberIds: allMembers
        };

        this.chatService.createGroupConversation(this.currentUserId, createGroupRequest).then((res: ResponseModel) => {
            this.isCreatingGroup = false;
            if (res.isSuccess && res.responseBody) {
                this.notifyGroupCreatedService.execute(res.responseBody.id, this.currentUserId);
                this.chatService.getMeetingRooms();

                const currentUserName = this.user.firstName + " " + (this.user.lastName || '');
                const convId = res.responseBody.id;

                // 1st Notification: Sent to the whole group so members see it
                let groupMsg: any = {
                    conversationId: convId,
                    messageId: crypto.randomUUID(),
                    senderId: this.currentUserId,
                    recievedId: null,
                    type: "text",
                    senderName: currentUserName,
                    replyTo: null,
                    mentions: [],
                    reactions: [],
                    clientType: "web",
                    createdAt: new Date(),
                    editedAt: null,
                    status: 1,
                    content: `Group "${this.newGroupName.trim()}" was created by ${currentUserName}.`,
                    fileUrl: null
                };
                this.ws.sendEvent('send_notification', groupMsg);

                // 2nd Notification: Sent specifically to the newly added members
                allMembers.forEach(memberId => {
                    if (memberId !== this.currentUserId) {
                        let directMsg: any = {
                            conversationId: convId,
                            messageId: crypto.randomUUID(),
                            senderId: this.currentUserId,
                            recievedId: memberId,
                            type: "text",
                            senderName: currentUserName,
                            replyTo: null,
                            mentions: [],
                            reactions: [],
                            clientType: "web",
                            createdAt: new Date(),
                            editedAt: null,
                            status: 1,
                            content: `You were added to the group "${this.newGroupName.trim()}" by ${currentUserName}.`,
                            fileUrl: null
                        };
                        this.ws.sendEvent('send_notification', directMsg);
                    }
                });

                this.closeNewChatPopup();
            } else {
                console.error("Failed to create group:", res);
            }
        }).catch(err => {
            this.isCreatingGroup = false;
            console.error("Error creating group:", err);
        });
    }

    // Status Popover Methods
    toggleStatusPopover(event: Event): void {
        event.stopPropagation();
        this.showStatusPopover = !this.showStatusPopover;
        if (this.showStatusPopover) {
            this.tempStatusMessage = this.statusMessage;
            this.editingStatusMessage = false;
            // Compute fixed position: appear to the right of the avatar row
            const trigger = (event.currentTarget as HTMLElement) ?? (event.target as HTMLElement);
            const rect = trigger.closest('.user-profile-header')?.getBoundingClientRect()
                ?? trigger.getBoundingClientRect();
            this.popoverTop = rect.bottom + 6;
            this.popoverLeft = rect.left;
            // Close on outside click
            setTimeout(() => {
                document.addEventListener('click', this.closeStatusPopoverHandler);
            }, 0);
        } else {
            document.removeEventListener('click', this.closeStatusPopoverHandler);
        }
    }

    private closeStatusPopoverHandler = () => {
        this.showStatusPopover = false;
        this.editingStatusMessage = false;
        document.removeEventListener('click', this.closeStatusPopoverHandler);
    };

    setUserStatus(status: 'available' | 'busy' | 'dnd' | 'away' | 'offline'): void {
        this.userStatus = status;
        this.ws.updateStatus(status);
    }

    getStatusColor(): string {
        return this.statusOptions.find(s => s.value === this.userStatus)?.color ?? '#92c353';
    }

    getStatusLabel(): string {
        return this.statusOptions.find(s => s.value === this.userStatus)?.label ?? 'Available';
    }

    startEditingStatusMessage(): void {
        this.editingStatusMessage = true;
        this.tempStatusMessage = this.statusMessage;
    }

    saveStatusMessage(): void {
        this.statusMessage = this.tempStatusMessage;
        this.editingStatusMessage = false;
    }

    cancelStatusMessage(): void {
        this.tempStatusMessage = this.statusMessage;
        this.editingStatusMessage = false;
    }

    stopPopoverPropagation(event: Event): void {
        event.stopPropagation();
    }

    ngOnDestroy(): void {
        this.subscriptions.unsubscribe();
        document.removeEventListener('click', this.closeStatusPopoverHandler);
        // Clear active conversation when leaving chat page
        this.notificationService.setActiveConversation(null);
        this.chatService.setIsChatStatus(false);
    }
}

export interface FilterModal {
    searchString: string;
    sortBy?: string;
    pageIndex: number;
    pageSize: number;
}
