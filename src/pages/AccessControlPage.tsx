import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useAuthStore, useModelsStore } from '@/stores';
import { accessControlApi } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { AutocompleteInput } from '@/components/ui/AutocompleteInput';
import { EmptyState } from '@/components/ui/EmptyState';
import type { ModelPolicy, IPRecord, AutoPolicy, IPStats, ClientEntry, ClientWhitelistState, ClientPreset } from '@/types';
import styles from './AccessControlPage.module.scss';

const MODEL_ACTION_OPTIONS = [
  { value: 'allow', label: 'Allow' },
  { value: 'deny', label: 'Deny' },
  { value: 'route', label: 'Route' },
  { value: 'channel', label: 'Channel' },
] as const;

const IP_STATUS_OPTIONS = [
  { value: 'banned', label: 'Banned' },
  { value: 'risk_controlled', label: 'Risk Controlled' },
  { value: 'normal', label: 'Normal' },
] as const;

const AUTO_POLICY_TYPE_OPTIONS = [
  { value: 'invalid_model', label: 'Invalid Model' },
  { value: 'invalid_apikey', label: 'Invalid API Key' },
] as const;

const AUTO_POLICY_ACTION_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'ban', label: 'Ban IP' },
  { value: 'risk_control', label: 'Risk Control IP' },
] as const;

const REASON_PRESETS = [
  'Abuse / Excessive requests',
  'Unauthorized access attempt',
  'Model not available for this tier',
  'Temporary maintenance',
];

