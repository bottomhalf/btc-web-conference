import { Injectable, inject, signal, computed } from '@angular/core';
import { RedisAnalysisResponse, PresenceSummary, PresenceUser, ServerInfo, PaginationMeta } from '../../models/monitor.model';
import { ResponseModel } from '../../models/model';
import { HttpService } from './http.service';
import { LocalService } from './local.service';
import { environment } from '../../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class MonitorService {
    private http = inject(HttpService);
    private local = inject(LocalService);
    private readonly baseUrl = environment.goApiGateway;

    // Signal-based state
    private _monitorData = signal<RedisAnalysisResponse | null>(null);
    private _isLoading = signal<boolean>(false);
    private _error = signal<string | null>(null);
    private _lastUpdated = signal<Date | null>(null);
    private _targetUserId = signal<string>('BOT0035');
    private _page = signal<number>(1);
    private _pageSize = signal<number>(20);

    // Auto-refresh interval (in milliseconds)
    private refreshInterval: any = null;
    private readonly DEFAULT_REFRESH_INTERVAL = 10000; // 10 seconds

    // Public readonly signals
    readonly monitorData = this._monitorData.asReadonly();
    readonly isLoading = this._isLoading.asReadonly();
    readonly error = this._error.asReadonly();
    readonly lastUpdated = this._lastUpdated.asReadonly();
    readonly targetUserId = this._targetUserId.asReadonly();
    readonly page = this._page.asReadonly();
    readonly pageSize = this._pageSize.asReadonly();

    // Computed signals for direct access
    readonly pagination = computed<PaginationMeta | null>(() => this._monitorData()?.pagination ?? null);
    readonly summary = computed<PresenceSummary | null>(() => this._monitorData()?.summary ?? null);
    readonly users = computed<PresenceUser[]>(() => this._monitorData()?.users ?? []);
    readonly serverInfo = computed<ServerInfo | null>(() => this._monitorData()?.serverInfo ?? null);
    readonly timestamp = computed<string | null>(() => this._monitorData()?.timestamp ?? null);

    // Summary sub-computeds
    readonly totalUsers = computed(() => this.summary()?.totalUsers ?? this.pagination()?.totalUsers ?? 0);
    readonly totalSessions = computed(() => this.summary()?.totalSessions ?? 0);
    readonly totalWatchers = computed(() => this.summary()?.totalWatchers ?? 0);
    readonly statusBreakdown = computed(() => this.summary()?.statusBreakdown ?? {});
    readonly deviceBreakdown = computed(() => this.summary()?.deviceBreakdown ?? {});
    readonly usersMultiDevice = computed(() => this.summary()?.usersMultiDevice ?? 0);
    readonly staleSessions = computed(() => this.summary()?.staleSessions ?? 0);

    // Server Info sub-computeds
    readonly usedMemoryHuman = computed(() => this.serverInfo()?.usedMemoryHuman ?? '0B');
    readonly connectedClients = computed(() => this.serverInfo()?.connectedClients ?? '0');
    readonly uptimeInSeconds = computed(() => this.serverInfo()?.uptimeInSeconds ?? '0');
    readonly totalKeys = computed(() => this.serverInfo()?.totalKeys ?? 0);

    constructor() {
        // Initialize target user id with current logged in user if available, otherwise fallback to BOT0035
        const user = this.local.getUser();
        if (user && user.userId) {
            this._targetUserId.set(user.userId);
        } else {
            this._targetUserId.set('BOT0035');
        }
    }

    /**
     * Set target user ID for redis analysis queries
     */
    setTargetUserId(userId: string): void {
        this._targetUserId.set(userId.trim() || 'BOT0035');
    }

    /**
     * Set pagination page
     */
    setPage(page: number): void {
        if (page >= 1) {
            this._page.set(page);
            this.fetchMonitorData();
        }
    }

    /**
     * Set page size
     */
    setPageSize(pageSize: number): void {
        if (pageSize >= 1) {
            this._pageSize.set(pageSize);
            this._page.set(1); // Reset to first page
            this.fetchMonitorData();
        }
    }

    /**
     * Navigate to next page
     */
    nextPage(): void {
        const pag = this.pagination();
        if (pag && pag.hasNext) {
            this.setPage(this._page() + 1);
        }
    }

    /**
     * Navigate to previous page
     */
    prevPage(): void {
        const pag = this.pagination();
        if (pag && pag.hasPrevious) {
            this.setPage(this._page() - 1);
        }
    }

    /**
     * Fetch monitor data from API with pagination & user query support
     */
    async fetchMonitorData(targetUserId?: string): Promise<void> {
        if (targetUserId) {
            this.setTargetUserId(targetUserId);
        }

        const page = this._page();
        const pageSize = this._pageSize();
        this._isLoading.set(true);
        this._error.set(null);

        try {
            const params = new URLSearchParams();
            params.set('page', page.toString());
            params.set('pageSize', pageSize.toString());
            const url = `admin/redis-analysis?${params.toString()}`;
            const response: any = await this.http.get(url, { baseUrl: this.baseUrl });

            let data: RedisAnalysisResponse | null = null;

            if (response) {
                // 1. Direct JSON response from Go service (has top-level summary / users / serverInfo)
                if (response.summary || response.users || response.serverInfo || response.pagination) {
                    data = response as RedisAnalysisResponse;
                }
                // 2. Wrapped in ResponseModel.responseBody
                else if (response.responseBody && (response.responseBody.summary || response.responseBody.users || response.responseBody.serverInfo)) {
                    data = response.responseBody as RedisAnalysisResponse;
                }
                else if (response.isSuccess && response.responseBody) {
                    data = response.responseBody as RedisAnalysisResponse;
                }
            }

            if (data) {
                this._monitorData.set(data);
                if (data.pagination) {
                    this._page.set(data.pagination.page);
                    this._pageSize.set(data.pagination.pageSize);
                }
                this._error.set(null);
                this._lastUpdated.set(new Date());
            } else {
                this._error.set(response?.message || response?.errorMessage || 'Failed to fetch monitor data');
            }
        } catch (err: any) {
            this._error.set(err?.message || 'Network error occurred');
        } finally {
            this._isLoading.set(false);
        }
    }

    /**
     * Fetch direct watchers for a specific user ID
     */
    async fetchUserWatchers(userId: string): Promise<any> {
        try {
            const url = `admin/get-watchers/${encodeURIComponent(userId.trim())}`;
            const res: any = await this.http.get(url, { baseUrl: this.baseUrl });
            return res;
        } catch (err: any) {
            console.error(`Failed to fetch watchers for user ${userId}:`, err);
            return null;
        }
    }

    /**
     * Start auto-refresh polling
     */
    startAutoRefresh(intervalMs: number = this.DEFAULT_REFRESH_INTERVAL): void {
        this.stopAutoRefresh();

        // Initial fetch
        this.fetchMonitorData();

        // Set up interval
        this.refreshInterval = setInterval(() => {
            this.fetchMonitorData();
        }, intervalMs);
    }

    /**
     * Stop auto-refresh polling
     */
    stopAutoRefresh(): void {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    /**
     * Clear all data and reset state
     */
    reset(): void {
        this.stopAutoRefresh();
        this._monitorData.set(null);
        this._isLoading.set(false);
        this._error.set(null);
        this._lastUpdated.set(null);
    }
}
