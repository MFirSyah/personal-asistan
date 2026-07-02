'use client';

import React, { useEffect, useState } from 'react';

interface AnalysisPreferences {
  preferred_categories?: string[];
  exclude_categories?: string[];
  currency_format?: string;
  date_range?: string;
  savings_target_percent?: number;
  include_cash_flow?: boolean;
  include_leak_audit?: boolean;
  include_consistency?: boolean;
  include_priority_matrix?: boolean;
  include_runway_prediction?: boolean;
  include_risk_simulation?: boolean;
  include_burnout_detection?: boolean;
  include_mood_correlation?: boolean;
  include_worth_it_score?: boolean;
  analysis_frequency?: string;
  insight_detail_level?: string;
  prefer_visualizations?: boolean;
  prefer_action_plans?: boolean;
  notify_on_alerts?: boolean;
  alert_threshold_risk?: string;
}

interface InsightCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

const INSIGHT_TYPES = [
  { key: 'include_cash_flow', label: 'Arus Kas', icon: '💳', color: '#4CAF50' },
  { key: 'include_leak_audit', label: 'Audit Kebocoran', icon: '🔍', color: '#F59E0B' },
  { key: 'include_consistency', label: 'Konsistensi', icon: '📈', color: '#3B82F6' },
  { key: 'include_priority_matrix', label: 'Prioritas', icon: '🎯', color: '#8B5CF6' },
  { key: 'include_runway_prediction', label: 'Prediksi Dana', icon: '⏱️', color: '#EF4444' },
  { key: 'include_risk_simulation', label: 'Risiko Keuangan', icon: '⚠️', color: '#DC2626' },
  { key: 'include_burnout_detection', label: 'Deteksi Kejenuhan', icon: '🧘', color: '#EC4899' },
  { key: 'include_mood_correlation', label: 'Mood Correlation', icon: '💭', color: '#6366F1' },
  { key: 'include_worth_it_score', label: 'Worth-It Score', icon: '💎', color: '#F97316' },
];

