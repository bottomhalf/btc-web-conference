// -----------------------------------------------------------------
// Redis Presence & Session Analysis Models
// -----------------------------------------------------------------

export interface StatusBreakdown {
    [status: string]: number;
}

export interface DeviceBreakdown {
    [device: string]: number;
}

export interface PresenceSummary {
    totalUsers: number;
    totalSessions: number;
    totalWatchers?: number;
    statusBreakdown: StatusBreakdown;
    deviceBreakdown: DeviceBreakdown;
    usersMultiDevice: number;
    staleSessions: number;
}

export interface UserSession {
    clientId: string;
    userId: string;
    gatewayId: string;
    status: 'online' | 'offline' | 'away' | 'busy' | string;
    device: 'web' | 'mobile' | 'desktop' | string;
    platform: string;
    lastSeen: string; // ISO timestamp
    ttlSeconds: number;
    isExpired: boolean;
}

export interface PaginationMeta {
    page: number;
    pageSize: number;
    totalUsers: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
}

export interface PresenceUser {
    userId: string;
    username?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    status?: string;
    isActive?: boolean;
    sessions: UserSession[];
    totalSessions: number;
    watcherIds?: string[];
    watcherCount?: number;
    earliestExpiry?: string; // ISO timestamp
    isMultiDevice: boolean;
}

export interface ServerInfo {
    usedMemory: string;
    usedMemoryHuman: string;
    connectedClients: string;
    uptimeInSeconds: string;
    totalKeys: number;
}

export interface RedisAnalysisResponse {
    timestamp: string;
    pagination?: PaginationMeta;
    summary: PresenceSummary;
    users: PresenceUser[];
    serverInfo: ServerInfo;
}

export interface UserWatchersReport {
    userId: string;
    redisKey: string;
    watcherCount: number;
    watchers: string[];
    timestamp: string;
}

// Backward compatibility alias
export type MonitorResponse = RedisAnalysisResponse;
export type ClientInfo = UserSession;
