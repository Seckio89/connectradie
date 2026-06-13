import { useState, useEffect, useRef, useCallback } from 'react';
import {
  DollarSign,
  Users,
  TrendingUp,
  CreditCard,
  Loader2,
  Briefcase,
  Calculator,
  BarChart3,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../components/DashboardLayout';

interface Metrics {
  totalGmv: number;
  platformRevenue: number;
  thisMonthRevenue: number;
  activeTradies: number;
  activeClients: number;
  proSubscribers: number;
  avgJobValue: number;
  jobsThisMonth: number;
}

const formatCurrency = (cents: number) =>
  (cents / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });

const formatCurrencyDollars = (dollars: number) =>
  dollars.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });

export default function AdminFinancials() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  // Model sliders
  const [activeTradiesSlider, setActiveTradiesSlider] = useState(10);
  const [jobsPerTradie, setJobsPerTradie] = useState(4);
  const [avgJobValueSlider, setAvgJobValueSlider] = useState(800);
  const [proSubscriptionPct, setProSubscriptionPct] = useState(20);
  const [monthlyCosts, setMonthlyCosts] = useState(500);

  const chartCanvasRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<unknown>(null);

  useEffect(() => {
    fetchMetrics();
  }, []);

  const fetchMetrics = async () => {
    setLoading(true);

    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [
        tradiesRes,
        clientsRes,
        completedPaymentsRes,
        proSubsRes,
        thisMonthPaymentsRes,
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select('id')
          .eq('role', 'tradie')
          .eq('stripe_connect_onboarding_complete', true),
        supabase
          .from('profiles')
          .select('id')
          .eq('role', 'client'),
        supabase
          .from('payments')
          .select('amount, metadata')
          .eq('status', 'completed')
          .eq('payment_type', 'job_funding'),
        supabase
          .from('stripe_subscriptions')
          .select('id')
          .eq('status', 'active'),
        supabase
          .from('payments')
          .select('amount, metadata')
          .eq('status', 'completed')
          .eq('payment_type', 'job_funding')
          .gte('created_at', startOfMonth),
      ]);

      const completedPayments = completedPaymentsRes.data || [];
      const thisMonthPayments = thisMonthPaymentsRes.data || [];

      const totalGmv = completedPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const completedCount = completedPayments.length;

      const platformRevenue = completedPayments.reduce((sum, p) => {
        const meta = p.metadata as Record<string, unknown> | null;
        const fee = meta?.platform_fee;
        if (typeof fee === 'number') return sum + fee;
        if (typeof fee === 'string') {
          const parsed = parseFloat(fee);
          return sum + (isNaN(parsed) ? 0 : parsed);
        }
        return sum;
      }, 0);

      const thisMonthRevenue = thisMonthPayments.reduce((sum, p) => {
        const meta = p.metadata as Record<string, unknown> | null;
        const fee = meta?.platform_fee;
        if (typeof fee === 'number') return sum + fee;
        if (typeof fee === 'string') {
          const parsed = parseFloat(fee);
          return sum + (isNaN(parsed) ? 0 : parsed);
        }
        return sum;
      }, 0);

      const activeTradiesCount = tradiesRes.data?.length || 0;
      const activeClientsCount = clientsRes.data?.length || 0;
      const proSubCount = proSubsRes.data?.length || 0;
      const avgJobVal = completedCount > 0 ? Math.round(totalGmv / completedCount) : 0;

      setMetrics({
        totalGmv,
        platformRevenue,
        thisMonthRevenue,
        activeTradies: activeTradiesCount,
        activeClients: activeClientsCount,
        proSubscribers: proSubCount,
        avgJobValue: avgJobVal,
        jobsThisMonth: thisMonthPayments.length,
      });

      // Pre-populate sliders from real data
      if (activeTradiesCount > 0) setActiveTradiesSlider(activeTradiesCount);
      if (avgJobVal > 0) setAvgJobValueSlider(Math.round(avgJobVal / 100));
      if (activeTradiesCount > 0 && proSubCount > 0) {
        setProSubscriptionPct(Math.round((proSubCount / activeTradiesCount) * 100));
      }
    } catch (err) {
      console.error('Failed to fetch admin financials data:', err);
    }

    setLoading(false);
  };

  // Model calculations
  const totalTradies = activeTradiesSlider;
  const proTradies = Math.round(totalTradies * (proSubscriptionPct / 100));
  const freeTradies = totalTradies - proTradies;
  const totalJobs = totalTradies * jobsPerTradie;
  const proJobs = proTradies * jobsPerTradie;
  const freeJobs = freeTradies * jobsPerTradie;
  const totalGmvProjected = totalJobs * avgJobValueSlider;

  // Revenue lines
  const freeCommission = freeJobs * avgJobValueSlider * 0.10;
  const proCommission = proJobs * avgJobValueSlider * 0.05;
  const stripeSurcharge = totalGmvProjected * 0.0175;
  const subscriptionRevenue = proTradies * 4.99;
  const monthlyRevenue = freeCommission + proCommission + stripeSurcharge + subscriptionRevenue;

  // Costs
  const stripeFees = totalGmvProjected * 0.0175 + totalJobs * 0.30;
  const monthlyProfit = monthlyRevenue - stripeFees - monthlyCosts;

  // Break-even
  const breakEvenJobs = monthlyCosts > 0 && avgJobValueSlider > 0
    ? Math.ceil(monthlyCosts / ((avgJobValueSlider * 0.10) - 0.30))
    : 0;

  // Chart rendering
  const renderChart = useCallback(() => {
    const canvas = chartCanvasRef.current;
    if (!canvas) return;

    const Chart = (window as unknown as Record<string, unknown>).Chart as {
      new (ctx: CanvasRenderingContext2D, config: Record<string, unknown>): unknown;
    } | undefined;

    if (!Chart) return;

    // Destroy existing chart
    if (chartInstanceRef.current) {
      (chartInstanceRef.current as { destroy: () => void }).destroy();
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const months = ['Month 1', 'Month 2', 'Month 3', 'Month 4', 'Month 5', 'Month 6',
      'Month 7', 'Month 8', 'Month 9', 'Month 10', 'Month 11', 'Month 12'];

    const revenueData = months.map((_, i) => Math.round(monthlyRevenue * Math.pow(1.15, i)));
    const costData = months.map(() => Math.round(stripeFees + monthlyCosts));

    chartInstanceRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: months,
        datasets: [
          {
            label: 'Projected Revenue',
            data: revenueData,
            borderColor: '#06D6A0',
            backgroundColor: 'rgba(6, 214, 160, 0.1)',
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 3,
          },
          {
            label: 'Costs (Stripe + Ops)',
            data: costData,
            borderColor: '#EF4444',
            borderDash: [5, 5],
            fill: false,
            tension: 0,
            borderWidth: 2,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              usePointStyle: true,
              padding: 20,
              font: { size: 12 },
            },
          },
          tooltip: {
            callbacks: {
              label: (context: { dataset: { label: string }; parsed: { y: number } }) => {
                const value = context.parsed.y;
                return `${context.dataset.label}: ${value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })}`;
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value: number) => `$${value.toLocaleString()}`,
            },
            grid: { color: 'rgba(0,0,0,0.05)' },
          },
          x: {
            grid: { display: false },
          },
        },
      },
    });
  }, [monthlyRevenue, stripeFees, monthlyCosts]);

  // Load Chart.js via CDN
  useEffect(() => {
    const existingScript = document.querySelector('script[src*="chart.js"]');
    if (existingScript) {
      renderChart();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
    script.async = true;
    script.onload = () => renderChart();
    document.head.appendChild(script);

    return () => {
      if (chartInstanceRef.current) {
        (chartInstanceRef.current as { destroy: () => void }).destroy();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render chart when model inputs change
  useEffect(() => {
    renderChart();
  }, [renderChart]);

  const metricCards = metrics
    ? [
        { label: 'Total GMV', value: formatCurrency(metrics.totalGmv), icon: DollarSign, iconBg: 'bg-green-50', iconColor: 'text-green-600' },
        { label: 'Platform Revenue', value: formatCurrency(metrics.platformRevenue), icon: TrendingUp, iconBg: 'bg-primary-50', iconColor: 'text-primary-600' },
        { label: 'This Month Revenue', value: formatCurrency(metrics.thisMonthRevenue), icon: BarChart3, iconBg: 'bg-secondary-50', iconColor: 'text-secondary-600' },
        { label: 'Active Tradies', value: metrics.activeTradies.toLocaleString(), icon: Users, iconBg: 'bg-secondary-50', iconColor: 'text-secondary-600' },
        { label: 'Active Clients', value: metrics.activeClients.toLocaleString(), icon: Users, iconBg: 'bg-warm-50', iconColor: 'text-warm-600' },
        { label: 'Pro Subscribers', value: metrics.proSubscribers.toLocaleString(), icon: CreditCard, iconBg: 'bg-warm-50', iconColor: 'text-warm-600' },
        { label: 'Avg Job Value', value: formatCurrency(metrics.avgJobValue), icon: Briefcase, iconBg: 'bg-primary-50', iconColor: 'text-primary-600' },
        { label: 'Jobs This Month', value: metrics.jobsThisMonth.toLocaleString(), icon: Calculator, iconBg: 'bg-green-50', iconColor: 'text-green-600' },
      ]
    : [];

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-[1600px] mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Financial Projections</h1>
          <p className="text-gray-600 mt-1">Real platform metrics and interactive revenue modelling</p>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {metricCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`p-2.5 ${card.iconBg} rounded-xl`}>
                    <Icon className={`w-5 h-5 ${card.iconColor}`} />
                  </div>
                  <span className="text-sm font-medium text-gray-500">{card.label}</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
              </div>
            );
          })}
        </div>

        {/* Financial Model */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center gap-2 mb-6">
            <Calculator className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-900">Revenue Model</h2>
          </div>

          {/* Sliders */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Active Tradies: {activeTradiesSlider}
              </label>
              <input
                type="range"
                min={1}
                max={500}
                value={activeTradiesSlider}
                onChange={(e) => setActiveTradiesSlider(Number(e.target.value))}
                className="w-full mt-2 accent-emerald-500"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>1</span>
                <span>500</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Jobs per Tradie/Month: {jobsPerTradie}
              </label>
              <input
                type="range"
                min={1}
                max={30}
                value={jobsPerTradie}
                onChange={(e) => setJobsPerTradie(Number(e.target.value))}
                className="w-full mt-2 accent-emerald-500"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>1</span>
                <span>30</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Avg Job Value: {formatCurrencyDollars(avgJobValueSlider)}
              </label>
              <input
                type="range"
                min={50}
                max={5000}
                step={50}
                value={avgJobValueSlider}
                onChange={(e) => setAvgJobValueSlider(Number(e.target.value))}
                className="w-full mt-2 accent-emerald-500"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>$50</span>
                <span>$5,000</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Pro Subscription %: {proSubscriptionPct}%
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={proSubscriptionPct}
                onChange={(e) => setProSubscriptionPct(Number(e.target.value))}
                className="w-full mt-2 accent-emerald-500"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>0%</span>
                <span>100%</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Monthly Costs: {formatCurrencyDollars(monthlyCosts)}
              </label>
              <input
                type="range"
                min={50}
                max={10000}
                step={50}
                value={monthlyCosts}
                onChange={(e) => setMonthlyCosts(Number(e.target.value))}
                className="w-full mt-2 accent-emerald-500"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>$50</span>
                <span>$10,000</span>
              </div>
            </div>
          </div>

          {/* Revenue Breakdown Table */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-gray-50 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Revenue Breakdown</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Free tradie commission (10%)</span>
                  <span className="font-medium text-gray-900">{formatCurrencyDollars(freeCommission)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Pro tradie commission (5%)</span>
                  <span className="font-medium text-gray-900">{formatCurrencyDollars(proCommission)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Stripe surcharge pass-through (1.75%)</span>
                  <span className="font-medium text-gray-900">{formatCurrencyDollars(stripeSurcharge)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Pro subscriptions ({proTradies} x $4.99)</span>
                  <span className="font-medium text-gray-900">{formatCurrencyDollars(subscriptionRevenue)}</span>
                </div>
                <div className="border-t border-gray-200 pt-3 flex justify-between text-sm font-semibold">
                  <span className="text-gray-900">Total Monthly Revenue</span>
                  <span className="text-emerald-600">{formatCurrencyDollars(monthlyRevenue)}</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Cost Breakdown</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Stripe processing (1.75% GMV)</span>
                  <span className="font-medium text-gray-900">{formatCurrencyDollars(totalGmvProjected * 0.0175)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Stripe per-txn ({totalJobs} x $0.30)</span>
                  <span className="font-medium text-gray-900">{formatCurrencyDollars(totalJobs * 0.30)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Operating costs</span>
                  <span className="font-medium text-gray-900">{formatCurrencyDollars(monthlyCosts)}</span>
                </div>
                <div className="border-t border-gray-200 pt-3 flex justify-between text-sm font-semibold">
                  <span className="text-gray-900">Total Monthly Costs</span>
                  <span className="text-red-600">{formatCurrencyDollars(stripeFees + monthlyCosts)}</span>
                </div>
              </div>

              {/* Break-even & Profit */}
              <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
                <div className="flex justify-between text-sm font-semibold">
                  <span className="text-gray-900">Monthly Profit</span>
                  <span className={monthlyProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                    {formatCurrencyDollars(monthlyProfit)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">GMV (projected)</span>
                  <span className="font-medium text-gray-900">{formatCurrencyDollars(totalGmvProjected)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Break-even jobs/month</span>
                  <span className="font-medium text-gray-900">{breakEvenJobs > 0 ? breakEvenJobs : 'N/A'}</span>
                </div>
                <div className={`mt-2 px-3 py-2 rounded-lg text-xs font-medium ${
                  monthlyProfit >= 0
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {monthlyProfit >= 0
                    ? `Profitable at ${totalJobs} jobs/month`
                    : `Need ${breakEvenJobs > 0 ? breakEvenJobs - totalJobs : '?'} more jobs to break even`
                  }
                </div>
              </div>
            </div>
          </div>

          {/* 12-Month Projection Chart */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">12-Month Projection (15% MoM Growth)</h3>
            <div className="bg-gray-50 rounded-xl p-5" style={{ height: '360px' }}>
              <canvas ref={chartCanvasRef} />
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
