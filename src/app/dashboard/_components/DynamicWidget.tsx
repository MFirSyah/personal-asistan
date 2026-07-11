'use client';

/**
 * DynamicWidget - Generic Widget Renderer
 * Arsitektur Reference: Bagian 11.5 - Web App Generic Renderer
 *
 * Renders widgets based on their chart_type using whitelist query_config
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';

interface Widget {
  id: string;
  title: string;
  description?: string;
  chart_type: 'line' | 'bar' | 'pie' | 'table' | 'number';
  data_source: string;
  query_config: any;
  is_pinned: boolean;
  sort_order: number;
}

interface WidgetData {
  widget: {
    id: string;
    title: string;
    chart_type: string;
    description?: string;
  };
  data: any[];
}

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
});

interface DynamicWidgetProps {
  widget: Widget;
  onEdit?: (widget: Widget) => void;
  onDelete?: (widgetId: string) => void;
  onTogglePin?: (widgetId: string) => void;
}

export function DynamicWidget({ widget, onEdit, onDelete, onTogglePin }: DynamicWidgetProps) {
  const { data, error, isLoading, refetch: mutate } = useQuery<WidgetData>({
    queryKey: ['/api/v1/analytics/widgets/data', widget.id],
    queryFn: () => fetcher(`/api/v1/analytics/widgets/${widget.id}/data`),
    refetchInterval: 15000 // Auto-refresh every 15 seconds
  });

  const renderChart = () => {
    if (isLoading) {
      return <div className="widget-skeleton" />;
    }

    if (error) {
      return (
        <div className="widget-error">
          <span>⚠️ Gagal memuat data</span>
          <button onClick={() => mutate()} className="btn-retry">
            🔄 Coba Lagi
          </button>
        </div>
      );
    }

    const chartData = data?.data || [];

    switch (widget.chart_type) {
      case 'number':
        return <NumberCard data={chartData} />;
      case 'pie':
        return <PieChartWidget data={chartData} title={widget.title} />;
      case 'bar':
        return <BarChartWidget data={chartData} title={widget.title} />;
      case 'line':
        return <LineChartWidget data={chartData} title={widget.title} />;
      case 'table':
        return <TableWidget data={chartData} />;
      default:
        return <div className="widget-unsupported">Tipe chart tidak didukung</div>;
    }
  };

  return (
    <div className={`dynamic-widget ${widget.is_pinned ? 'pinned' : ''}`}>
      <div className="widget-header">
        <div className="widget-title-row">
          <span className="widget-icon">
            {widget.chart_type === 'number' && '🔢'}
            {widget.chart_type === 'pie' && '📊'}
            {widget.chart_type === 'bar' && '📈'}
            {widget.chart_type === 'line' && '📉'}
            {widget.chart_type === 'table' && '📋'}
          </span>
          <h3 className="widget-title">{widget.title}</h3>
          {widget.is_pinned && <span className="pin-badge">📌</span>}
        </div>
        <div className="widget-actions">
          {onTogglePin && (
            <button
              className="widget-action-btn"
              onClick={() => onTogglePin(widget.id)}
              title={widget.is_pinned ? 'Unpin' : 'Pin'}
            >
              📌
            </button>
          )}
          {onEdit && (
            <button
              className="widget-action-btn"
              onClick={() => onEdit(widget)}
              title="Edit Widget"
            >
              ✏️
            </button>
          )}
          {onDelete && (
            <button
              className="widget-action-btn delete"
              onClick={() => onDelete(widget.id)}
              title="Hapus Widget"
            >
              🗑️
            </button>
          )}
        </div>
      </div>
      {widget.description && (
        <p className="widget-description">{widget.description}</p>
      )}
      <div className="widget-content">
        {renderChart()}
      </div>
      <div className="widget-footer">
        <span className="widget-source">
          Source: {widget.data_source}
        </span>
        <span className="widget-timestamp">
          Updated: {data ? new Date().toLocaleTimeString('id-ID') : '-'}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Chart Components
// ============================================================================

interface NumberCardProps {
  data: any[];
}

function NumberCard({ data }: NumberCardProps) {
  const value = data[0]?.value ?? 0;
  const formattedValue = typeof value === 'number'
    ? value.toLocaleString('id-ID')
    : value;

  return (
    <div className="number-card">
      <span className="number-value">{formattedValue}</span>
    </div>
  );
}

interface PieChartWidgetProps {
  data: any[];
  title: string;
}

function PieChartWidget({ data, title }: PieChartWidgetProps) {
  // Simple CSS-based pie chart (no external library needed)
  const total = data.reduce((sum: number, item: any) => sum + (item.value || 0), 0);
  const colors = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#EF4444'];

  if (data.length === 0) {
    return <div className="chart-empty">Tidak ada data</div>;
  }

  let currentAngle = 0;
  const slices = data.map((item: any, index: number) => {
    const percentage = total > 0 ? (item.value / total) * 100 : 0;
    const angle = (percentage / 100) * 360;
    const startAngle = currentAngle;
    currentAngle += angle;

    return {
      ...item,
      percentage,
      color: colors[index % colors.length],
      startAngle,
      endAngle: currentAngle,
    };
  });

  return (
    <div className="pie-chart-container">
      <div className="pie-chart">
        <svg viewBox="0 0 100 100">
          {slices.map((slice, index) => {
            const startRad = (slice.startAngle - 90) * (Math.PI / 180);
            const endRad = (slice.endAngle - 90) * (Math.PI / 180);
            const x1 = 50 + 40 * Math.cos(startRad);
            const y1 = 50 + 40 * Math.sin(startRad);
            const x2 = 50 + 40 * Math.cos(endRad);
            const y2 = 50 + 40 * Math.sin(endRad);
            const largeArc = slice.percentage > 50 ? 1 : 0;

            return (
              <path
                key={index}
                d={`M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`}
                fill={slice.color}
                stroke="rgba(0,0,0,0.1)"
                strokeWidth="0.5"
              />
            );
          })}
          <circle cx="50" cy="50" r="25" fill="var(--card-bg, #1F2937)" />
        </svg>
      </div>
      <div className="pie-legend">
        {slices.map((slice, index) => (
          <div key={index} className="legend-item">
            <span
              className="legend-color"
              style={{ backgroundColor: slice.color }}
            />
            <span className="legend-label">{slice[Object.keys(slice)[0]]}</span>
            <span className="legend-value">
              {slice.percentage.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface BarChartWidgetProps {
  data: any[];
  title: string;
}

function BarChartWidget({ data, title }: BarChartWidgetProps) {
  if (data.length === 0) {
    return <div className="chart-empty">Tidak ada data</div>;
  }

  const maxValue = Math.max(...data.map((d: any) => d.value || 0));
  const maxHeight = 150;

  return (
    <div className="bar-chart-container">
      <div className="bar-chart">
        {data.slice(0, 10).map((item: any, index: number) => {
          const barHeight = maxValue > 0 ? (item.value / maxValue) * maxHeight : 0;
          const label = item[Object.keys(item)[0]];
          const labelWidth = Math.max(40, Math.min(80, String(label).length * 6));

          return (
            <div key={index} className="bar-wrapper">
              <div
                className="bar"
                style={{ height: `${barHeight}px` }}
                title={`${item.value}`}
              >
                <span className="bar-value">{item.value?.toLocaleString('id-ID')}</span>
              </div>
              <span
                className="bar-label"
                style={{ maxWidth: `${labelWidth}px` }}
              >
                {String(label).substring(0, 10)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface LineChartWidgetProps {
  data: any[];
  title: string;
}

function LineChartWidget({ data, title }: LineChartWidgetProps) {
  if (data.length === 0) {
    return <div className="chart-empty">Tidak ada data</div>;
  }

  const values = data.map((d: any) => d.value || 0);
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);
  const range = maxValue - minValue || 1;
  const height = 120;
  const width = 100;
  const padding = 10;

  const points = data.map((item: any, index: number) => {
    const x = padding + (index / (data.length - 1 || 1)) * (width - 2 * padding);
    const y = height - padding - ((item.value - minValue) / range) * (height - 2 * padding);
    return { x, y, value: item.value, label: item[Object.keys(item)[0]] };
  });

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  return (
    <div className="line-chart-container">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="line-chart"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary, #3B82F6)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--color-primary, #3B82F6)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d={`${pathD} L ${points[points.length - 1]?.x || width - padding} ${height - padding} L ${padding} ${height - padding} Z`}
          fill="url(#lineGradient)"
        />
        <path
          d={pathD}
          fill="none"
          stroke="var(--color-primary, #3B82F6)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="2"
            fill="var(--color-primary, #3B82F6)"
          />
        ))}
      </svg>
      <div className="line-chart-labels">
        {data.slice(0, 5).map((item: any, index: number) => (
          <span key={index} className="line-label">
            {String(item[Object.keys(item)[0]]).substring(0, 6)}
          </span>
        ))}
      </div>
    </div>
  );
}

interface TableWidgetProps {
  data: any[];
}

function TableWidget({ data }: TableWidgetProps) {
  if (data.length === 0) {
    return <div className="chart-empty">Tidak ada data</div>;
  }

  const columns = data.length > 0 ? Object.keys(data[0]) : [];

  return (
    <div className="table-widget">
      <table>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 10).map((row: any, rowIndex: number) => (
            <tr key={rowIndex}>
              {columns.map((col) => (
                <td key={col}>
                  {typeof row[col] === 'number'
                    ? row[col].toLocaleString('id-ID')
                    : String(row[col] || '-')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length > 10 && (
        <div className="table-more">
          +{data.length - 10} data lagi
        </div>
      )}
    </div>
  );
}

export default DynamicWidget;
