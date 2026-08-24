import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MonitorService } from '../providers/services/monitor.service';
import { PresenceUser, UserSession } from '../models/monitor.model';

@Component({
    selector: 'app-monitor-dashboard',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './monitor-dashboard.component.html',
    styleUrl: './monitor-dashboard.component.css'
})
export class MonitorDashboardComponent implements OnInit, OnDestroy {
    private monitorService = inject(MonitorService);

    // State signals from service
    readonly monitorData = this.monitorService.monitorData;
    readonly isLoading = this.monitorService.isLoading;
    readonly error = this.monitorService.error;
    readonly lastUpdated = this.monitorService.lastUpdated;
    readonly targetUserId = this.monitorService.targetUserId;
    readonly pagination = this.monitorService.pagination;
    readonly page = this.monitorService.page;
    readonly pageSize = this.monitorService.pageSize;

    // Derived signals
    readonly summary = this.monitorService.summary;
    readonly users = this.monitorService.users;
    readonly serverInfo = this.monitorService.serverInfo;
    readonly timestamp = this.monitorService.timestamp;
    readonly totalUsers = this.monitorService.totalUsers;
    readonly totalSessions = this.monitorService.totalSessions;
    readonly totalWatchers = this.monitorService.totalWatchers;
    readonly statusBreakdown = this.monitorService.statusBreakdown;
    readonly deviceBreakdown = this.monitorService.deviceBreakdown;
    readonly usersMultiDevice = this.monitorService.usersMultiDevice;
    readonly staleSessions = this.monitorService.staleSessions;
    readonly usedMemoryHuman = this.monitorService.usedMemoryHuman;
    readonly connectedClients = this.monitorService.connectedClients;
    readonly uptimeInSeconds = this.monitorService.uptimeInSeconds;
    readonly totalKeys = this.monitorService.totalKeys;

    // Filter and UI State
    searchQuery = signal<string>('');
    statusFilter = signal<string>('all');
    deviceFilter = signal<string>('all');
    onlyMultiDevice = signal<boolean>(false);
    onlyWithWatchers = signal<boolean>(false);
    userIdInput = signal<string>('BOT0035');
    isAutoRefreshEnabled = signal<boolean>(true);
    isDarkMode = signal<boolean>(false);
    expandedUserIds = signal<Set<string>>(new Set());
    expandedWatcherUserIds = signal<Set<string>>(new Set());
    copiedId = signal<string | null>(null);
    showRawJson = signal<boolean>(false);

    // Status breakdown keys
    readonly statusBreakdownKeys = computed(() => Object.keys(this.statusBreakdown() || {}));
    // Device breakdown keys
    readonly deviceBreakdownKeys = computed(() => Object.keys(this.deviceBreakdown() || {}));

    // Filtered user list
    readonly filteredUsers = computed<PresenceUser[]>(() => {
        let userList = this.users() || [];
        const query = this.searchQuery().toLowerCase().trim();
        const status = this.statusFilter().toLowerCase();
        const device = this.deviceFilter().toLowerCase();
        const multiDeviceOnly = this.onlyMultiDevice();
        const withWatchersOnly = this.onlyWithWatchers();

        if (multiDeviceOnly) {
            userList = userList.filter(u => u.isMultiDevice || (u.sessions && u.sessions.length > 1));
        }

        if (withWatchersOnly) {
            userList = userList.filter(u => (u.watcherCount ?? 0) > 0 || (u.watcherIds && u.watcherIds.length > 0));
        }

        if (status !== 'all') {
            userList = userList.filter(u =>
                u.sessions?.some(s => s.status?.toLowerCase() === status) ||
                u.status?.toLowerCase() === status ||
                (status === 'active' && u.isActive) ||
                (status === 'inactive' && !u.isActive)
            );
        }

        if (device !== 'all') {
            userList = userList.filter(u =>
                u.sessions?.some(s => s.device?.toLowerCase() === device)
            );
        }

        if (query) {
            userList = userList.filter(u => {
                const matchUserId = u.userId?.toLowerCase().includes(query);
                const matchName = (u.firstName + ' ' + u.lastName)?.toLowerCase().includes(query) ||
                    u.username?.toLowerCase().includes(query) ||
                    u.email?.toLowerCase().includes(query);
                const matchStatus = u.status?.toLowerCase().includes(query);
                const matchWatcher = u.watcherIds?.some(wid => wid?.toLowerCase().includes(query));
                const matchSession = u.sessions?.some(s =>
                    s.clientId?.toLowerCase().includes(query) ||
                    s.gatewayId?.toLowerCase().includes(query) ||
                    s.platform?.toLowerCase().includes(query) ||
                    s.device?.toLowerCase().includes(query) ||
                    s.status?.toLowerCase().includes(query)
                );
                return matchUserId || matchName || matchStatus || matchWatcher || matchSession;
            });
        }

        return userList;
    });

