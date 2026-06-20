export interface ModelPolicy {
  model: string;
  action: 'allow' | 'deny' | 'route' | 'channel';
  route_to: string;
  channel_to: string;
  reason: string;
  created_at: string;
}

export interface IPRecord {
  ip: string;
  status: 'normal' | 'banned' | 'risk_controlled';
  reason: string;
  expires_at: string | null;
  created_at: string;
}

export interface AutoPolicy {
  type: 'invalid_model' | 'invalid_apikey';
  threshold: number;
  window_seconds: number;
  action: 'ban' | 'risk_control' | 'none';
  duration_seconds: number;
}

export interface IPStatsMap {
  [ip: string]: {
    invalid_model_count: number;
    invalid_apikey_count: number;
  };
}

export interface IPStats {
  ip: string;
  invalid_model_count: number;
  invalid_apikey_count: number;
}

export interface AccessControlStats {
  stats: IPStatsMap;
}
