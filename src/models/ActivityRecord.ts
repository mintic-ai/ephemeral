export interface ActivityRecord {
  containerId: string;
  timestamp: Date;
  activityType: 'http_request' | 'resource_usage' | 'heartbeat' | 'manual';
  details?: Record<string, any>;
}

export interface ActivityUpdate {
  containerId: string;
  activityType: ActivityRecord['activityType'];
  details?: Record<string, any>;
}