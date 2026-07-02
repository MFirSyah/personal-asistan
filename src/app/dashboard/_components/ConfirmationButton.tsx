'use client';

import React, { useState } from 'react';

interface ConfirmationData {
  action_type: string;
  table_name: string;
  intent: string;
  statement: string;
  message: string;
}

interface ConfirmationButtonProps {
  confirmationData: ConfirmationData;
  onConfirmed: () => void;
  onCancelled: () => void;
  apiBaseUrl: string;
  accessToken: string;
}

export default function ConfirmationButton({
  confirmationData,
  onConfirmed,
  onCancelled,
  apiBaseUrl,
  accessToken
}: ConfirmationButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Create pending action first
      const createResponse = await fetch(`${apiBaseUrl}/api/v1/pending-actions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'x-jarvis-gateway-key': 'jarvis-super-secret-key-2026',
        },
        body: JSON.stringify({
          action_type: confirmationData.action_type,
          table_name: confirmationData.table_name,
          statement: confirmationData.statement,
          intent: confirmationData.intent,
        }),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json();
        throw new Error(errorData.error || 'Failed to create pending action');
      }

      const createResult = await createResponse.json();

      // Then approve it
      const approveResponse = await fetch(`${apiBaseUrl}/api/v1/pending-actions/${createResult.pending_action.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'x-jarvis-gateway-key': 'jarvis-super-secret-key-2026',
        },
        body: JSON.stringify({}),
      });

      if (!approveResponse.ok) {
        const errorData = await approveResponse.json();
        throw new Error(errorData.error || 'Failed to approve action');
      }

      const approveResult = await approveResponse.json();

      if (approveResult.success) {
        onConfirmed();
      } else {
        throw new Error(approveResult.message || 'Action execution failed');
      }
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Create pending action to get ID, then reject
      const createResponse = await fetch(`${apiBaseUrl}/api/v1/pending-actions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'x-jarvis-gateway-key': 'jarvis-super-secret-key-2026',
        },
        body: JSON.stringify({
          action_type: confirmationData.action_type,
          table_name: confirmationData.table_name,
          statement: confirmationData.statement,
          intent: confirmationData.intent,
        }),
      });

      if (createResponse.ok) {
        const createResult = await createResponse.json();
        // Reject it
        await fetch(`${apiBaseUrl}/api/v1/pending-actions/${createResult.pending_action.id}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'x-jarvis-gateway-key': 'jarvis-super-secret-key-2026',
          },
          body: JSON.stringify({}),
        });
      }
    } catch (err) {
      console.error('Cancel error:', err);
    } finally {
      setIsLoading(false);
      onCancelled();
    }
  };

  return (
    <div className="confirmation-button-container">
      <div className="confirmation-content">
        <div className="warning-icon">⚠️</div>
        <p className="confirmation-message">{confirmationData.message}</p>
        <p className="confirmation-warning">Aksi ini tidak dapat dibatalkan!</p>
      </div>

      {error && (
        <div className="error-message">{error}</div>
      )}

      <div className="button-row">
        <button
          type="button"
          className="btn-cancel"
          onClick={handleCancel}
          disabled={isLoading}
        >
          {isLoading ? 'Membatalkan...' : 'Batal'}
        </button>
        <button
          type="button"
          className="btn-confirm"
          onClick={handleConfirm}
          disabled={isLoading}
        >
          {isLoading ? 'Memproses...' : 'Ya, Lanjutkan'}
        </button>
      </div>

      <style jsx>{`
        .confirmation-button-container {
          margin-top: 12px;
          padding: 16px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 12px;
        }

        .confirmation-content {
          text-align: center;
          margin-bottom: 16px;
        }

        .warning-icon {
          font-size: 2rem;
          margin-bottom: 8px;
        }

        .confirmation-message {
          color: #F1F5F9;
          font-size: 0.95rem;
          margin: 0 0 4px 0;
        }

        .confirmation-warning {
          color: #EF4444;
          font-size: 0.85rem;
          margin: 0;
          font-weight: 600;
        }

        .error-message {
          color: #EF4444;
          font-size: 0.85rem;
          text-align: center;
          margin-bottom: 12px;
          padding: 8px;
          background: rgba(239, 68, 68, 0.1);
          border-radius: 8px;
        }

        .button-row {
          display: flex;
          gap: 12px;
        }

        .btn-cancel,
        .btn-confirm {
          flex: 1;
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
        }

        .btn-cancel {
          background: rgba(255, 255, 255, 0.1);
          color: #94A3B8;
        }

        .btn-cancel:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.15);
          color: #F1F5F9;
        }

        .btn-confirm {
          background: #EF4444;
          color: white;
        }

        .btn-confirm:hover:not(:disabled) {
          background: #DC2626;
        }

        .btn-cancel:disabled,
        .btn-confirm:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