    ngOnInit(): void {
        this.userIdInput.set(this.targetUserId() || 'BOT0035');
        this.monitorService.startAutoRefresh();
    }

    ngOnDestroy(): void {
        this.monitorService.stopAutoRefresh();
    }

    toggleTheme(): void {
        this.isDarkMode.update(v => !v);
    }

    toggleAutoRefresh(): void {
        const enabled = !this.isAutoRefreshEnabled();
        this.isAutoRefreshEnabled.set(enabled);

        if (enabled) {
            this.monitorService.startAutoRefresh();
        } else {
            this.monitorService.stopAutoRefresh();
        }
    }

    refreshNow(): void {
        this.monitorService.fetchMonitorData(this.userIdInput());
    }

    onUserIdSubmit(): void {
        const uid = this.userIdInput().trim();
        if (uid) {
            this.monitorService.fetchMonitorData(uid);
        }
    }

    toggleUserExpand(userId: string): void {
        this.expandedUserIds.update(set => {
            const newSet = new Set(set);
            if (newSet.has(userId)) {
                newSet.delete(userId);
            } else {
                newSet.add(userId);
            }
            return newSet;
        });
    }

    isUserExpanded(userId: string): boolean {
        // By default, if total users is small (<= 5), expand all if not explicitly collapsed
        const set = this.expandedUserIds();
        if (set.has(userId)) return true;
        if (set.size === 0 && this.filteredUsers().length <= 5) return true;
        return false;
    }

    expandAll(): void {
        const allIds = new Set(this.users().map(u => u.userId));
        this.expandedUserIds.set(allIds);
    }

    collapseAll(): void {
        // Put a dummy marker or clear so all are closed
        this.expandedUserIds.set(new Set(['__NONE__']));
    }

    toggleRawJson(): void {
        this.showRawJson.update(v => !v);
    }

    copyRawJson(): void {
        const data = this.monitorData();
        if (data) {
            this.copyToClipboard(JSON.stringify(data, null, 2), 'raw_json');
        }
    }

    toggleWatchersExpand(userId: string, event?: Event): void {
        if (event) event.stopPropagation();
        this.expandedWatcherUserIds.update(set => {
            const newSet = new Set(set);
            if (newSet.has(userId)) {
                newSet.delete(userId);
            } else {
                newSet.add(userId);
            }
            return newSet;
        });
    }

    isWatchersExpanded(userId: string): boolean {
        return this.expandedWatcherUserIds().has(userId);
    }

    resetFilters(): void {
        this.searchQuery.set('');
        this.statusFilter.set('all');
        this.deviceFilter.set('all');
        this.onlyMultiDevice.set(false);
        this.onlyWithWatchers.set(false);
    }

    filterByWatcher(watcherId: string, event?: Event): void {
        if (event) event.stopPropagation();
        this.searchQuery.set(watcherId.trim());
    }

    inspectUser(userId: string, event?: Event): void {
        if (event) event.stopPropagation();
        const uid = userId.trim();
        this.userIdInput.set(uid);
        this.searchQuery.set(uid);
    }

    onPageChange(page: number): void {
        this.monitorService.setPage(page);
    }

    onPageSizeChange(event: Event): void {
        const target = event.target as HTMLSelectElement;
        const size = parseInt(target.value, 10);
        if (size > 0) {
            this.monitorService.setPageSize(size);
        }
    }

    nextPage(): void {
        this.monitorService.nextPage();
    }

    prevPage(): void {
        this.monitorService.prevPage();
    }

    getUserDisplayName(user: PresenceUser): string {
        const first = user.firstName?.trim() || '';
        const last = user.lastName?.trim() || '';
        if (first || last) {
            return `${first} ${last}`.trim();
        }
        if (user.username) {
            return user.username;
        }
        return user.userId;
    }

    getUserSubtitle(user: PresenceUser): string {
        if (user.email) return user.email;
        if (user.username && user.username !== user.userId) return `@${user.username}`;
        return `ID: ${user.userId}`;
    }

    getUserInitials(user: PresenceUser): string {
        const first = user.firstName?.trim() || '';
        const last = user.lastName?.trim() || '';
        if (first && last) {
            return (first[0] + last[0]).toUpperCase();
        }
        if (first) {
            return first.substring(0, 2).toUpperCase();
        }
        if (user.username) {
            return user.username.substring(0, 2).toUpperCase();
        }
        if (user.userId) {
            return user.userId.substring(0, 2).toUpperCase();
        }
        return 'U';
    }