export default function PreferencesPanel() {
  const [preferences, setPreferences] = useState<AnalysisPreferences | null>(null);
  const [categories, setCategories] = useState<InsightCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'insights' | 'output' | 'notifications'>('insights');

  useEffect(() => {
    fetchPreferences();
  }, []);

  const fetchPreferences = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/v1/user/preferences', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}`,
          'x-jarvis-gateway-key': 'jarvis-super-secret-key-2026',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setPreferences(data.preferences);
        setCategories(data.categories || []);
      }
    } catch (err) {
      console.error('Error fetching preferences:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const updatePreference = (key: string, value: any) => {
    setPreferences((prev) => prev ? { ...prev, [key]: value } : null);
    setSaveSuccess(false);
  };

  const savePreferences = async () => {
    if (!preferences) return;

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const response = await fetch('/api/v1/user/preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}`,
          'x-jarvis-gateway-key': 'jarvis-super-secret-key-2026',
        },
        body: JSON.stringify(preferences),
      });

      if (response.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        throw new Error('Failed to save preferences');
      }
    } catch (err: any) {
      setSaveError(err.message || 'Gagal menyimpan preferences');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleInsight = async (key: string, currentValue: boolean) => {
    const newValue = !currentValue;
    updatePreference(key, newValue);

    // Optimistic update
    try {
      await fetch('/api/v1/user/preferences', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}`,
          'x-jarvis-gateway-key': 'jarvis-super-secret-key-2026',
        },
        body: JSON.stringify({
          analysis_type: key.replace('include_', '').replace('_', '_'),
          enabled: newValue,
        }),
      });
    } catch (err) {
      console.error('Error toggling insight:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="preferences-panel loading">
        <div className="spinner"></div>
        <p>Memuat preferences...</p>
      </div>
    );
  }

  if (!preferences) {
    return (
      <div className="preferences-panel error">
        <p>❌ Gagal memuat preferences</p>
        <button className="btn btn-secondary" onClick={fetchPreferences}>
          Coba Lagi
        </button>
      </div>
    );
  }

  return (
    <div className="preferences-panel">
      <div className="preferences-header">
        <h3>⚙️ Preferensi Analisis</h3>
        <p>Kustomisasi insight yang ingin Anda terima</p>
      </div>

      {/* Tabs */}
      <div className="preferences-tabs">
        <button
          className={`tab-btn ${activeTab === 'insights' ? 'active' : ''}`}
          onClick={() => setActiveTab('insights')}
        >
          📊 Insight Types
        </button>
        <button
          className={`tab-btn ${activeTab === 'output' ? 'active' : ''}`}
          onClick={() => setActiveTab('output')}
        >
          ⚙️ Output Settings
        </button>
        <button
          className={`tab-btn ${activeTab === 'notifications' ? 'active' : ''}`}
          onClick={() => setActiveTab('notifications')}
        >
          🔔 Notifications
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'insights' && (
        <div className="tab-content">
          <div className="insight-toggles">
            {INSIGHT_TYPES.map((insight) => {
              const isEnabled = preferences[insight.key as keyof AnalysisPreferences] !== false;
              return (
                <div
                  key={insight.key}
                  className={`insight-card ${isEnabled ? 'enabled' : 'disabled'}`}
                  style={{ borderLeftColor: insight.color }}
                >
                  <div className="insight-info">
                    <span className="insight-icon">{insight.icon}</span>
                    <span className="insight-label">{insight.label}</span>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={() => toggleInsight(insight.key, isEnabled)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'output' && (
        <div className="tab-content">
          {/* Date Range */}
          <div className="setting-group">
            <label className="setting-label">📅 Rentang Analisis</label>
            <select
              value={preferences.date_range || 'month'}
              onChange={(e) => updatePreference('date_range', e.target.value)}
              className="setting-select"
            >
              <option value="week">Minggu ini</option>
              <option value="month">Bulan ini</option>
              <option value="quarter">Kuartal ini</option>
              <option value="year">Tahun ini</option>
            </select>
          </div>

          {/* Savings Target */}
          <div className="setting-group">
            <label className="setting-label">💰 Target Tabungan (%)</label>
            <div className="range-input">
              <input
                type="range"
                min="0"
                max="50"
                step="5"
                value={preferences.savings_target_percent || 20}
                onChange={(e) => updatePreference('savings_target_percent', parseInt(e.target.value))}
              />
              <span className="range-value">{preferences.savings_target_percent || 20}%</span>
            </div>
          </div>

          {/* Detail Level */}
          <div className="setting-group">
            <label className="setting-label">📝 Tingkat Detail</label>
            <select
              value={preferences.insight_detail_level || 'standard'}
              onChange={(e) => updatePreference('insight_detail_level', e.target.value)}
              className="setting-select"
            >
              <option value="brief">Singkatt - Poin utama saja</option>
              <option value="standard">Standar - Ringkasan dengan konteks</option>
              <option value="detailed">Detail - Penjelasan lengkap</option>
            </select>
          </div>

          {/* Toggle Options */}
          <div className="setting-group">
            <label className="toggle-setting">
              <input
                type="checkbox"
                checked={preferences.prefer_visualizations !== false}
                onChange={(e) => updatePreference('prefer_visualizations', e.target.checked)}
              />
              <span>📊 Saran Visual/Chart</span>
            </label>
          </div>

          <div className="setting-group">
            <label className="toggle-setting">
              <input
                type="checkbox"
                checked={preferences.prefer_action_plans !== false}
                onChange={(e) => updatePreference('prefer_action_plans', e.target.checked)}
              />
              <span>📋 Action Plans</span>
            </label>
          </div>
        </div>
      )}

      {activeTab === 'notifications' && (
        <div className="tab-content">
          <div className="setting-group">
            <label className="toggle-setting">
              <input
                type="checkbox"
                checked={preferences.notify_on_alerts !== false}
                onChange={(e) => updatePreference('notify_on_alerts', e.target.checked)}
              />
              <span>🔔 Notifikasi Alert</span>
            </label>
            <p className="setting-hint">
              Dapatkan notifikasi saat ada insight penting
            </p>
          </div>

          {preferences.notify_on_alerts !== false && (
            <div className="setting-group">
              <label className="setting-label">⚠️ Threshold Alert</label>
              <select
                value={preferences.alert_threshold_risk || 'high'}
                onChange={(e) => updatePreference('alert_threshold_risk', e.target.value)}
                className="setting-select"
              >
                <option value="low">Rendah - Notif semua</option>
                <option value="medium">Sedang - Notif penting</option>
                <option value="high">Tinggi - Hanya kritis</option>
              </select>
            </div>
          )}
        </div>
      )}

      {/* Save Button */}
      <div className="preferences-footer">
        {saveSuccess && (
          <span className="save-success">✅ Preferences tersimpan!</span>
        )}
        {saveError && (
          <span className="save-error">❌ {saveError}</span>
        )}
        <button
          className="btn"
          onClick={savePreferences}
          disabled={isSaving}
        >
          {isSaving ? 'Menyimpan...' : '💾 Simpan Preferences'}
        </button>
      </div>

      <style jsx>{`
        .preferences-panel {
          background: var(--card-bg, #1a1f2e);
          border-radius: 16px;
          padding: 24px;
          margin-top: 20px;
        }

        .preferences-panel.loading,
        .preferences-panel.error {
          text-align: center;
          padding: 40px;
          color: var(--text-secondary, #94A3B8);
        }

        .preferences-header {
          margin-bottom: 20px;
        }

        .preferences-header h3 {
          margin: 0 0 4px 0;
          font-size: 1.2rem;
          color: var(--text-primary, #F1F5F9);
        }

        .preferences-header p {
          margin: 0;
          font-size: 0.9rem;
          color: var(--text-secondary, #94A3B8);
        }

        .preferences-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          padding-bottom: 12px;
        }

        .tab-btn {
          background: transparent;
          border: none;
          color: var(--text-secondary, #94A3B8);
          padding: 8px 16px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.85rem;
          transition: all 0.2s;
        }

        .tab-btn:hover {
          background: rgba(255, 255, 255, 0.05);
        }

        .tab-btn.active {
          background: var(--color-primary, #3B82F6);
          color: white;
        }

        .tab-content {
          min-height: 200px;
        }

        .insight-toggles {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .insight-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 16px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 10px;
          border-left: 4px solid #6B7280;
          transition: all 0.2s;
        }

        .insight-card.enabled {
          background: rgba(255, 255, 255, 0.05);
        }

        .insight-card.disabled {
          opacity: 0.6;
        }

        .insight-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .insight-icon {
          font-size: 1.3rem;
        }

        .insight-label {
          font-size: 0.95rem;
          color: var(--text-primary, #F1F5F9);
        }

        /* Toggle Switch */
        .toggle-switch {
          position: relative;
          display: inline-block;
          width: 48px;
          height: 26px;
        }

        .toggle-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .toggle-slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(255, 255, 255, 0.1);
          transition: 0.3s;
          border-radius: 26px;
        }

        .toggle-slider:before {
          position: absolute;
          content: "";
          height: 20px;
          width: 20px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: 0.3s;
          border-radius: 50%;
        }

        .toggle-switch input:checked + .toggle-slider {
          background-color: var(--color-primary, #3B82F6);
        }

        .toggle-switch input:checked + .toggle-slider:before {
          transform: translateX(22px);
        }

        /* Settings */
        .setting-group {
          margin-bottom: 20px;
        }

        .setting-label {
          display: block;
          font-size: 0.9rem;
          color: var(--text-primary, #F1F5F9);
          margin-bottom: 8px;
        }

        .setting-select {
          width: 100%;
          padding: 10px 14px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: var(--text-primary, #F1F5F9);
          font-size: 0.9rem;
        }

        .setting-select:focus {
          outline: none;
          border-color: var(--color-primary, #3B82F6);
        }

        .range-input {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .range-input input[type="range"] {
          flex: 1;
          height: 6px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
          -webkit-appearance: none;
        }

        .range-input input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 20px;
          height: 20px;
          background: var(--color-primary, #3B82F6);
          border-radius: 50%;
          cursor: pointer;
        }

        .range-value {
          font-size: 1rem;
          font-weight: 600;
          color: var(--color-primary, #3B82F6);
          min-width: 45px;
        }

        .toggle-setting {
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          font-size: 0.95rem;
          color: var(--text-primary, #F1F5F9);
        }

        .toggle-setting input[type="checkbox"] {
          width: 18px;
          height: 18px;
          accent-color: var(--color-primary, #3B82F6);
        }

        .setting-hint {
          font-size: 0.8rem;
          color: var(--text-muted, #64748B);
          margin: 6px 0 0 30px;
        }

        .preferences-footer {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 16px;
          margin-top: 24px;
          padding-top: 16px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .save-success {
          color: var(--color-success, #10B981);
          font-size: 0.9rem;
        }

        .save-error {
          color: var(--color-danger, #EF4444);
          font-size: 0.9rem;
        }
      `}</style>
    </div>
  );
}