export function AccessControlPage() {
  const { t } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const apiBase = useAuthStore((state) => state.apiBase);
  const disabled = connectionStatus !== 'connected';

  const { models: modelList, fetchModels } = useModelsStore();

  const [modelPolicies, setModelPolicies] = useState<ModelPolicy[]>([]);
  const [ipRecords, setIPRecords] = useState<IPRecord[]>([]);
  const [autoPolicies, setAutoPolicies] = useState<AutoPolicy[]>([]);
  const [ipStats, setIPStats] = useState<IPStats[]>([]);
  const [clientWhitelist, setClientWhitelist] = useState<ClientWhitelistState>({ active: false, entries: [] });
  const [clientPresets, setClientPresets] = useState<ClientPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<ModelPolicy | null>(null);
  const [modelForm, setModelForm] = useState({
    model: '',
    action: 'deny' as ModelPolicy['action'],
    route_to: '',
    channel_to: '',
    reason: '',
    max_rpm: 0,
  });

  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientEntry | null>(null);
  const [clientForm, setClientForm] = useState({
    client_id: '',
    label: '',
    note: '',
    enabled: true,
  });

  const [ipModalOpen, setIPModalOpen] = useState(false);
  const [editingIP, setEditingIP] = useState<IPRecord | null>(null);
  const [ipForm, setIPForm] = useState({
    ip: '',
    status: 'banned' as IPRecord['status'],
    reason: '',
    duration: 0,
  });

  const [autoPolicyModalOpen, setAutoPolicyModalOpen] = useState(false);
  const [editingAutoPolicy, setEditingAutoPolicy] = useState<AutoPolicy | null>(null);
  const [autoPolicyForm, setAutoPolicyForm] = useState({
    type: 'invalid_model' as AutoPolicy['type'],
    threshold: 50,
    window_seconds: 300,
    action: 'none' as AutoPolicy['action'],
    duration_seconds: 0,
  });

  useEffect(() => {
    if (apiBase && !disabled) {
      fetchModels(apiBase).catch(() => {});
    }
  }, [apiBase, disabled, fetchModels]);

  const modelOptions = useMemo(() => {
    return modelList.map((m) => ({
      value: m.name,
      label: m.name,
    }));
  }, [modelList]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [modelsRes, ipsRes, autoRes, statsRes, clientRes, presetsRes] = await Promise.allSettled([
        accessControlApi.getModelPolicies(),
        accessControlApi.getIPRecords(),
        accessControlApi.getAutoPolicies(),
        accessControlApi.getStats(),
        accessControlApi.getClientWhitelist(),
        accessControlApi.getClientPresets(),
      ]);
      if (modelsRes.status === 'fulfilled') setModelPolicies(modelsRes.value?.model_policies || []);
      if (ipsRes.status === 'fulfilled') setIPRecords(ipsRes.value?.ip_records || []);
      if (autoRes.status === 'fulfilled') setAutoPolicies(autoRes.value?.auto_policies || []);
      if (statsRes.status === 'fulfilled') {
        const statsMap = statsRes.value?.stats || {};
        setIPStats(
          Object.entries(statsMap).map(([ip, counts]) => ({
            ip,
            invalid_model_count: counts.invalid_model_count || 0,
            invalid_apikey_count: counts.invalid_apikey_count || 0,
          }))
        );
      }
      if (clientRes.status === 'fulfilled' && clientRes.value) {
        setClientWhitelist({ active: clientRes.value.active ?? false, entries: clientRes.value.entries || [] });
      }
      if (presetsRes.status === 'fulfilled') setClientPresets(presetsRes.value?.presets || []);

      const firstRejected = [modelsRes, ipsRes, autoRes, statsRes].find(
        (r) => r.status === 'rejected'
      );
      if (firstRejected && firstRejected.status === 'rejected') {
        const reason = firstRejected.reason;
        setError(reason instanceof Error ? reason.message : t('access_control.load_failed'));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('access_control.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useHeaderRefresh(loadData);

  useEffect(() => {
    if (!disabled) loadData();
  }, [disabled, loadData]);

  const actionBadgeClass = (action: string) => {
    switch (action) {
      case 'allow': return styles.badgeAllow;
      case 'deny': return styles.badgeDeny;
      case 'route': return styles.badgeRoute;
      case 'channel': return styles.badgeChannel;
      default: return '';
    }
  };

  const statusBadgeClass = (status: string) => {
    switch (status) {
      case 'normal': return styles.badgeNormal;
      case 'banned': return styles.badgeBanned;
      case 'risk_controlled': return styles.badgeRiskControlled;
      default: return '';
    }
  };

  const openAddModelPolicy = () => {
    setEditingModel(null);
    setModelForm({ model: '', action: 'deny', route_to: '', channel_to: '', reason: '', max_rpm: 0 });
    setModelModalOpen(true);
  };

  const openEditModelPolicy = (policy: ModelPolicy) => {
    setEditingModel(policy);
    setModelForm({
      model: policy.model,
      action: policy.action,
      route_to: policy.route_to,
      channel_to: policy.channel_to,
      reason: policy.reason,
      max_rpm: policy.max_rpm || 0,
    });
    setModelModalOpen(true);
  };

  const handleSaveModelPolicy = async () => {
    if (!modelForm.model.trim()) return;
    try {
      await accessControlApi.putModelPolicy({
        model: modelForm.model.trim(),
        action: modelForm.action,
        route_to: modelForm.route_to.trim(),
        channel_to: modelForm.channel_to.trim(),
        reason: modelForm.reason.trim(),
        max_rpm: modelForm.max_rpm || 0,
      });
      setModelModalOpen(false);
      await loadData();
    } catch {
      // error handled by loadData
    }
  };

  const openAddClientEntry = () => {
    setEditingClient(null);
    setClientForm({ client_id: '', label: '', note: '', enabled: true });
    setClientModalOpen(true);
  };

  const openEditClientEntry = (entry: ClientEntry) => {
    setEditingClient(entry);
    setClientForm({ client_id: entry.client_id, label: entry.label, note: entry.note, enabled: entry.enabled });
    setClientModalOpen(true);
  };

  const handleSaveClientEntry = async () => {
    if (!clientForm.client_id.trim()) return;
    try {
      await accessControlApi.upsertClientEntry({
        client_id: clientForm.client_id.trim(),
        label: clientForm.label.trim() || clientForm.client_id.trim(),
        note: clientForm.note.trim(),
        enabled: clientForm.enabled,
      });
      setClientModalOpen(false);
      await loadData();
    } catch {
      // silent
    }
  };

  const handleDeleteClientEntry = async (clientId: string) => {
    if (!confirm(t('access_control.delete_client_confirm', { client: clientId }))) return;
    try {
      await accessControlApi.deleteClientEntry(clientId);
      await loadData();
    } catch {
      // silent
    }
  };

  const handleToggleClientWhitelist = async () => {
    try {
      await accessControlApi.setClientWhitelistActive(!clientWhitelist.active);
      await loadData();
    } catch {
      // silent
    }
  };

  const presetsNotInList = useMemo(() => {
    const existingIds = new Set(clientWhitelist.entries.map((e) => e.client_id));
    return clientPresets.filter((p) => !existingIds.has(p.ID));
  }, [clientPresets, clientWhitelist.entries]);

  const handleDeleteModelPolicy = async (model: string) => {
    if (!confirm(t('access_control.delete_model_policy_confirm', { model }))) return;
    try {
      await accessControlApi.deleteModelPolicy(model);
      await loadData();
    } catch {
      // silent
    }
  };

  const openAddIPRecord = () => {
    setEditingIP(null);
    setIPForm({ ip: '', status: 'banned', reason: '', duration: 0 });
    setIPModalOpen(true);
  };

  const openEditIPRecord = (record: IPRecord) => {
    setEditingIP(record);
    setIPForm({
      ip: record.ip,
      status: record.status,
      reason: record.reason,
      duration: 0,
    });
    setIPModalOpen(true);
  };

  const handleSaveIPRecord = async () => {
    if (!ipForm.ip.trim()) return;
    try {
      const action = ipForm.status === 'banned' ? 'ban'
        : ipForm.status === 'risk_controlled' ? 'risk_control'
        : 'unban';
      await accessControlApi.putIPRecord({
        ip: ipForm.ip.trim(),
        action,
        reason: ipForm.reason.trim(),
        duration_seconds: ipForm.duration || undefined,
      });
      setIPModalOpen(false);
      await loadData();
    } catch {
      // silent
    }
  };

  const handleDeleteIPRecord = async (ip: string) => {
    if (!confirm(t('access_control.delete_ip_record_confirm', { ip }))) return;
    try {
      await accessControlApi.deleteIPRecord(ip);
      await loadData();
    } catch {
      // silent
    }
  };

  const existingAutoPolicyTypes = useMemo(
    () => new Set(autoPolicies.map((p) => p.type)),
    [autoPolicies]
  );

  const canAddAutoPolicy = existingAutoPolicyTypes.size < 2;

  const openAddAutoPolicy = () => {
    const missingType = !existingAutoPolicyTypes.has('invalid_model')
      ? 'invalid_model'
      : !existingAutoPolicyTypes.has('invalid_apikey')
        ? 'invalid_apikey'
        : 'invalid_model';
    setEditingAutoPolicy(null);
    setAutoPolicyForm({
      type: missingType as AutoPolicy['type'],
      threshold: missingType === 'invalid_model' ? 50 : 20,
      window_seconds: 300,
      action: 'none',
      duration_seconds: 0,
    });
    setAutoPolicyModalOpen(true);
  };

  const openEditAutoPolicy = (policy: AutoPolicy) => {
    setEditingAutoPolicy(policy);
    setAutoPolicyForm({
      type: policy.type,
      threshold: policy.threshold,
      window_seconds: policy.window_seconds,
      action: policy.action,
      duration_seconds: policy.duration_seconds,
    });
    setAutoPolicyModalOpen(true);
  };

  const handleSaveAutoPolicy = async () => {
    try {
      await accessControlApi.putAutoPolicy(autoPolicyForm);
      setAutoPolicyModalOpen(false);
      await loadData();
    } catch {
      // silent
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return t('access_control.expires_permanent');
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  };

  const availableAutoPolicyTypeOptions = useMemo(() => {
    if (editingAutoPolicy) return AUTO_POLICY_TYPE_OPTIONS.map((o) => ({ ...o }));
    return AUTO_POLICY_TYPE_OPTIONS
      .filter((o) => !existingAutoPolicyTypes.has(o.value))
      .map((o) => ({ ...o }));
  }, [editingAutoPolicy, existingAutoPolicyTypes]);

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('access_control.title')}</h1>
        <p className={styles.description}>{t('access_control.description')}</p>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      {/* Model Policies */}
      <Card
        title={
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>{t('access_control.model_policies_title')}</h2>
              <p className={styles.sectionDesc}>{t('access_control.model_policies_desc')}</p>
            </div>
            <Button size="sm" onClick={openAddModelPolicy} disabled={disabled}>
              {t('access_control.add_model_policy')}
            </Button>
          </div>
        }
      >
        {loading ? (
          <p>{t('common.loading')}</p>
        ) : modelPolicies.length === 0 ? (
          <EmptyState title={t('access_control.no_model_policies')} />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('access_control.model')}</th>
                  <th>{t('access_control.action')}</th>
                  <th>{t('access_control.route_to')}</th>
                  <th>{t('access_control.channel_to')}</th>
                  <th>{t('access_control.reason')}</th>
                  <th>{t('common.action')}</th>
                </tr>
              </thead>
              <tbody>
                {modelPolicies.map((policy) => (
                  <tr key={policy.model}>
                    <td className={styles.mono}>{policy.model}</td>
                    <td>
                      <span className={`${styles.badge} ${actionBadgeClass(policy.action)}`}>
                        {t(`access_control.action_${policy.action}`)}
                      </span>
                    </td>
                    <td className={styles.mono}>{policy.route_to || '-'}</td>
                    <td className={styles.mono}>{policy.channel_to || '-'}</td>
                    <td className={styles.truncate}>{policy.reason || '-'}</td>
                    <td>
                      <div className={styles.actions}>
                        <Button size="sm" variant="ghost" onClick={() => openEditModelPolicy(policy)} disabled={disabled}>
                          {t('common.edit')}
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => handleDeleteModelPolicy(policy.model)} disabled={disabled}>
                          {t('common.delete')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* IP Records */}
      <Card
        title={
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>{t('access_control.ip_records_title')}</h2>
              <p className={styles.sectionDesc}>{t('access_control.ip_records_desc')}</p>
            </div>
            <Button size="sm" onClick={openAddIPRecord} disabled={disabled}>
              {t('access_control.add_ip_record')}
            </Button>
          </div>
        }
      >
        {loading ? (
          <p>{t('common.loading')}</p>
        ) : ipRecords.length === 0 ? (
          <EmptyState title={t('access_control.no_ip_records')} />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('access_control.ip')}</th>
                  <th>{t('access_control.status')}</th>
                  <th>{t('access_control.reason')}</th>
                  <th>{t('access_control.expires_at')}</th>
                  <th>{t('access_control.created_at')}</th>
                  <th>{t('common.action')}</th>
                </tr>
              </thead>
              <tbody>
                {ipRecords.map((record) => (
                  <tr key={record.ip}>
                    <td className={styles.mono}>{record.ip}</td>
                    <td>
                      <span className={`${styles.badge} ${statusBadgeClass(record.status)}`}>
                        {t(`access_control.status_${record.status}`)}
                      </span>
                    </td>
                    <td className={styles.truncate}>{record.reason || '-'}</td>
                    <td>{formatDate(record.expires_at)}</td>
                    <td>{formatDate(record.created_at)}</td>
                    <td>
                      <div className={styles.actions}>
                        <Button size="sm" variant="ghost" onClick={() => openEditIPRecord(record)} disabled={disabled}>
                          {t('common.edit')}
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => handleDeleteIPRecord(record.ip)} disabled={disabled}>
                          {t('common.delete')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Auto Policies */}
      <Card
        title={
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>{t('access_control.auto_policies_title')}</h2>
              <p className={styles.sectionDesc}>{t('access_control.auto_policies_desc')}</p>
            </div>
            {canAddAutoPolicy && (
              <Button size="sm" onClick={openAddAutoPolicy} disabled={disabled}>
                {t('access_control.add_auto_policy')}
              </Button>
            )}
          </div>
        }
      >
        {loading ? (
          <p>{t('common.loading')}</p>
        ) : autoPolicies.length === 0 ? (
          <EmptyState title={t('access_control.no_auto_policies')} />
        ) : (
          <div className={styles.autoPolicyGrid}>
            {autoPolicies.map((policy) => (
              <div key={policy.type} className={styles.autoPolicyCard}>
                <div className={styles.autoPolicyRow}>
                  <span className={styles.autoPolicyValue}>
                    {t(`access_control.type_${policy.type}`)}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => openEditAutoPolicy(policy)} disabled={disabled}>
                    {t('common.edit')}
                  </Button>
                </div>
                <div className={styles.autoPolicyRow}>
                  <span className={styles.autoPolicyLabel}>{t('access_control.threshold')}</span>
                  <span>{policy.threshold}</span>
                </div>
                <div className={styles.autoPolicyRow}>
                  <span className={styles.autoPolicyLabel}>{t('access_control.window_seconds')}</span>
                  <span>{policy.window_seconds}s</span>
                </div>
                <div className={styles.autoPolicyRow}>
                  <span className={styles.autoPolicyLabel}>{t('access_control.action')}</span>
                  <span className={`${styles.badge} ${policy.action === 'ban' ? styles.badgeBanned : policy.action === 'risk_control' ? styles.badgeRiskControlled : styles.badgeNormal}`}>
                    {policy.action}
                  </span>
                </div>
                <div className={styles.autoPolicyRow}>
                  <span className={styles.autoPolicyLabel}>{t('access_control.duration_seconds')}</span>
                  <span>{policy.duration_seconds === 0 ? t('access_control.expires_permanent') : `${policy.duration_seconds}s`}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Client Whitelist */}
      <Card
        title={
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>{t('access_control.client_whitelist_title')}</h2>
              <p className={styles.sectionDesc}>{t('access_control.client_whitelist_desc')}</p>
            </div>
            <div className={styles.actions}>
              <Button
                size="sm"
                variant={clientWhitelist.active ? 'danger' : 'ghost'}
                onClick={handleToggleClientWhitelist}
                disabled={disabled}
              >
                {clientWhitelist.active ? t('access_control.client_whitelist_disable') : t('access_control.client_whitelist_enable')}
              </Button>
              <Button size="sm" onClick={openAddClientEntry} disabled={disabled}>
                {t('access_control.add_client')}
              </Button>
            </div>
          </div>
        }
      >
        {clientWhitelist.active && (
          <div className={styles.activeNotice}>{t('access_control.client_whitelist_active_notice')}</div>
        )}
        {loading ? (
          <p>{t('common.loading')}</p>
        ) : clientWhitelist.entries.length === 0 ? (
          <EmptyState title={t('access_control.no_clients')} />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('access_control.client_id')}</th>
                  <th>{t('access_control.client_label')}</th>
                  <th>{t('access_control.status')}</th>
                  <th>{t('access_control.reason')}</th>
                  <th>{t('common.action')}</th>
                </tr>
              </thead>
              <tbody>
                {clientWhitelist.entries.map((entry) => (
                  <tr key={entry.client_id}>
                    <td className={styles.mono}>{entry.client_id}</td>
                    <td>{entry.label}</td>
                    <td>
                      <span className={`${styles.badge} ${entry.enabled ? styles.badgeAllow : styles.badgeDeny}`}>
                        {entry.enabled ? t('access_control.client_allowed') : t('access_control.client_denied')}
                      </span>
                    </td>
                    <td className={styles.truncate}>{entry.note || '-'}</td>
                    <td>
                      <div className={styles.actions}>
                        <Button size="sm" variant="ghost" onClick={() => openEditClientEntry(entry)} disabled={disabled}>
                          {t('common.edit')}
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => handleDeleteClientEntry(entry.client_id)} disabled={disabled}>
                          {t('common.delete')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* IP Statistics */}
      <Card
        title={
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>{t('access_control.stats_title')}</h2>
              <p className={styles.sectionDesc}>{t('access_control.stats_desc')}</p>
            </div>
          </div>
        }
      >
        {loading ? (
          <p>{t('common.loading')}</p>
        ) : ipStats.length === 0 ? (
          <EmptyState title={t('access_control.no_stats')} />
        ) : (
          <div className={styles.statsGrid}>
            {ipStats.map((stat) => (
              <div key={stat.ip} className={styles.statsCard}>
                <div className={styles.statsIp}>{stat.ip}</div>
                <div className={styles.statsRow}>
                  <span>{t('access_control.invalid_model_count')}</span>
                  <span className={styles.statsCount}>{stat.invalid_model_count}</span>
                </div>
                <div className={styles.statsRow}>
                  <span>{t('access_control.invalid_apikey_count')}</span>
                  <span className={styles.statsCount}>{stat.invalid_apikey_count}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Model Policy Modal */}
      <Modal
        open={modelModalOpen}
        title={editingModel ? t('access_control.edit_model_policy') : t('access_control.add_model_policy')}
        onClose={() => setModelModalOpen(false)}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setModelModalOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSaveModelPolicy} disabled={!modelForm.model.trim()}>{t('common.save')}</Button>
          </div>
        }
      >
        <div className={styles.formGroup}>
          <label>{t('access_control.model')}</label>
          {editingModel ? (
            <input value={modelForm.model} disabled />
          ) : (
            <AutocompleteInput
              value={modelForm.model}
              onChange={(v) => setModelForm((f) => ({ ...f, model: v }))}
              options={modelOptions}
              placeholder={t('access_control.model_placeholder')}
            />
          )}
        </div>
        <div className={styles.formGroup}>
          <label>{t('access_control.action')}</label>
          <Select
            value={modelForm.action}
            options={[...MODEL_ACTION_OPTIONS]}
            onChange={(v) => setModelForm((f) => ({ ...f, action: v as ModelPolicy['action'] }))}
          />
        </div>
        {modelForm.action === 'route' && (
          <div className={styles.formGroup}>
            <label>{t('access_control.route_to')}</label>
            <AutocompleteInput
              value={modelForm.route_to}
              onChange={(v) => setModelForm((f) => ({ ...f, route_to: v }))}
              options={modelOptions}
              placeholder={t('access_control.route_to_placeholder')}
            />
          </div>
        )}
        {modelForm.action === 'channel' && (
          <div className={styles.formGroup}>
            <label>{t('access_control.channel_to')}</label>
            <input
              value={modelForm.channel_to}
              onChange={(e) => setModelForm((f) => ({ ...f, channel_to: e.target.value }))}
              placeholder={t('access_control.channel_to_placeholder')}
            />
          </div>
        )}
        <div className={styles.formGroup}>
          <label>{t('access_control.reason')}</label>
          <AutocompleteInput
            value={modelForm.reason}
            onChange={(v) => setModelForm((f) => ({ ...f, reason: v }))}
            options={REASON_PRESETS}
            placeholder={t('access_control.reason_placeholder')}
          />
        </div>
        <div className={styles.formGroup}>
          <label>{t('access_control.max_rpm')}</label>
          <input
            type="number"
            value={modelForm.max_rpm}
            onChange={(e) => setModelForm((f) => ({ ...f, max_rpm: parseInt(e.target.value) || 0 }))}
            min={0}
          />
          <span className={styles.hint}>{t('access_control.max_rpm_hint')}</span>
        </div>
      </Modal>

      {/* IP Record Modal */}
      <Modal
        open={ipModalOpen}
        title={editingIP ? t('access_control.edit_ip_record') : t('access_control.add_ip_record')}
        onClose={() => setIPModalOpen(false)}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setIPModalOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSaveIPRecord} disabled={!ipForm.ip.trim()}>{t('common.save')}</Button>
          </div>
        }
      >
        <div className={styles.formGroup}>
          <label>{t('access_control.ip')}</label>
          <input
            value={ipForm.ip}
            onChange={(e) => setIPForm((f) => ({ ...f, ip: e.target.value }))}
            placeholder={t('access_control.ip_placeholder')}
            disabled={!!editingIP}
          />
        </div>
        <div className={styles.formGroup}>
          <label>{t('access_control.status')}</label>
          <Select
            value={ipForm.status}
            options={[...IP_STATUS_OPTIONS]}
            onChange={(v) => setIPForm((f) => ({ ...f, status: v as IPRecord['status'] }))}
          />
        </div>
        <div className={styles.formGroup}>
          <label>{t('access_control.duration')}</label>
          <input
            type="number"
            value={ipForm.duration}
            onChange={(e) => setIPForm((f) => ({ ...f, duration: parseInt(e.target.value) || 0 }))}
            min={0}
          />
          <span className={styles.hint}>{t('access_control.duration_hint')}</span>
        </div>
        <div className={styles.formGroup}>
          <label>{t('access_control.reason')}</label>
          <AutocompleteInput
            value={ipForm.reason}
            onChange={(v) => setIPForm((f) => ({ ...f, reason: v }))}
            options={REASON_PRESETS}
            placeholder={t('access_control.reason_placeholder')}
          />
        </div>
      </Modal>

      {/* Auto Policy Modal */}
      <Modal
        open={autoPolicyModalOpen}
        title={editingAutoPolicy ? t('access_control.edit_auto_policy') : t('access_control.add_auto_policy')}
        onClose={() => setAutoPolicyModalOpen(false)}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setAutoPolicyModalOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSaveAutoPolicy}>{t('common.save')}</Button>
          </div>
        }
      >
        <div className={styles.formGroup}>
          <label>{t('access_control.type')}</label>
          <Select
            value={autoPolicyForm.type}
            options={availableAutoPolicyTypeOptions}
            onChange={(v) => setAutoPolicyForm((f) => ({ ...f, type: v as AutoPolicy['type'] }))}
            disabled={!!editingAutoPolicy}
          />
        </div>
        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label>{t('access_control.threshold')}</label>
            <input
              type="number"
              value={autoPolicyForm.threshold}
              onChange={(e) => setAutoPolicyForm((f) => ({ ...f, threshold: parseInt(e.target.value) || 0 }))}
              min={1}
            />
          </div>
          <div className={styles.formGroup}>
            <label>{t('access_control.window_seconds')}</label>
            <input
              type="number"
              value={autoPolicyForm.window_seconds}
              onChange={(e) => setAutoPolicyForm((f) => ({ ...f, window_seconds: parseInt(e.target.value) || 0 }))}
              min={1}
            />
          </div>
        </div>
        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label>{t('access_control.action')}</label>
            <Select
              value={autoPolicyForm.action}
              options={[...AUTO_POLICY_ACTION_OPTIONS]}
              onChange={(v) => setAutoPolicyForm((f) => ({ ...f, action: v as AutoPolicy['action'] }))}
            />
          </div>
          <div className={styles.formGroup}>
            <label>{t('access_control.duration_seconds')}</label>
            <input
              type="number"
              value={autoPolicyForm.duration_seconds}
              onChange={(e) => setAutoPolicyForm((f) => ({ ...f, duration_seconds: parseInt(e.target.value) || 0 }))}
              min={0}
            />
            <span className={styles.hint}>{t('access_control.duration_hint')}</span>
          </div>
        </div>
      </Modal>
      {/* Client Entry Modal */}
      <Modal
        open={clientModalOpen}
        title={editingClient ? t('access_control.edit_client') : t('access_control.add_client')}
        onClose={() => setClientModalOpen(false)}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setClientModalOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSaveClientEntry} disabled={!clientForm.client_id.trim()}>{t('common.save')}</Button>
          </div>
        }
      >
        <div className={styles.formGroup}>
          <label>{t('access_control.client_id')}</label>
          {editingClient ? (
            <input value={clientForm.client_id} disabled />
          ) : (
            <AutocompleteInput
              value={clientForm.client_id}
              onChange={(v) => {
                const preset = clientPresets.find((p) => p.ID === v);
                setClientForm((f) => ({ ...f, client_id: v, label: preset ? preset.Label : f.label }));
              }}
              options={presetsNotInList.map((p) => ({ value: p.ID, label: `${p.ID} (${p.Label})` }))}
              placeholder={t('access_control.client_id_placeholder')}
            />
          )}
        </div>
        <div className={styles.formGroup}>
          <label>{t('access_control.client_label')}</label>
          <input
            value={clientForm.label}
            onChange={(e) => setClientForm((f) => ({ ...f, label: e.target.value }))}
            placeholder={t('access_control.client_label_placeholder')}
          />
        </div>
        <div className={styles.formGroup}>
          <label>{t('access_control.client_enabled')}</label>
          <Select
            value={clientForm.enabled ? 'true' : 'false'}
            options={[
              { value: 'true', label: t('access_control.client_allowed') },
              { value: 'false', label: t('access_control.client_denied') },
            ]}
            onChange={(v) => setClientForm((f) => ({ ...f, enabled: v === 'true' }))}
          />
        </div>
        <div className={styles.formGroup}>
          <label>{t('access_control.note')}</label>
          <input
            value={clientForm.note}
            onChange={(e) => setClientForm((f) => ({ ...f, note: e.target.value }))}
            placeholder={t('access_control.note_placeholder')}
          />
        </div>
      </Modal>
    </div>
  );
}
