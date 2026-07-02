/**
 * Analysis Preferences Context Generator
 * Generates AI context string from user preferences
 */

import { supabaseAdmin } from '@/lib/services/supabase';

export interface UserAnalysisPreferences {
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

/**
 * Get user's analysis preferences
 */
export async function getUserAnalysisPreferences(userId: string): Promise<UserAnalysisPreferences | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('user_analysis_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching analysis preferences:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Error fetching analysis preferences:', err);
    return null;
  }
}

/**
 * Generate AI context string from preferences
 */
export function generatePreferencesContext(prefs: UserAnalysisPreferences | null): string {
  if (!prefs) {
    return '';
  }

  let context = '\n\n┌──────────────────────────────────────────────────────────┐\n';
  context += '│  🎯 USER ANALYSIS PREFERENCES                            │\n';
  context += '└──────────────────────────────────────────────────────────┘\n\n';

  // Date Range
  const dateRangeMap: Record<string, string> = {
    'week': 'Minggu ini',
    'month': 'Bulan ini',
    'quarter': 'Kuartal ini',
    'year': 'Tahun ini'
  };
  context += `📅 **Rentang Analisis:** ${dateRangeMap[prefs.date_range || 'month'] || 'Bulan ini'}\n`;

  // Savings Target
  if (prefs.savings_target_percent) {
    context += `💰 **Target Tabungan:** ${prefs.savings_target_percent}% dari penghasilan\n`;
  }

  // Active Analysis Types
  context += '\n📊 **Jenis Analisis yang DIKktif:**\n';
  const activeAnalyses: string[] = [];
  const inactiveAnalyses: string[] = [];

  if (prefs.include_cash_flow) activeAnalyses.push('Arus Kas 💳');
  else inactiveAnalyses.push('Arus Kas 💳');

  if (prefs.include_leak_audit) activeAnalyses.push('Audit Kebocoran 🔍');
  else inactiveAnalyses.push('Audit Kebocoran 🔍');

  if (prefs.include_consistency) activeAnalyses.push('Konsistensi 📈');
  else inactiveAnalyses.push('Konsistensi 📈');

  if (prefs.include_priority_matrix) activeAnalyses.push('Prioritas 🎯');
  else inactiveAnalyses.push('Prioritas 🎯');

  if (prefs.include_runway_prediction) activeAnalyses.push('Prediksi Dana ⏱️');
  else inactiveAnalyses.push('Prediksi Dana ⏱️');

  if (prefs.include_risk_simulation) activeAnalyses.push('Risiko Keuangan ⚠️');
  else inactiveAnalyses.push('Risiko Keuangan ⚠️');

  if (prefs.include_burnout_detection) activeAnalyses.push('Deteksi Kejenuhan 🧘');
  else inactiveAnalyses.push('Deteksi Kejenuhan 🧘');

  if (prefs.include_mood_correlation) activeAnalyses.push('Mood Correlation 💭');
  else inactiveAnalyses.push('Mood Correlation 💭');

  if (prefs.include_worth_it_score) activeAnalyses.push('Worth-It Score 💎');
  else inactiveAnalyses.push('Worth-It Score 💎');

  context += activeAnalyses.map(a => `   ✓ ${a}`).join('\n') + '\n';

  if (inactiveAnalyses.length > 0 && prefs.insight_detail_level === 'detailed') {
    context += '\n📴 **Analisis Nonaktif:**\n';
    context += inactiveAnalyses.map(a => `   ✗ ${a}`).join('\n') + '\n';
  }

  // Categories
  if (prefs.preferred_categories && prefs.preferred_categories.length > 0) {
    context += `\n🏷️ **Kategori Prioritas:** ${prefs.preferred_categories.join(', ')}\n`;
  }

  if (prefs.exclude_categories && prefs.exclude_categories.length > 0) {
    context += `🚫 **Kategori Exclude:** ${prefs.exclude_categories.join(', ')}\n`;
  }

  // Output Preferences
  context += '\n⚙️ **Preferensi Output:**\n';

  const detailMap: Record<string, string> = {
    'brief': 'SINGKAT - poin-poin utama saja',
    'standard': 'STANDAR - ringkasan dengan konteks',
    'detailed': 'DETAIL - penjelasan lengkap dengan contoh'
  };
  context += `   📝 **Tingkat Detail:** ${detailMap[prefs.insight_detail_level || 'standard'] || 'STANDAR'}\n`;

  if (prefs.prefer_visualizations) {
    context += '   📊 Saran visual/chart: AKTIF\n';
  }

  if (prefs.prefer_action_plans) {
    context += '   📋 Action plan: AKTIF\n';
  }

  // Alert Preferences
  if (prefs.notify_on_alerts) {
    context += `\n🔔 **Notifikasi Alert:** AKTIF (threshold: ${prefs.alert_threshold_risk || 'high'})\n`;
  }

  context += '\n';

  return context;
}