    getUserStatusLabel(user: PresenceUser): string {
        if (user.status) {
            return user.status;
        }
        if (user.isActive !== undefined) {
            return user.isActive ? 'Active' : 'Inactive';
        }
        if (user.sessions && user.sessions.length > 0) {
            return user.sessions[0].status || 'Online';
        }
        return 'Active';
    }

    getUserStatusClass(user: PresenceUser): string {
        const s = (user.status || (user.isActive ? 'active' : 'inactive')).toLowerCase();
        if (s === 'online' || s === 'active') return 'status-badge-active';
        if (s === 'away') return 'status-badge-away';
        if (s === 'busy') return 'status-badge-busy';
        if (s === 'offline' || s === 'inactive') return 'status-badge-inactive';
        return 'status-badge-active';
    }

    getUserStatusDotClass(user: PresenceUser): string {
        const s = (user.status || (user.isActive ? 'active' : 'inactive')).toLowerCase();
        if (s === 'online' || s === 'active') return 'dot-online';
        if (s === 'away') return 'dot-away';
        if (s === 'busy') return 'dot-busy';
        if (s === 'offline' || s === 'inactive') return 'dot-offline';
        return 'dot-online';
    }

    getWatcherCount(user: PresenceUser): number {
        if (user.watcherCount !== undefined && user.watcherCount !== null) {
            return user.watcherCount;
        }
        return user.watcherIds?.length ?? 0;
    }

    getWatchersList(user: PresenceUser): string[] {
        return user.watcherIds ?? [];
    }

    copyToClipboard(text: string, idKey: string): void {
        if (!navigator.clipboard) return;
        navigator.clipboard.writeText(text).then(() => {
            this.copiedId.set(idKey);
            setTimeout(() => {
                if (this.copiedId() === idKey) {
                    this.copiedId.set(null);
                }
            }, 2000);
        });
    }

    formatUptime(secondsStr: string): string {
        const seconds = parseInt(secondsStr, 10);
        if (isNaN(seconds) || seconds < 0) return '0s';

        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        const parts: string[] = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

        return parts.join(' ');
    }

    formatRelativeTime(isoDateStr: string): string {
        if (!isoDateStr) return '-';
        const date = new Date(isoDateStr);
        if (isNaN(date.getTime())) return isoDateStr;

        const diffSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
        if (diffSeconds < 5) return 'just now';
        if (diffSeconds < 60) return `${diffSeconds}s ago`;
        const diffMinutes = Math.floor(diffSeconds / 60);
        if (diffMinutes < 60) return `${diffMinutes}m ago`;
        const diffHours = Math.floor(diffMinutes / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${Math.floor(diffHours / 24)}d ago`;
    }

    getPlatformIcon(platform: string): string {
        if (!platform) return 'fa-solid fa-laptop-code';
        const p = platform.toLowerCase();
        if (p.includes('dart') || p.includes('flutter')) return 'fa-solid fa-feather-pointed';
        if (p.includes('chrome') || p.includes('crios')) return 'fa-brands fa-chrome';
        if (p.includes('firefox')) return 'fa-brands fa-firefox-browser';
        if (p.includes('safari') && !p.includes('chrome')) return 'fa-brands fa-safari';
        if (p.includes('edge')) return 'fa-brands fa-edge';
        if (p.includes('android')) return 'fa-brands fa-android';
        if (p.includes('iphone') || p.includes('ipad') || p.includes('macintosh') || p.includes('mac os')) return 'fa-brands fa-apple';
        if (p.includes('windows')) return 'fa-brands fa-windows';
        if (p.includes('linux')) return 'fa-brands fa-linux';
        return 'fa-solid fa-globe';
    }

    getDeviceIcon(device: string): string {
        const d = (device || '').toLowerCase();
        switch (d) {
            case 'web': return 'fa-solid fa-globe';
            case 'mobile': return 'fa-solid fa-mobile-screen-button';
            case 'desktop': return 'fa-solid fa-desktop';
            case 'tablet': return 'fa-solid fa-tablet-screen-button';
            default: return 'fa-solid fa-laptop';
        }
    }

    getStatusClass(status: string): string {
        const s = (status || '').toLowerCase();
        switch (s) {
            case 'online': return 'status-online';
            case 'busy': return 'status-busy';
            case 'away': return 'status-away';
            case 'offline': return 'status-offline';
            default: return 'status-unknown';
        }
    }

    trackByUserId(index: number, user: PresenceUser): string {
        return user.userId || index.toString();
    }

    trackByClientId(index: number, session: UserSession): string {
        return session.clientId || index.toString();
    }
}
