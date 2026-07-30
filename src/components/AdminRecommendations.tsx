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
  growth: { icon: TrendingUp, label: 'Growth', color: 'text-ct-teal', bg: 'bg-ct-teal/[0.14]', border: 'border-ct-teal/30' },
  pricing: { icon: DollarSign, label: 'Pricing', color: 'text-ct-mute-2', bg: 'bg-ct-surface-2', border: 'border-ct-line' },
  promotions: { icon: Megaphone, label: 'Promotions', color: 'text-ct-mute-2', bg: 'bg-ct-surface-2', border: 'border-ct-line' },
  trends: { icon: BarChart3, label: 'Trends', color: 'text-ct-amber', bg: 'bg-ct-amber/[0.13]', border: 'border-ct-amber/[0.34]' },
  operations: { icon: Settings, label: 'Operations', color: 'text-ct-rose', bg: 'bg-ct-rose/[0.13]', border: 'border-ct-rose/[0.34]' },
};

const PRIORITY_CONFIG: Record<RecommendationPriority, { label: string; dot: string; text: string }> = {
  high: { label: 'High', dot: 'bg-ct-rose/[0.13]0', text: 'text-ct-rose' },
  medium: { label: 'Medium', dot: 'bg-ct-amber/[0.13]0', text: 'text-ct-amber' },
  low: { label: 'Low', dot: 'bg-ct-surface-2', text: 'text-ct-mute-2' },
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
            <h2 className="text-lg font-bold text-ct-paper">Insights & Recommendations</h2>
            {highCount > 0 && (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-ct-rose/[0.13] text-ct-rose text-xs font-medium rounded-full border border-ct-rose/[0.34]">
                <AlertCircle className="w-3 h-3" />
                {highCount} urgent
              </span>
            )}
          </div>
          <p className="text-sm text-ct-mute mt-0.5">
            {lastGenerated ? `Last analysed ${formatDate(lastGenerated)}` : 'AI-powered platform analysis'}
          </p>
        </div>
        <button
          onClick={generateRecommendations}
          disabled={generating}
          className="flex items-center gap-2 px-4 py-2 bg-ct-surface text-ct-ink text-sm font-medium rounded-ct-sm hover:bg-ct-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="flex items-center gap-1 mb-4 border-b border-ct-line overflow-x-auto scrollbar-hide scrollbar-none" style={{ WebkitOverflowScrolling: 'touch' }}>
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-3 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeCategory === 'all'
                ? 'border-ct-line text-ct-paper'
                : 'border-transparent text-ct-mute hover:text-ct-mute-2'
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
                className={`px-3 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeCategory === cat
                    ? 'border-ct-line text-ct-paper'
                    : 'border-transparent text-ct-mute hover:text-ct-mute-2'
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
          <Loader2 className="w-6 h-6 text-ct-mute animate-spin" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-ct-surface rounded-ct-sm border border-ct-line text-center py-16 px-6">
          <div className="w-12 h-12 bg-ct-surface-2 rounded-full flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-6 h-6 text-ct-mute" />
          </div>
          <p className="text-ct-paper font-semibold mb-1">No recommendations yet</p>
          <p className="text-ct-mute text-sm mb-6 max-w-sm mx-auto">
            Generate insights from your platform data to get actionable suggestions for growth, pricing, and operations.
          </p>
          <button
            onClick={generateRecommendations}
            disabled={generating}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-ct-surface text-ct-ink font-medium text-sm rounded-ct-sm hover:bg-ct-surface transition-colors disabled:opacity-50"
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
            // data_snapshot is Json, so this is `unknown` until compared.
            const confidence = rec.data_snapshot?.confidence;

            return (
              <div
                key={rec.id}
                className={`bg-ct-surface rounded-ct-sm border transition-all ${
                  rec.priority === 'high'
                    ? 'border-ct-rose/[0.34]'
                    : 'border-ct-line'
                } ${isExpanded ? 'shadow-sm' : 'hover:shadow-sm'}`}
              >
                {/* Card Header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : rec.id)}
                  className="w-full flex items-start gap-3 p-4 text-left"
                >
                  {/* Priority indicator bar */}
                  <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${
                    rec.priority === 'high' ? 'bg-ct-rose' : rec.priority === 'medium' ? 'bg-ct-amber' : 'bg-ct-surface-2'
                  }`} />

                  <div className={`p-1.5 rounded-ct-xs flex-shrink-0 mt-0.5 ${catConfig.bg}`}>
                    <CatIcon className={`w-4 h-4 ${catConfig.color}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-semibold text-ct-paper truncate">
                        {rec.title}
                      </h4>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${priorityConfig.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${priorityConfig.dot}`} />
                        {priorityConfig.label}
                      </span>
                      {rec.status === 'new' && (
                        <span className="px-1.5 py-0.5 bg-ct-teal/[0.14] text-ct-teal text-xs font-semibold rounded-ct-xs">
                          NEW
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-ct-mute line-clamp-1">
                      {parsed.summary}
                    </p>
                  </div>

                  <ChevronRight className={`w-4 h-4 text-ct-mute flex-shrink-0 mt-1 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="px-4 pb-4 ml-[52px]">
                    <div className="border-t border-ct-line-soft pt-4 space-y-4">
                      {/* Summary */}
                      <p className="text-sm text-ct-mute-2 leading-relaxed">
                        {parsed.summary}
                      </p>

                      {/* Structured Sections */}
                      {parsed.sections.map((section, idx) => (
                        <div key={idx}>
                          {section.heading && (
                            <h5 className="text-xs font-semibold text-ct-paper uppercase tracking-wide mb-2">
                              {section.heading}
                            </h5>
                          )}
                          {section.items.length > 0 && (
                            <ol className="space-y-1.5">
                              {section.items.map((item, i) => (
                                <li key={i} className="flex gap-2 text-sm text-ct-mute-2">
                                  <span className="text-ct-mute font-medium flex-shrink-0 w-5 text-right">{i + 1}.</span>
                                  <span className="leading-relaxed">{item}</span>
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>
                      ))}

                      {/* Confidence indicator */}
                      {Boolean(confidence) && (
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-ct-xs text-xs font-medium ${
                          confidence === 'high'
                            ? 'bg-ct-teal/[0.14] text-ct-teal'
                            : confidence === 'medium'
                              ? 'bg-ct-amber/[0.13] text-ct-amber'
                              : 'bg-ct-surface-2 text-ct-mute'
                        }`}>
                          <Info className="w-3 h-3" />
                          {confidence === 'high'
                            ? 'High confidence'
                            : confidence === 'medium'
                              ? 'Medium confidence'
                              : 'Low confidence'}
                        </div>
                      )}

                      {/* Key Metrics */}
                      {rec.data_snapshot && Object.keys(rec.data_snapshot).filter(k => k !== 'confidence').length > 0 && (
                        <details className="group">
                          <summary className="text-xs font-medium text-ct-mute cursor-pointer hover:text-ct-mute-2 select-none">
                            View supporting data
                          </summary>
                          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {Object.entries(rec.data_snapshot)
                              .filter(([key]) => key !== 'confidence')
                              .map(([key, val]) => (
                                <div key={key} className="bg-ct-surface-2 rounded-ct-xs px-3 py-2">
                                  <p className="text-xs text-ct-mute uppercase tracking-wide">{formatKey(key)}</p>
                                  <p className="text-sm font-medium text-ct-paper truncate">
                                    {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                  </p>
                                </div>
                              ))}
                          </div>
                        </details>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-2 border-t border-ct-line-soft">
                        {rec.action_url && (
                          <Link
                            to={rec.action_url}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-ct-surface text-ct-ink text-xs font-medium rounded-ct-xs hover:bg-ct-surface transition-colors"
                          >
                            <ArrowUpRight className="w-3 h-3" />
                            Take Action
                          </Link>
                        )}
                        {rec.status === 'new' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); updateStatus(rec.id, 'reviewed'); }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-ct-mute-2 text-xs font-medium rounded-ct-xs border border-ct-line hover:bg-ct-surface-2 transition-colors"
                          >
                            <Eye className="w-3 h-3" />
                            Mark Reviewed
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); updateStatus(rec.id, 'implemented'); }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-ct-teal text-xs font-medium rounded-ct-xs border border-ct-teal/30 hover:bg-ct-teal/[0.14] transition-colors"
                        >
                          <Check className="w-3 h-3" />
                          Done
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); updateStatus(rec.id, 'dismissed'); }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-ct-mute text-xs font-medium rounded-ct-xs hover:bg-ct-surface-2 transition-colors ml-auto"
                        >
                          <X className="w-3 h-3" />
                          Dismiss
                        </button>
                      </div>

                      {rec.reviewed_at && (
                        <p className="text-xs text-ct-mute">
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
