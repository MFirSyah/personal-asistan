'use client';

import React, { useEffect, useState } from 'react';

interface SchemaTable {
  table_name: string;
  columns?: Array<{
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }>;
  primary_key?: string[];
  foreign_keys?: Array<{
    column: string;
    foreign_table: string;
    foreign_column: string;
  }>;
  metadata?: {
    name: string;
    description: string;
    icon: string;
    color: string;
    commonActions: string[];
    fields: Record<string, any>;
  };
}

interface SchemaData {
  success: boolean;
  tables: SchemaTable[];
  cached?: boolean;
  generated_at?: string;
}

/**
 * SchemaReader Component
 * Dynamic database schema viewer for the dashboard
 */
export default function SchemaReader() {
  const [schema, setSchema] = useState<SchemaData | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'detail'>('overview');

  useEffect(() => {
    fetchSchema();
  }, []);

  const fetchSchema = async (refresh = false) => {
    setIsLoading(true);
    setError(null);

    try {
      const url = `/api/v1/schema${refresh ? '?refresh=true' : ''}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Failed to fetch schema');
      }

      const data = await response.json();
      setSchema(data);

      // Auto-select first table if none selected
      if (!selectedTable && data.tables?.length > 0) {
        setSelectedTable(data.tables[0].table_name);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load schema');
    } finally {
      setIsLoading(false);
    }
  };

  const selectedTableData = schema?.tables?.find(t => t.table_name === selectedTable);

  if (isLoading) {
    return (
      <div className="schema-reader loading">
        <div className="spinner"></div>
        <p>Memuat schema database...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="schema-reader error">
        <p>❌ Error: {error}</p>
        <button className="btn btn-secondary" onClick={() => fetchSchema(true)}>
          Coba Lagi
        </button>
      </div>
    );
  }

  if (!schema?.tables) {
    return (
      <div className="schema-reader empty">
        <p>Tidak ada data schema tersedia</p>
      </div>
    );
  }

  return (
    <div className="schema-reader">
      <div className="schema-header">
        <h3>📊 Struktur Database</h3>
        <div className="schema-actions">
          <span className="cache-indicator">
            {schema.cached ? '⚡ Cached' : '🔄 Fresh'}
          </span>
          <button
            className="btn btn-secondary btn-small"
            onClick={() => fetchSchema(true)}
            title="Refresh schema"
          >
            🔄
          </button>
        </div>
      </div>

      <div className="schema-tabs">
        <button
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📋 Overview
        </button>
        <button
          className={`tab-btn ${activeTab === 'detail' ? 'active' : ''}`}
          onClick={() => setActiveTab('detail')}
        >
          🔍 Detail Tabel
        </button>
      </div>

      {activeTab === 'overview' ? (
        <div className="schema-overview">
          <p className="schema-description">
            {schema.tables.length} tabel ditemukan. Schema terakhir diupdate:{' '}
            {schema.generated_at ? new Date(schema.generated_at).toLocaleString('id-ID') : 'N/A'}
          </p>

          <div className="table-cards">
            {schema.tables.map((table) => (
              <div
                key={table.table_name}
                className={`table-card ${selectedTable === table.table_name ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedTable(table.table_name);
                  setActiveTab('detail');
                }}
                style={{ borderLeftColor: table.metadata?.color || '#6B7280' }}
              >
                <div className="table-card-header">
                  <span className="table-icon">{table.metadata?.icon || '📊'}</span>
                  <span className="table-name">{table.metadata?.name || table.table_name}</span>
                </div>
                <p className="table-desc">{table.metadata?.description || table.table_name}</p>
                <div className="table-meta">
                  <span className="column-count">
                    {table.columns?.length || 0} kolom
                  </span>
                  {table.primary_key && (
                    <span className="pk-badge">PK</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="schema-detail">
          <div className="table-selector">
            <label>Pilih Tabel:</label>
            <select
              value={selectedTable || ''}
              onChange={(e) => setSelectedTable(e.target.value)}
            >
              {schema.tables.map((table) => (
                <option key={table.table_name} value={table.table_name}>
                  {table.metadata?.icon || '📊'} {table.metadata?.name || table.table_name}
                </option>
              ))}
            </select>
          </div>

          {selectedTableData && (
            <div className="table-detail-content">
              <div className="table-info-header">
                <h4>
                  {selectedTableData.metadata?.icon || '📊'}{' '}
                  {selectedTableData.metadata?.name || selectedTable}
                </h4>
                <span
                  className="category-badge"
                  style={{ backgroundColor: selectedTableData.metadata?.color || '#6B7280' }}
                >
                  {selectedTable}
                </span>
              </div>

              {selectedTableData.metadata?.description && (
                <p className="table-description">
                  {selectedTableData.metadata.description}
                </p>
              )}

              {/* Columns Table */}
              <div className="columns-section">
                <h5>📑 Kolom</h5>
                <table className="schema-table">
                  <thead>
                    <tr>
                      <th>Nama Kolom</th>
                      <th>Tipe Data</th>
                      <thNullable>Nullable</th>
                      <th>Default</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTableData.columns?.map((col) => {
                      const fieldMeta = selectedTableData.metadata?.fields?.[col.column_name];
                      const isPrimaryKey = selectedTableData.primary_key?.includes(col.column_name);

                      return (
                        <tr key={col.column_name} className={isPrimaryKey ? 'pk-row' : ''}>
                          <td>
                            <span className="column-name">
                              {fieldMeta?.label || col.column_name}
                              {isPrimaryKey && <span className="pk-indicator">🔑</span>}
                            </span>
                          </td>
                          <td>
                            <span className={`data-type type-${col.data_type}`}>
                              {col.data_type}
                            </span>
                          </td>
                          <td>
                            {col.is_nullable === 'YES' ? (
                              <span className="nullable-yes">✓</span>
                            ) : (
                              <span className="nullable-no">✗</span>
                            )}
                          </td>
                          <td>
                            <code className="default-value">
                              {col.column_default || '-'}
                            </code>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Foreign Keys */}
              {selectedTableData.foreign_keys && selectedTableData.foreign_keys.length > 0 && (
                <div className="foreign-keys-section">
                  <h5>🔗 Foreign Keys</h5>
                  <div className="fk-list">
                    {selectedTableData.foreign_keys.map((fk, idx) => (
                      <div key={idx} className="fk-item">
                        <span className="fk-column">{fk.column}</span>
                        <span className="fk-arrow">→</span>
                        <span className="fk-ref">
                          {fk.foreign_table}.{fk.foreign_column}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              {selectedTableData.metadata?.commonActions && (
                <div className="quick-actions">
                  <h5>⚡ Aksi Cepat</h5>
                  <div className="action-buttons">
                    {selectedTableData.metadata.commonActions.includes('view') && (
                      <button className="action-btn">👁️ Lihat Data</button>
                    )}
                    {selectedTableData.metadata.commonActions.includes('filter') && (
                      <button className="action-btn">🔍 Filter</button>
                    )}
                    {selectedTableData.metadata.commonActions.includes('chart') && (
                      <button className="action-btn">📈 Chart</button>
                    )}
                    {selectedTableData.metadata.commonActions.includes('edit') && (
                      <button className="action-btn">✏️ Edit</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .schema-reader {
          background: var(--card-bg, #1a1f2e);
          border-radius: 12px;
          padding: 20px;
          margin-top: 20px;
        }

        .schema-reader.loading,
        .schema-reader.error,
        .schema-reader.empty {
          text-align: center;
          padding: 40px;
          color: var(--text-secondary, #94A3B8);
        }

        .schema-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .schema-header h3 {
          margin: 0;
          font-size: 1.1rem;
          color: var(--text-primary, #F1F5F9);
        }

        .schema-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .cache-indicator {
          font-size: 0.75rem;
          padding: 4px 8px;
          background: rgba(59, 130, 246, 0.2);
          border-radius: 4px;
          color: var(--color-primary, #3B82F6);
        }

        .btn-small {
          padding: 6px 12px;
          font-size: 0.8rem;
        }

        .schema-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
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
          font-size: 0.9rem;
          transition: all 0.2s;
        }

        .tab-btn:hover {
          background: rgba(255, 255, 255, 0.05);
        }

        .tab-btn.active {
          background: var(--color-primary, #3B82F6);
          color: white;
        }

        .schema-description {
          color: var(--text-secondary, #94A3B8);
          font-size: 0.85rem;
          margin-bottom: 16px;
        }

        .table-cards {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 12px;
        }

        .table-card {
          background: rgba(255, 255, 255, 0.03);
          border-radius: 10px;
          padding: 14px;
          border-left: 3px solid #6B7280;
          cursor: pointer;
          transition: all 0.2s;
        }

        .table-card:hover {
          background: rgba(255, 255, 255, 0.06);
          transform: translateY(-2px);
        }

        .table-card.selected {
          background: rgba(59, 130, 246, 0.1);
          border-left-color: var(--color-primary, #3B82F6);
        }

        .table-card-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;
        }

        .table-icon {
          font-size: 1.2rem;
        }

        .table-name {
          font-weight: 600;
          font-size: 0.95rem;
          color: var(--text-primary, #F1F5F9);
        }

        .table-desc {
          font-size: 0.8rem;
          color: var(--text-secondary, #94A3B8);
          margin: 0 0 8px 0;
        }

        .table-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.75rem;
        }

        .column-count {
          color: var(--text-muted, #64748B);
        }

        .pk-badge {
          background: rgba(234, 179, 8, 0.2);
          color: #EAB308;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 0.7rem;
        }

        .table-selector {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 20px;
        }

        .table-selector label {
          font-size: 0.9rem;
          color: var(--text-secondary, #94A3B8);
        }

        .table-selector select {
          flex: 1;
          max-width: 300px;
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: var(--text-primary, #F1F5F9);
          font-size: 0.9rem;
        }

        .table-info-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }

        .table-info-header h4 {
          margin: 0;
          font-size: 1.1rem;
        }

        .category-badge {
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 0.75rem;
          color: white;
        }

        .table-description {
          color: var(--text-secondary, #94A3B8);
          font-size: 0.9rem;
          margin-bottom: 20px;
        }

        .columns-section,
        .foreign-keys-section,
        .quick-actions {
          margin-bottom: 20px;
        }

        .columns-section h5,
        .foreign-keys-section h5,
        .quick-actions h5 {
          margin: 0 0 12px 0;
          font-size: 0.95rem;
          color: var(--text-primary, #F1F5F9);
        }

        .schema-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.85rem;
        }

        .schema-table th {
          text-align: left;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-secondary, #94A3B8);
          font-weight: 500;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .schema-table td {
          padding: 10px 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          color: var(--text-primary, #F1F5F9);
        }

        .schema-table tr.pk-row {
          background: rgba(234, 179, 8, 0.05);
        }

        .column-name {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .pk-indicator {
          font-size: 0.8rem;
        }

        .data-type {
          padding: 3px 8px;
          border-radius: 4px;
          font-family: monospace;
          font-size: 0.8rem;
          background: rgba(139, 92, 246, 0.2);
          color: #A78BFA;
        }

        .nullable-yes {
          color: var(--color-success, #10B981);
        }

        .nullable-no {
          color: var(--color-danger, #EF4444);
        }

        .default-value {
          font-family: monospace;
          font-size: 0.8rem;
          color: var(--text-muted, #64748B);
        }

        .fk-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .fk-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 6px;
          font-size: 0.85rem;
        }

        .fk-column {
          color: var(--text-primary, #F1F5F9);
        }

        .fk-arrow {
          color: var(--color-primary, #3B82F6);
        }

        .fk-ref {
          color: var(--text-secondary, #94A3B8);
          font-family: monospace;
        }

        .action-buttons {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .action-btn {
          padding: 8px 14px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: var(--text-primary, #F1F5F9);
          cursor: pointer;
          font-size: 0.85rem;
          transition: all 0.2s;
        }

        .action-btn:hover {
          background: rgba(59, 130, 246, 0.2);
          border-color: var(--color-primary, #3B82F6);
        }
      `}</style>
    </div>
  );
}
