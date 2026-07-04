import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  MapPin, DollarSign, Briefcase, BadgeCheck, CalendarDays, ArrowLeft, Loader2,
  Building2, Clock, GraduationCap, ArrowRight, CheckCircle2,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import SEO from '../components/SEO';
import { supabase } from '../lib/supabase';
import type { PublicVacancy } from '../types/database';
import {
  formatPay, employmentLabel, ROLE_LABELS, EMPLOYMENT_SCHEMA, PAY_UNIT_TEXT,
} from '../lib/vacancyOptions';
import { TRADE_CATEGORIES } from '../lib/tradeCategories';

function tradeLabel(value: string) {
  return TRADE_CATEGORIES.find(c => c.value === value)?.label || value;
}
function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
}

export default function CareerDetailPublic() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [v, setV] = useState<PublicVacancy | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('public_vacancies').select('*').eq('id', id).maybeSingle();
      setV((data as PublicVacancy) || null);
      setLoading(false);
    })();
  }, [id]);

  // Inject JobPosting structured data + set the document title/canonical
  // imperatively. Helmet is unreliable for these dynamic bits on this app (and
  // the App-level effect overrides document.title per route), so for the job
  // page — where the JobPosting JSON-LD is the whole SEO point — manage them
  // directly so Google Jobs can always read them.
  useEffect(() => {
    if (!v) return;
    const employer = v.employer_business_name || v.employer_name || 'A ConnecTradie business';
    const jobLd: Record<string, unknown> = {
      '@context': 'https://schema.org/',
      '@type': 'JobPosting',
      title: v.title,
      description: v.description,
      datePosted: v.created_at,
      hiringOrganization: { '@type': 'Organization', name: employer },
      jobLocation: {
        '@type': 'Place',
        address: { '@type': 'PostalAddress', addressLocality: v.location || undefined, addressCountry: 'AU' },
      },
      directApply: false,
    };
    if (v.closing_date) jobLd.validThrough = v.closing_date;
    if (v.employment_type) jobLd.employmentType = EMPLOYMENT_SCHEMA[v.employment_type];
    if (v.pay_min != null || v.pay_max != null) {
      jobLd.baseSalary = {
        '@type': 'MonetaryAmount',
        currency: 'AUD',
        value: {
          '@type': 'QuantitativeValue',
          minValue: v.pay_min ?? v.pay_max,
          maxValue: v.pay_max ?? v.pay_min,
          unitText: PAY_UNIT_TEXT[v.pay_period ?? 'hour'],
        },
      };
    }

    const prevTitle = document.title;
    document.title = `${v.title}${v.location ? ' — ' + v.location : ''} | ConnecTradie`;

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'jobposting-jsonld';
    script.textContent = JSON.stringify(jobLd).replace(/</g, '\\u003c'); // guard against </script> in text
    document.head.appendChild(script);

    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    const prevHref = link?.getAttribute('href') ?? null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.setAttribute('href', `https://connectradie.com/careers/${v.id}`);

    return () => {
      document.getElementById('jobposting-jsonld')?.remove();
      document.title = prevTitle;
      if (prevHref !== null && link) link.setAttribute('href', prevHref);
    };
  }, [v]);

  if (loading) {
    return (
      <div className="min-h-screen bg-navy-900 theme-aware flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
        <Footer />
      </div>
    );
  }

  if (!v) {
    return (
      <div className="min-h-screen bg-navy-900 font-sans theme-aware flex flex-col">
        <SEO title="Role no longer available" description="This trade role is no longer open." canonical={`/careers/${id}`} noindex />
        <Navbar />
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="text-center py-20">
            <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Briefcase className="w-7 h-7 text-gray-300" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">This role is no longer open</h1>
            <p className="text-sm text-gray-500 mt-1">It may have closed or been filled.</p>
            <Link to="/careers" className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 transition-colors">
              Browse open roles
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const employer = v.employer_business_name || v.employer_name || 'A ConnecTradie business';
  const pay = formatPay(v);
  const posted = new Date(v.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

  const facts: { icon: typeof MapPin; label: string; value: string }[] = [
    { icon: Briefcase, label: 'Trade', value: tradeLabel(v.trade_category) },
    ...(v.employment_type ? [{ icon: Clock, label: 'Type', value: employmentLabel(v.employment_type) }] : []),
    ...(v.location ? [{ icon: MapPin, label: 'Location', value: v.location }] : []),
    ...(pay ? [{ icon: DollarSign, label: 'Pay', value: pay }] : []),
    ...(v.hours ? [{ icon: Clock, label: 'Hours', value: v.hours }] : []),
    ...(v.experience_level ? [{ icon: GraduationCap, label: 'Experience', value: v.experience_level }] : []),
    ...(fmtDate(v.start_date) ? [{ icon: CalendarDays, label: 'Start', value: fmtDate(v.start_date)! }] : []),
    ...(fmtDate(v.closing_date) ? [{ icon: CalendarDays, label: 'Applications close', value: fmtDate(v.closing_date)! }] : []),
  ];

  return (
    <div className="min-h-screen bg-navy-900 font-sans antialiased theme-aware flex flex-col">
      {/* SEO drives og/twitter/description; title, canonical and the JobPosting
          JSON-LD are set imperatively in the effect above (Helmet is unreliable
          for those here). */}
      <SEO
        title={`${v.title}${v.location ? ' — ' + v.location : ''}`}
        description={v.description.slice(0, 155).replace(/\s+/g, ' ').trim()}
      />
      <Navbar />
      <main id="main-content" className="flex-1">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16 lg:pt-28">
          <button onClick={() => navigate('/careers')} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-6">
            <ArrowLeft className="w-4 h-4" /> All trade jobs
          </button>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Main */}
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-secondary-50 text-secondary-700 border border-secondary-200">
                  {ROLE_LABELS[v.role_type]}
                </span>
                {v.employment_type && (
                  <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                    {employmentLabel(v.employment_type)}
                  </span>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-[-0.02em] leading-tight">{v.title}</h1>

              <div className="flex items-center gap-2 mt-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-gray-500" />
                </div>
                <span className="text-sm font-medium text-gray-700">{employer}</span>
                {v.employer_verified && <BadgeCheck className="w-4 h-4 text-primary-500" />}
                <span className="text-xs text-gray-400">· Posted {posted}</span>
              </div>

              {pay && (
                <div className="flex items-center gap-1.5 mt-4 text-lg font-bold text-emerald-600">
                  <DollarSign className="w-5 h-5" />
                  {pay}
                </div>
              )}

              {v.required_tickets.length > 0 && (
                <div className="mt-6">
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tickets &amp; licences</h2>
                  <div className="flex flex-wrap gap-2">
                    {v.required_tickets.map(t => (
                      <span key={t} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm bg-gray-50 text-gray-700 border border-gray-200">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">About the role</h2>
                <p className="text-[15px] text-gray-700 leading-relaxed whitespace-pre-wrap">{v.description}</p>
              </div>
            </div>

            {/* Sidebar */}
            <aside className="lg:col-span-1">
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm lg:sticky lg:top-24">
                <Link
                  to="/register?type=tradie"
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 transition-colors"
                >
                  Apply — it’s free
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <p className="text-center text-xs text-gray-500 mt-2">
                  Already have an account?{' '}
                  <Link to="/login" className="text-primary-600 font-medium hover:underline">Sign in</Link>
                </p>

                <div className="mt-5 pt-5 border-t border-gray-100 space-y-3">
                  {facts.map((f, i) => {
                    const Icon = f.icon;
                    return (
                      <div key={i} className="flex items-start gap-2.5">
                        <Icon className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-[11px] text-gray-400 uppercase tracking-wide font-semibold">{f.label}</p>
                          <p className="text-sm text-gray-800">{f.value}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