/**
 * Generate analysis summary based on preferences
 */
export function generateAnalysisSummary(
  prefs: UserAnalysisPreferences | null,
  data: {
    totalIncome?: number;
    totalExpense?: number;
    pendingTasks?: number;
    completedTasks?: number;
  }
): string {
  if (!prefs) {
    return '';
  }

  let summary = '\n\n┌──────────────────────────────────────────────────────────┐\n';
  summary += '│  📈 ANALISIS BERDASARKAN PREFERENSI ANDA               │\n';
  summary += '└──────────────────────────────────────────────────────────┘\n';

  // Quick Stats based on active analyses
  if (prefs.include_cash_flow && data.totalIncome !== undefined && data.totalExpense !== undefined) {
    const net = data.totalIncome - data.totalExpense;
    const rate = data.totalIncome > 0 ? ((net / data.totalIncome) * 100).toFixed(1) : '0';
    summary += `\n💳 **Arus Kas:**\n`;
    summary += `   • Masuk: Rp ${(data.totalIncome || 0).toLocaleString('id-ID')}\n`;
    summary += `   • Keluar: Rp ${(data.totalExpense || 0).toLocaleString('id-ID')}\n`;
    summary += `   • Bersih: Rp ${net.toLocaleString('id-ID')} (${rate}%)\n`;
  }

  if (prefs.include_consistency && data.completedTasks !== undefined && data.pendingTasks !== undefined) {
    const total = (data.completedTasks || 0) + (data.pendingTasks || 0);
    const rate = total > 0 ? Math.round(((data.completedTasks || 0) / total) * 100) : 0;
    summary += `\n📈 **Konsistensi:**\n`;
    summary += `   • Selesai: ${data.completedTasks}/${total} tugas\n`;
    summary += `   • Rate: ${rate}%\n`;
  }

  // Savings progress
  if (prefs.savings_target_percent && data.totalIncome) {
    const target = (data.totalIncome * (prefs.savings_target_percent / 100));
    const actual = data.totalIncome - (data.totalExpense || 0);
    const progress = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;
    summary += `\n💰 **Progress Tabungan:**\n`;
    summary += `   • Target: ${prefs.savings_target_percent}% = Rp ${target.toLocaleString('id-ID')}\n`;
    summary += `   • Actual: Rp ${actual.toLocaleString('id-ID')}\n`;
    summary += `   • Progress: ${progress}%\n`;
  }

  summary += '\n';

  return summary;
}

/**
 * Filter insights based on user preferences
 */
export function filterInsights(
  insights: Array<{ type: string; [key: string]: any }>,
  prefs: UserAnalysisPreferences | null
): Array<{ type: string; [key: string]: any }> {
  if (!prefs) {
    return insights; // Return all if no preferences
  }

  const includeMap: Record<string, boolean> = {
    'cash_flow': prefs.include_cash_flow ?? true,
    'leak_audit': prefs.include_leak_audit ?? true,
    'consistency': prefs.include_consistency ?? true,
    'priority': prefs.include_priority_matrix ?? true,
    'runway': prefs.include_runway_prediction ?? true,
    'risk': prefs.include_risk_simulation ?? true,
    'burnout': prefs.include_burnout_detection ?? true,
    'mood_correlation': prefs.include_mood_correlation ?? false,
    'worth_it': prefs.include_worth_it_score ?? true
  };

  return insights.filter(insight => {
    // Check if this insight type is enabled
    const isIncluded = includeMap[insight.type] ?? true;

    // Check category exclusions
    if (insight.category && prefs.exclude_categories?.includes(insight.category)) {
      return false;
    }

    // Check preferred categories (if set, only show those)
    if (prefs.preferred_categories && prefs.preferred_categories.length > 0) {
      if (!prefs.preferred_categories.includes(insight.category)) {
        return false;
      }
    }

    return isIncluded;
  });
}
