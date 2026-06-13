import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  DollarSign,
  Megaphone,
  BarChart3,
  Settings,
  Loader2,
  Sparkles,
  ChevronRight,
  Check,
  X,
  Eye,
  AlertCircle,
  ArrowUpRight,
  Info,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { callEdgeFunction } from '../lib/edgeFn';
import { useAuth } from '../contexts/AuthContext';
import type {
  PlatformRecommendation,
  RecommendationCategory,
  RecommendationPriority,
  RecommendationStatus,
} from '../types/database';

const CATEGORY_CONFIG: Record<
  RecommendationCategory,
  { icon: typeof TrendingUp; label: string; color: string; bg: string; border: string }
> = {
  growth: { icon: TrendingUp, label: 'Growth', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  pricing: { icon: DollarSign, label: 'Pricing', color: 'text-secondary-600', bg: 'bg-secondary-50', border: 'border-secondary-200' },
  promotions: { icon: Megaphone, label: 'Promotions', color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200' },
  trends: { icon: BarChart3, label: 'Trends', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  operations: { icon: Settings, label: 'Operations', color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200' },
};

const PRIORITY_CONFIG: Record<RecommendationPriority, { label: string; dot: string; text: string }> = {
  high: { label: 'High', dot: 'bg-red-500', text: 'text-red-700' },
  medium: { label: 'Medium', dot: 'bg-amber-500', text: 'text-amber-700' },
  low: { label: 'Low', dot: 'bg-secondary-400', text: 'text-secondary-600' },
};

type FilterCategory = RecommendationCategory | 'all';

/** Parse description text into structured sections for cleaner rendering */
function parseDescription(text: string): { summary: string; sections: { heading: string; items: string[] }[] } {
  const parts = text.split('\n\n');
  const summary = parts[0] || '';
  const sections: { heading: string; items: string[] }[] = [];

  for (let i = 1; i < parts.length; i++) {
    const block = parts[i].trim();
    if (!block || block.startsWith('[')) continue; // skip confidence labels

    const lines = block.split('\n');
    const firstLine = lines[0]?.trim() || '';

    // Check if first line is a heading (doesn't start with a number or bullet)
    const isHeading = firstLine && !firstLine.match(/^[0-9]/) && !firstLine.startsWith('•');
    const heading = isHeading ? firstLine.replace(/:$/, '') : '';
    const itemLines = isHeading ? lines.slice(1) : lines;

    const items = itemLines
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .map(l => l.replace(/^[0-9]+\.\s*/, '').replace(/^•\s*/, ''));

    if (heading || items.length > 0) {
      sections.push({ heading, items });
    }
  }

  return { summary, sections };
}

/** Format a data snapshot key into a readable label */
function formatKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, s => s.toUpperCase())
    .trim();
}

export default function AdminRecommendations() {
  const { user } = useAuth();
  const [recommendations, setRecommendations] = useState<PlatformRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<FilterCategory>('all');
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);

  const fetchRecommendations = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('platform_recommendations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRecommendations((data as PlatformRecommendation[]) || []);

      if (data && data.length > 0) {
        const newest = data.reduce((a, b) =>
          new Date(a.generated_at) > new Date(b.generated_at) ? a : b
        );
        setLastGenerated(newest.generated_at);
      }
    } catch (err) {
      console.error('Failed to fetch recommendations:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  const generateRecommendations = async () => {
    setGenerating(true);
    try {
      await callEdgeFunction('generate-recommendations', {});
      await fetchRecommendations();
    } catch (err) {
      console.error('Failed to generate recommendations:', err);
    } finally {
      setGenerating(false);
    }
  };

  const updateStatus = async (id: string, status: RecommendationStatus) => {
    try {
      const { error } = await supabase
        .from('platform_recommendations')
        .update({
          status,
          reviewed_by: user?.id || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
      setRecommendations((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, status, reviewed_by: user?.id || null, reviewed_at: new Date().toISOString() }
            : r
        )
      );
    } catch (err) {
      console.error('Failed to update recommendation:', err);
    }
  };

  // Only show active (new/reviewed) recommendations
  const active = recommendations.filter(r => r.status === 'new' || r.status === 'reviewed');
  const filtered = activeCategory === 'all'
    ? active
    : active.filter(r => r.category === activeCategory);

  const sorted = [...filtered].sort((a, b) => {
    const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const pDiff = (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
    if (pDiff !== 0) return pDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // Category counts for tabs
  const categoryCounts = active.reduce<Record<string, number>>((acc, r) => {
    acc[r.category] = (acc[r.category] || 0) + 1;
    return acc;
  }, {});

  const highCount = active.filter(r => r.priority === 'high').length;

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="mt-8">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-gray-900">Insights & Recommendations</h2>
            {highCount > 0 && (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-50 text-red-700 text-xs font-medium rounded-full border border-red-100">
                <AlertCircle className="w-3 h-3" />
                {highCount} urgent
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            {lastGenerated ? `Last analysed ${formatDate(lastGenerated)}` : 'AI-powered platform analysis'}
          </p>
        </div>
        <button
          onClick={generateRecommendations}
          disabled={generating}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Analysing...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generate Insights
            </>
          )}
        </button>
      </div>

      {/* Category Tabs */}
      {active.length > 0 && (
        <div className="flex items-center gap-1 mb-4 border-b border-gray-200">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeCategory === 'all'
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            All ({active.length})
          </button>
          {(Object.keys(CATEGORY_CONFIG) as RecommendationCategory[]).map(cat => {
            const count = categoryCounts[cat] || 0;
            if (count === 0) return null;
            const config = CATEGORY_CONFIG[cat];
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeCategory === cat
                    ? 'border-gray-900 text-gray-900'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {config.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 text-center py-16 px-6">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-gray-900 font-semibold mb-1">No recommendations yet</p>
          <p className="text-gray-500 text-sm mb-6 max-w-sm mx-auto">
            Generate insights from your platform data to get actionable suggestions for growth, pricing, and operations.
          </p>
          <button
            onClick={generateRecommendations}
            disabled={generating}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white font-medium text-sm rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generating ? 'Analysing...' : 'Run First Analysis'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((rec) => {
            const catConfig = CATEGORY_CONFIG[rec.category];
            const CatIcon = catConfig.icon;
            const priorityConfig = PRIORITY_CONFIG[rec.priority];
            const isExpanded = expandedId === rec.id;
            const parsed = parseDescription(rec.description);

            return (
              <div
                key={rec.id}
                className={`bg-white rounded-lg border transition-all ${
                  rec.priority === 'high'
                    ? 'border-red-200'
                    : 'border-gray-200'
                } ${isExpanded ? 'shadow-sm' : 'hover:shadow-sm'}`}
              >
                {/* Card Header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : rec.id)}
                  className="w-full flex items-start gap-3 p-4 text-left"
                >
                  {/* Priority indicator bar */}
                  <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${
                    rec.priority === 'high' ? 'bg-red-400' : rec.priority === 'medium' ? 'bg-amber-400' : 'bg-secondary-300'
                  }`} />

                  <div className={`p-1.5 rounded-md flex-shrink-0 mt-0.5 ${catConfig.bg}`}>
                    <CatIcon className={`w-4 h-4 ${catConfig.color}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-semibold text-gray-900 truncate">
                        {rec.title}
                      </h4>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${priorityConfig.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${priorityConfig.dot}`} />
                        {priorityConfig.label}
                      </span>
                      {rec.status === 'new' && (
                        <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded">
                          NEW
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 line-clamp-1">
                      {parsed.summary}
                    </p>
                  </div>

                  <ChevronRight className={`w-4 h-4 text-gray-400 flex-shrink-0 mt-1 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="px-4 pb-4 ml-[52px]">
                    <div className="border-t border-gray-100 pt-4 space-y-4">
                      {/* Summary */}
                      <p className="text-sm text-gray-700 leading-relaxed">
                        {parsed.summary}
                      </p>

                      {/* Structured Sections */}
                      {parsed.sections.map((section, idx) => (
                        <div key={idx}>
                          {section.heading && (
                            <h5 className="text-xs font-semibold text-gray-900 uppercase tracking-wide mb-2">
                              {section.heading}
                            </h5>
                          )}
                          {section.items.length > 0 && (
                            <ol className="space-y-1.5">
                              {section.items.map((item, i) => (
                                <li key={i} className="flex gap-2 text-sm text-gray-600">
                                  <span className="text-gray-400 font-medium flex-shrink-0 w-5 text-right">{i + 1}.</span>
                                  <span className="leading-relaxed">{item}</span>
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>
                      ))}

                      {/* Confidence indicator */}
                      {rec.data_snapshot?.confidence && (
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium ${
                          rec.data_snapshot.confidence === 'high'
                            ? 'bg-emerald-50 text-emerald-700'
                            : rec.data_snapshot.confidence === 'medium'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-gray-100 text-gray-500'
                        }`}>
                          <Info className="w-3 h-3" />
                          {rec.data_snapshot.confidence === 'high'
                            ? 'High confidence'
                            : rec.data_snapshot.confidence === 'medium'
                              ? 'Medium confidence'
                              : 'Low confidence'}
                        </div>
                      )}

                      {/* Key Metrics */}
                      {rec.data_snapshot && Object.keys(rec.data_snapshot).filter(k => k !== 'confidence').length > 0 && (
                        <details className="group">
                          <summary className="text-xs font-medium text-gray-400 cursor-pointer hover:text-gray-600 select-none">
                            View supporting data
                          </summary>
                          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {Object.entries(rec.data_snapshot)
                              .filter(([key]) => key !== 'confidence')
                              .map(([key, val]) => (
                                <div key={key} className="bg-gray-50 rounded px-3 py-2">
                                  <p className="text-xs text-gray-400 uppercase tracking-wide">{formatKey(key)}</p>
                                  <p className="text-sm font-medium text-gray-900 truncate">
                                    {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                  </p>
                                </div>
                              ))}
                          </div>
                        </details>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                        {rec.action_url && (
                          <Link
                            to={rec.action_url}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-md hover:bg-gray-800 transition-colors"
                          >
                            <ArrowUpRight className="w-3 h-3" />
                            Take Action
                          </Link>
                        )}
                        {rec.status === 'new' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); updateStatus(rec.id, 'reviewed'); }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-gray-600 text-xs font-medium rounded-md border border-gray-200 hover:bg-gray-50 transition-colors"
                          >
                            <Eye className="w-3 h-3" />
                            Mark Reviewed
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); updateStatus(rec.id, 'implemented'); }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-emerald-700 text-xs font-medium rounded-md border border-emerald-200 hover:bg-emerald-50 transition-colors"
                        >
                          <Check className="w-3 h-3" />
                          Done
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); updateStatus(rec.id, 'dismissed'); }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-gray-400 text-xs font-medium rounded-md hover:bg-gray-50 transition-colors ml-auto"
                        >
                          <X className="w-3 h-3" />
                          Dismiss
                        </button>
                      </div>

                      {rec.reviewed_at && (
                        <p className="text-xs text-gray-400">
                          Updated {formatDate(rec.reviewed_at)}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
