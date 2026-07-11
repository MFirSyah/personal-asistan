'use client';

/**
 * AISuggestionsReview - Smart Backfill Review UI
 * Arsitektur Reference: Bagian 22.4, 22.5
 *
 * UI untuk review dan approve/reject saran AI
 * sebelum nilai masuk ke custom_fields record asli
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface Suggestion {
  id: string;
  table_name: string;
  record_id: string;
  field_key: string;
  suggested_value: {
    value: any;
    confidence: number;
    reasoning: string;
  };
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  created_at: string;
}

const fetcher = (url: string) => fetch(url).then(res => res.json());

export function AISuggestionsReview() {
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, error, isLoading, refetch: mutate } = useQuery({
    queryKey: ['/api/v1/data/suggestions', filter],
    queryFn: () => fetcher(`/api/v1/data/suggestions?status=${filter}`),
    refetchInterval: 10000
  });

  const suggestions: Suggestion[] = data?.suggestions || [];

  // Filter for display
  const pendingCount = suggestions.filter(s => s.status === 'pending').length;

  return (
    <div className="ai-suggestions-panel">
      <div className="suggestions-header">
        <div className="suggestions-title">
          <span className="title-icon">✨</span>
          <h3>AI Suggestions</h3>
          {pendingCount > 0 && (
            <span className="pending-badge">{pendingCount} pending</span>
          )}
        </div>
        <div className="filter-tabs">
          <button
            className={`filter-tab ${filter === 'pending' ? 'active' : ''}`}
            onClick={() => setFilter('pending')}
          >
            Pending
          </button>
          <button
            className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="suggestions-loading">
          <div className="spinner" />
          <p>Memuat saran AI...</p>
        </div>
      )}

      {error && (
        <div className="suggestions-error">
          <p>⚠️ Gagal memuat saran</p>
          <button onClick={() => mutate()} className="btn btn-secondary">
            🔄 Coba Lagi
          </button>
        </div>
      )}

      {!isLoading && !error && suggestions.length === 0 && (
        <div className="suggestions-empty">
          <span className="empty-icon">💡</span>
          <p>Tidak ada saran AI untuk ditinjau</p>
          <small>Saran akan muncul saat AI menganalisis data Anda</small>
        </div>
      )}

      <div className="suggestions-list">
        {suggestions.map((suggestion) => (
          <SuggestionCard
            key={suggestion.id}
            suggestion={suggestion}
            isExpanded={expandedId === suggestion.id}
            onToggle={() => setExpandedId(expandedId === suggestion.id ? null : suggestion.id)}
            onApprove={() => handleSuggestionAction(suggestion.id, 'approve', queryClient)}
            onReject={() => handleSuggestionAction(suggestion.id, 'reject', queryClient)}
          />
        ))}
      </div>

      <style jsx>{`
        .ai-suggestions-panel {
          background: var(--card-bg, #1F2937);
          border-radius: 16px;
          padding: 20px;
          margin-top: 20px;
        }

        .suggestions-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .suggestions-title {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .title-icon {
          font-size: 1.3rem;
        }

        .suggestions-title h3 {
          margin: 0;
          font-size: 1.1rem;
          color: var(--text-primary, #F1F5F9);
        }

        .pending-badge {
          background: rgba(245, 158, 11, 0.2);
          color: #F59E0B;
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .filter-tabs {
          display: flex;
          gap: 8px;
        }

        .filter-tab {
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: var(--text-secondary, #94A3B8);
          padding: 6px 14px;
          border-radius: 8px;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .filter-tab:hover {
          background: rgba(255, 255, 255, 0.05);
        }

        .filter-tab.active {
          background: var(--color-primary, #3B82F6);
          border-color: var(--color-primary, #3B82F6);
          color: white;
        }

        .suggestions-loading,
        .suggestions-error,
        .suggestions-empty {
          text-align: center;
          padding: 40px 20px;
          color: var(--text-secondary, #94A3B8);
        }

        .empty-icon {
          font-size: 2.5rem;
          display: block;
          margin-bottom: 12px;
        }

        .suggestions-empty small {
          color: var(--text-muted, #64748B);
          display: block;
          margin-top: 4px;
        }

        .suggestions-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// Suggestion Card Component
// ============================================================================

interface SuggestionCardProps {
  suggestion: Suggestion;
  isExpanded: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onReject: () => void;
}

function SuggestionCard({ suggestion, isExpanded, onToggle, onApprove, onReject }: SuggestionCardProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAction = async (action: 'approve' | 'reject') => {
    setIsProcessing(true);
    try {
      await (action === 'approve' ? onApprove() : onReject());
    } finally {
      setIsProcessing(false);
    }
  };

  const confidencePercent = Math.round((suggestion.suggested_value.confidence || 0) * 100);
  const confidenceColor = confidencePercent >= 80
    ? '#10B981' // green
    : confidencePercent >= 40
    ? '#F59E0B' // yellow
    : '#EF4444'; // red

  const statusBadge = {
    pending: { bg: 'rgba(245, 158, 11, 0.2)', color: '#F59E0B', text: 'Pending' },
    approved: { bg: 'rgba(16, 185, 129, 0.2)', color: '#10B981', text: 'Approved' },
    rejected: { bg: 'rgba(239, 68, 68, 0.2)', color: '#EF4444', text: 'Rejected' },
    expired: { bg: 'rgba(100, 116, 139, 0.2)', color: '#64748B', text: 'Expired' },
  }[suggestion.status];

  return (
    <div className={`suggestion-card ${isExpanded ? 'expanded' : ''} ${suggestion.status !== 'pending' ? 'processed' : ''}`}>
      <div className="card-main" onClick={onToggle}>
        <div className="card-header">
          <div className="field-info">
            <span className="field-key">{suggestion.field_key}</span>
            <span className="table-name">{suggestion.table_name}</span>
          </div>
          <div className="meta-info">
            <span
              className="confidence-badge"
              style={{ background: `${confidenceColor}20`, color: confidenceColor }}
            >
              ✨ {confidencePercent}%
            </span>
            <span
              className="status-badge"
              style={{ background: statusBadge.bg, color: statusBadge.color }}
            >
              {statusBadge.text}
            </span>
          </div>
        </div>

        <div className="suggested-value">
          <span className="value-label">Suggested value:</span>
          <span className="value-content">
            {typeof suggestion.suggested_value.value === 'object'
              ? JSON.stringify(suggestion.suggested_value.value)
              : String(suggestion.suggested_value.value || '-')}
          </span>
        </div>

        <div className="expand-hint">
          {isExpanded ? '▲ Sembunyikan' : '▼ Lihat detail'}
        </div>
      </div>

      {isExpanded && (
        <div className="card-details">
          {suggestion.suggested_value.reasoning && (
            <div className="reasoning-section">
              <h5>💭 Reasoning AI</h5>
              <p>{suggestion.suggested_value.reasoning}</p>
            </div>
          )}

          <div className="record-info">
            <span>Record ID: {suggestion.record_id}</span>
            <span>Dibuat: {new Date(suggestion.created_at).toLocaleString('id-ID')}</span>
          </div>

          {suggestion.status === 'pending' && (
            <div className="action-buttons">
              <button
                className="btn-approve"
                onClick={() => handleAction('approve')}
                disabled={isProcessing}
              >
                {isProcessing ? '⏳' : '✅'} Terima
              </button>
              <button
                className="btn-reject"
                onClick={() => handleAction('reject')}
                disabled={isProcessing}
              >
                {isProcessing ? '⏳' : '❌'} Tolak
              </button>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .suggestion-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          overflow: hidden;
          transition: all 0.2s;
        }

        .suggestion-card:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.12);
        }

        .suggestion-card.processed {
          opacity: 0.7;
        }

        .suggestion-card.expanded {
          border-color: rgba(59, 130, 246, 0.3);
        }

        .card-main {
          padding: 14px;
          cursor: pointer;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 10px;
        }

        .field-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .field-key {
          font-weight: 600;
          color: var(--text-primary, #F1F5F9);
          font-size: 0.95rem;
        }

        .table-name {
          font-size: 0.75rem;
          color: var(--text-muted, #64748B);
        }

        .meta-info {
          display: flex;
          gap: 8px;
        }

        .confidence-badge,
        .status-badge {
          padding: 3px 8px;
          border-radius: 6px;
          font-size: 0.7rem;
          font-weight: 500;
        }

        .suggested-value {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 8px;
          margin-bottom: 8px;
        }

        .value-label {
          font-size: 0.75rem;
          color: var(--text-muted, #64748B);
        }

        .value-content {
          font-size: 0.85rem;
          color: var(--text-primary, #F1F5F9);
          font-weight: 500;
        }

        .expand-hint {
          font-size: 0.75rem;
          color: var(--text-muted, #64748B);
          text-align: center;
        }

        .card-details {
          padding: 14px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          background: rgba(0, 0, 0, 0.2);
        }

        .reasoning-section {
          margin-bottom: 12px;
        }

        .reasoning-section h5 {
          margin: 0 0 8px 0;
          font-size: 0.85rem;
          color: var(--text-secondary, #94A3B8);
        }

        .reasoning-section p {
          margin: 0;
          font-size: 0.85rem;
          color: var(--text-primary, #F1F5F9);
          line-height: 1.5;
        }

        .record-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 0.75rem;
          color: var(--text-muted, #64748B);
          margin-bottom: 14px;
        }

        .action-buttons {
          display: flex;
          gap: 10px;
        }

        .btn-approve,
        .btn-reject {
          flex: 1;
          padding: 10px 16px;
          border: none;
          border-radius: 8px;
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-approve {
          background: rgba(16, 185, 129, 0.2);
          color: #10B981;
        }

        .btn-approve:hover:not(:disabled) {
          background: rgba(16, 185, 129, 0.3);
        }

        .btn-reject {
          background: rgba(239, 68, 68, 0.2);
          color: #EF4444;
        }

        .btn-reject:hover:not(:disabled) {
          background: rgba(239, 68, 68, 0.3);
        }

        .btn-approve:disabled,
        .btn-reject:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// Action Handler
// ============================================================================

async function handleSuggestionAction(
  suggestionId: string,
  action: 'approve' | 'reject',
  queryClient: any
) {
  try {
    const response = await fetch(`/api/v1/data/suggestions/${suggestionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });

    if (!response.ok) {
      throw new Error('Failed to process suggestion');
    }

    // Invalidate queries to refresh the list
    queryClient.invalidateQueries({ queryKey: ['/api/v1/data/suggestions'] });
  } catch (error) {
    console.error('Error processing suggestion:', error);
    alert('Gagal memproses saran. Silakan coba lagi.');
  }
}

export default AISuggestionsReview;
