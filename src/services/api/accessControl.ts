import { apiClient } from './client';
import type { ModelPolicy, IPRecord, AutoPolicy, AccessControlStats } from '@/types';

export const accessControlApi = {
  getModelPolicies: () =>
    apiClient.get<{ model_policies: ModelPolicy[] }>('/access-control/models'),

  putModelPolicy: (policy: Partial<ModelPolicy> & { model: string }) =>
    apiClient.put('/access-control/models', policy),

  deleteModelPolicy: (model: string) =>
    apiClient.delete(`/access-control/models?model=${encodeURIComponent(model)}`),

  getIPRecords: () =>
    apiClient.get<{ ip_records: IPRecord[] }>('/access-control/ips'),

  putIPRecord: (record: { ip: string; status: string; reason?: string; duration?: number }) =>
    apiClient.put('/access-control/ips', record),

  deleteIPRecord: (ip: string) =>
    apiClient.delete(`/access-control/ips?ip=${encodeURIComponent(ip)}`),

  getAutoPolicies: () =>
    apiClient.get<{ auto_policies: AutoPolicy[] }>('/access-control/auto-policy'),

  putAutoPolicy: (policy: AutoPolicy) =>
    apiClient.put('/access-control/auto-policy', policy),

  getStats: () =>
    apiClient.get<AccessControlStats>('/access-control/stats'),
};
