import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  MapPin,
  Star,
  Shield,
  ShieldCheck,
  FileCheck,
  Crown,
  Users,
  Zap,
  Clock,
  Send,
  Image as ImageIcon,
  LogIn,
  Lock,
  CircleDollarSign,
  Briefcase,
  GraduationCap,
  CheckCircle2,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { TradieWithDetails } from '../types/database';
import { getTradieRating, type TradieRating } from '../lib/reviews';
import { redactName } from '../lib/contactGating';
import UserTradeBadges from '../components/UserTradeBadges';
import { CardSkeleton, ListSkeleton } from '../components/SkeletonLoader';
import ReviewsList from '../components/ReviewsList';
import RatingBreakdown from '../components/RatingBreakdown';
import DashboardLayout from '../components/DashboardLayout';
import SEO from '../components/SEO';

// Matches `.select('id, image_url, caption, sort_order')`; caption and
// sort_order are nullable columns.
interface PortfolioImage {
  id: string;
  image_url: string;
  caption: string | null;
  sort_order: number | null;
}

export default function PublicTradieProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [tradie, setTradie] = useState<TradieWithDetails | null>(null);
  const [rating, setRating] = useState<TradieRating | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioImage[]>([]);
  const [completedJobs, setCompletedJobs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadTradieProfile();
    }
  }, [id]);

  const loadTradieProfile = async () => {
    if (!id) return;
    setLoading(true);

    const [profileResult, ratingResult, portfolioResult, jobsResult] = await Promise.all([
      supabase
        .from('profiles')
        .select(`
          id, full_name, public_suburb, has_phone, postcode, avatar_url,
          is_premium, role, verified_trades, declared_trades,
          verification_status, bio, service_radius_km,
          is_emergency_available, team_size, call_out_fee,
          show_callout_fee, callout_fee_waived_on_proceed,
          cover_photo_url,
          tradie_details (*)
        `)
        .eq('id', id)
        .eq('role', 'tradie')
        .maybeSingle(),
      getTradieRating(id),
      supabase
        .from('portfolio_images')
        .select('id, image_url, caption, sort_order')
        .eq('tradie_id', id)
        .order('sort_order', { ascending: true }),
      supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('tradie_id', id)
        .eq('status', 'completed'),
    ]);

    if (profileResult.error || !profileResult.data) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setTradie(profileResult.data as TradieWithDetails);
    setRating(ratingResult);
    setPortfolio(portfolioResult.data || []);
    setCompletedJobs(jobsResult.count || 0);
    setLoading(false);
  };

  const isLoggedIn = !!user;

  const details = tradie?.tradie_details;
  const isPro = details?.subscription_tier === 'pro' || details?.subscription_tier === 'business' || tradie?.is_premium;
  const displayName = isPro ? (details?.business_name || redactName(tradie?.full_name)) : redactName(tradie?.full_name);
  const personalName = tradie?.full_name ? redactName(tradie.full_name) : null;
  const suburb = tradie?.public_suburb ?? '';
  const isIdentityVerified = details?.is_verified || tradie?.verification_status === 'verified';
  const tradeCategory = details?.trade_category;
  const avgRating = rating?.average_rating ?? 0;
  const totalReviews = rating?.total_reviews ?? 0;

  const tradeCategoryLabel = tradeCategory
    ? tradeCategory.charAt(0).toUpperCase() + tradeCategory.slice(1)
    : 'Tradie';
  const seoTitle = tradie
    ? `${displayName} - ${tradeCategoryLabel}${suburb ? ` in ${suburb}` : ''}`
    : 'Tradie Profile';
  const seoDescription = tradie
    ? `${displayName} is a verified ${tradeCategory || 'trade professional'}${suburb ? ` in ${suburb}` : ''}.${totalReviews > 0 ? ` Rated ${avgRating.toFixed(1)}/5 from ${totalReviews} reviews.` : ''} Request a free quote on ConnecTradie.`
    : 'View this tradie profile on ConnecTradie.';
  const tradieJsonLd = tradie ? {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": displayName,
    "description": details?.bio || `${tradeCategoryLabel} professional on ConnecTradie`,
    "url": `https://connectradie.com/tradie/${id}`,
    ...(tradie.avatar_url ? { "image": tradie.avatar_url } : {}),
    "address": {
      "@type": "PostalAddress",
      ...(suburb ? { "addressLocality": suburb } : {}),
      "addressCountry": "AU"
    },
    ...(details?.hourly_rate ? { "priceRange": `From $${details.hourly_rate}/hr` } : {}),
    ...(totalReviews > 0 ? {
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": avgRating.toFixed(1),
        "reviewCount": totalReviews,
        "bestRating": "5",
        "worstRating": "1"
      }
    } : {})
  } : undefined;

  const handleRequestQuote = () => {
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }
    navigate(`/post-lead?assignee=${id}&category=${encodeURIComponent(tradeCategory || '')}`);
  };

  const content = (
    <div className="min-h-screen bg-ct-surface">
      <SEO
        title={seoTitle}
        description={seoDescription}
        canonical={`/tradie/${id}`}
        ogImage={tradie?.avatar_url || undefined}
        jsonLd={tradieJsonLd}
      />
      {!isLoggedIn && (
        <header className="sticky top-0 z-30 bg-ct-surface border-b border-ct-line-soft">
          <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between">
            <Link to="/" className="flex items-center">
              <span className="text-2xl font-extrabold tracking-tight text-ct-paper">
                Connec<span className="text-ct-teal">Tradie</span>
              </span>
            </Link>
            <div className="flex items-center gap-3">
              <Link
                to="/search"
                className="text-sm text-ct-mute-2 hover:text-ct-paper font-medium transition-colors"
              >
                Find Tradies
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-ct-teal text-ct-ink text-sm font-medium rounded-ct-sm hover:brightness-110 transition-colors"
              >
                <LogIn className="w-4 h-4" />
                Sign In
              </Link>
            </div>
          </div>
        </header>
      )}

      {loading && (
        <div className="max-w-4xl mx-auto px-4 py-8">
          <CardSkeleton />
          <div className="mt-4"><ListSkeleton rows={3} /></div>
        </div>
      )}

      {notFound && !loading && (
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <div className="w-16 h-16 bg-ct-surface-2 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-ct-mute" />
          </div>
          <h1 className="text-2xl font-bold text-ct-paper mb-2">Profile Not Found</h1>
          <p className="text-ct-mute mb-6">This tradie profile doesn't exist or is no longer available.</p>
          <button
            onClick={() => navigate('/search')}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-ct-teal text-ct-ink font-medium rounded-ct-sm hover:brightness-110 transition-colors"
          >
            Browse Tradies
          </button>
        </div>
      )}

      {tradie && !loading && (
        <div className="max-w-[1600px] mx-auto">
          {/* Cover photo */}
          <div className="relative overflow-hidden" style={{ height: 200 }}>
            {tradie.cover_photo_url ? (
              <img
                src={tradie.cover_photo_url}
                alt="Cover"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-ct-teal/[0.14] to-ct-ink" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />

            <button
              onClick={() => navigate(-1)}
              className="absolute top-4 left-4 inline-flex items-center gap-1.5 px-3 py-1.5 bg-ct-surface/15 backdrop-blur-sm border border-white/20 text-ct-paper/90 text-sm font-medium rounded-ct-sm hover:bg-ct-surface/25 hover:text-ct-ink transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          </div>

          {/* Profile header card - overlaps cover */}
          <div className="relative px-4 sm:px-6 -mt-16">
            <div className="bg-ct-surface rounded-ct-lg border border-ct-line-soft shadow-sm p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row items-start gap-5">
                {/* Avatar */}
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden ring-4 ring-white shadow-lg flex-shrink-0 -mt-16 sm:-mt-20">
                  {tradie.avatar_url ? (
                    <img
                      src={tradie.avatar_url}
                      alt={displayName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-ct-teal flex items-center justify-center">
                      <span className="text-4xl font-bold text-ct-ink">
                        {tradie.full_name?.charAt(0) || 'T'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Name & info */}
                <div className="flex-1 min-w-0 sm:-mt-2">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h1 className="text-2xl sm:text-3xl font-bold text-ct-paper tracking-tight">
                      {displayName}
                    </h1>
                    {isPro && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-ct-amber/[0.13] text-ct-amber text-xs font-semibold rounded-full border border-ct-amber/[0.34]">
                        <Crown className="w-3.5 h-3.5" />
                        PRO
                      </span>
                    )}
                    {!isPro && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 bg-ct-surface-2 text-ct-mute text-xs font-medium rounded-full">
                        <Lock className="w-3 h-3" />
                        Free listing
                      </span>
                    )}
                  </div>

                  {isPro && details?.business_name && personalName && (
                    <p className="text-ct-mute mt-0.5 text-sm">{personalName}</p>
                  )}

                  <p className="text-ct-mute-2 font-semibold capitalize mt-1 text-sm">
                    {tradeCategory || 'Trade Professional'}
                    {suburb && <span className="text-ct-mute font-normal"> · {suburb}</span>}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    {isIdentityVerified && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-ct-teal/[0.14] text-ct-teal text-xs font-semibold rounded-full border border-ct-teal/30">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        ID Verified
                      </span>
                    )}
                    {details?.is_insured && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-ct-surface-2 text-ct-mute-2 text-xs font-semibold rounded-full border border-ct-line">
                        <Shield className="w-3.5 h-3.5" />
                        Insured
                      </span>
                    )}
                    {details?.is_licensed && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-ct-amber/[0.13] text-ct-amber text-xs font-semibold rounded-full border border-ct-amber/[0.34]">
                        <FileCheck className="w-3.5 h-3.5" />
                        Licensed
                      </span>
                    )}
                    {tradie.is_emergency_available && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-ct-rose/[0.13] text-ct-rose text-xs font-semibold rounded-full border border-ct-rose/[0.34]">
                        <Zap className="w-3.5 h-3.5" />
                        Emergency
                      </span>
                    )}
                  </div>

                  <div className="mt-3">
                    <UserTradeBadges
                      verifiedTrades={tradie.verified_trades || []}
                      declaredTrades={tradie.declared_trades || []}
                      size="md"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4 px-4 sm:px-6">
            <div className="bg-ct-surface rounded-ct-md border border-ct-line-soft shadow-sm px-4 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-ct-sm bg-ct-amber/[0.13] flex items-center justify-center flex-shrink-0">
                <Star className="w-5 h-5 text-ct-amber" />
              </div>
              <div>
                <p className="text-lg font-bold text-ct-paper">
                  {totalReviews > 0 ? avgRating.toFixed(1) : '--'}
                </p>
                <p className="text-xs text-ct-mute">
                  {totalReviews > 0 ? `${totalReviews} reviews` : 'Rating'}
                </p>
              </div>
            </div>
            <div className="bg-ct-surface rounded-ct-md border border-ct-line-soft shadow-sm px-4 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-ct-sm bg-ct-teal/[0.14] flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-5 h-5 text-ct-teal" />
              </div>
              <div>
                <p className="text-lg font-bold text-ct-paper">
                  {completedJobs > 0 ? completedJobs : '--'}
                </p>
                <p className="text-xs text-ct-mute">Jobs Completed</p>
              </div>
            </div>
            <div className="bg-ct-surface rounded-ct-md border border-ct-line-soft shadow-sm px-4 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-ct-sm bg-ct-surface-2 flex items-center justify-center flex-shrink-0">
                <Clock className="w-5 h-5 text-ct-mute-2" />
              </div>
              <div>
                <p className="text-lg font-bold text-ct-paper">&lt; 1 hr</p>
                <p className="text-xs text-ct-mute">Response Time</p>
              </div>
            </div>
            <div className="bg-ct-surface rounded-ct-md border border-ct-line-soft shadow-sm px-4 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-ct-sm bg-ct-surface-2 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-5 h-5 text-ct-mute-2" />
              </div>
              <div>
                <p className="text-lg font-bold text-ct-paper">
                  {tradie.service_radius_km || 20}km
                </p>
                <p className="text-xs text-ct-mute">
                  {suburb ? `from ${suburb}` : 'Service Radius'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6 px-4 sm:px-6 pb-32 lg:pb-8">
            <div className="lg:col-span-2 space-y-8">

              {(tradie.bio || details?.bio) && (
                <div className="bg-ct-surface rounded-ct-md border border-ct-line-soft shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-ct-line-soft">
                    <h2 className="text-lg font-semibold text-ct-paper">About</h2>
                  </div>
                  <div className="p-6">
                    <p className="text-ct-mute-2 leading-relaxed whitespace-pre-line text-[0.9375rem]">
                      {tradie.bio || details?.bio}
                    </p>
                  </div>
                </div>
              )}

              <div className="bg-ct-surface rounded-ct-md border border-ct-line-soft shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-ct-line-soft">
                  <h2 className="text-lg font-semibold text-ct-paper">
                    Portfolio
                    {portfolio.length > 0 && (
                      <span className="text-sm font-normal text-ct-mute ml-2">
                        {portfolio.length} {portfolio.length === 1 ? 'photo' : 'photos'}
                      </span>
                    )}
                  </h2>
                </div>
                <div className="p-6">
                  {portfolio.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {portfolio.map((img) => (
                        <button
                          key={img.id}
                          onClick={() => setLightboxImage(img.image_url)}
                          className="group aspect-[4/3] rounded-ct-md overflow-hidden bg-ct-surface-2 relative focus:outline-none focus:ring-2 focus:ring-ct-teal focus:ring-offset-2"
                        >
                          <img
                            src={img.image_url}
                            alt={img.caption || 'Portfolio work'}
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          {img.caption && (
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                              <p className="text-ct-paper text-xs leading-snug">{img.caption}</p>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <ImageIcon className="w-10 h-10 text-ct-paper mx-auto mb-2" />
                      <p className="text-ct-mute text-sm">No portfolio images yet.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-ct-surface rounded-ct-md border border-ct-line-soft shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-ct-line-soft">
                  <h2 className="text-lg font-semibold text-ct-paper">Client Reviews</h2>
                </div>
                <div className="p-6">
                  {rating && rating.total_reviews > 0 ? (
                    <>
                      <div className="mb-6">
                        <RatingBreakdown rating={rating} />
                      </div>
                      <ReviewsList tradieId={id!} />
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <Star className="w-10 h-10 text-ct-paper mx-auto mb-3" />
                      <p className="text-ct-mute font-medium mb-1">No reviews yet</p>
                      <p className="text-sm text-ct-mute">
                        Reviews will appear here once clients leave feedback
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="lg:col-span-1">
              <div className="lg:sticky lg:top-24 space-y-6">

                <div className="bg-ct-surface rounded-ct-md border border-ct-line-soft shadow-sm overflow-hidden">
                  <div className="p-5">
                    <h3 className="font-semibold text-ct-paper mb-1">
                      Get a quote from {displayName}
                    </h3>
                    <p className="text-sm text-ct-mute mb-4">
                      Describe your job and receive a personalised quote directly.
                    </p>
                    <button
                      onClick={handleRequestQuote}
                      className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-ct-teal text-ct-ink font-semibold rounded-ct-md hover:brightness-110 transition-colors min-h-[48px] shadow-sm"
                    >
                      <Send className="w-4 h-4" />
                      Request a Quote
                    </button>
                    {!isLoggedIn && (
                      <p className="text-xs text-ct-mute text-center mt-3">
                        You'll need to sign in to send a request.
                      </p>
                    )}

                    {details?.hourly_rate && (
                      <div className="mt-4 pt-4 border-t border-ct-line-soft">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-ct-mute">Starting from</span>
                          <span className="font-semibold text-ct-paper">
                            ${details.hourly_rate}/hr
                          </span>
                        </div>
                      </div>
                    )}

                    {rating && rating.total_reviews > 0 && (
                      <div className="mt-3 pt-3 border-t border-ct-line-soft">
                        <div className="flex items-center gap-1.5">
                          <Star className="w-4 h-4 fill-ct-amber text-ct-amber" />
                          <span className="font-semibold text-ct-paper text-sm">
                            {rating.average_rating.toFixed(1)}
                          </span>
                          <span className="text-ct-mute text-sm">
                            ({rating.total_reviews} {rating.total_reviews === 1 ? 'review' : 'reviews'})
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-ct-surface rounded-ct-md border border-ct-line-soft shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-ct-line-soft">
                    <h3 className="text-sm font-semibold text-ct-paper uppercase tracking-wider">Details</h3>
                  </div>
                  <div className="divide-y divide-ct-line-soft">
                    <DetailRow
                      icon={<CircleDollarSign className="w-4.5 h-4.5 text-ct-teal" />}
                      iconBg="bg-ct-teal/[0.14]"
                      label="Hourly Rate"
                      value={details?.hourly_rate ? `$${details.hourly_rate}/hr` : null}
                    />

                    <DetailRow
                      icon={<Briefcase className="w-4 h-4 text-ct-mute-2" />}
                      iconBg="bg-ct-surface-2"
                      label="Business Type"
                      value={details?.contractor_type || null}
                    />
                    <DetailRow
                      icon={<Users className="w-4 h-4 text-ct-mute-2" />}
                      iconBg="bg-ct-surface-2"
                      label="Team Size"
                      value={tradie.team_size || null}
                    />
                    <DetailRow
                      icon={<MapPin className="w-4 h-4 text-ct-mute" />}
                      iconBg="bg-ct-surface-2"
                      label="Service Radius"
                      value={tradie.service_radius_km ? `${tradie.service_radius_km}km` : null}
                    />

                    {tradie.is_emergency_available && (
                      <div className="px-5 py-3.5 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-ct-sm bg-ct-rose/[0.13] flex items-center justify-center flex-shrink-0">
                          <Zap className="w-4 h-4 text-ct-rose" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-ct-teal">Emergency Available</p>
                        </div>
                      </div>
                    )}

                    {details?.qualifications && details.qualifications.length > 0 && (
                      <div className="px-5 py-3.5">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-8 h-8 rounded-ct-sm bg-ct-surface-2 flex items-center justify-center flex-shrink-0">
                            <GraduationCap className="w-4 h-4 text-ct-mute-2" />
                          </div>
                          <p className="text-xs text-ct-mute">Qualifications</p>
                        </div>
                        <div className="flex flex-wrap gap-1.5 ml-11">
                          {details.qualifications.map((qual, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center px-2.5 py-1 bg-ct-surface-2 text-ct-mute-2 text-xs font-medium rounded-ct-sm border border-ct-line-soft"
                            >
                              {qual}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {(isIdentityVerified || details?.is_insured || details?.is_licensed) && (
                  <div className="bg-ct-teal/[0.14] rounded-ct-md border border-ct-teal/30 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <ShieldCheck className="w-4 h-4 text-ct-teal" />
                      <span className="text-sm font-semibold text-ct-teal">Verified Professional</span>
                    </div>
                    <ul className="space-y-1.5 text-sm text-ct-teal">
                      {isIdentityVerified && (
                        <li className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                          Identity confirmed
                        </li>
                      )}
                      {details?.is_insured && (
                        <li className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                          Insurance on file
                        </li>
                      )}
                      {details?.is_licensed && (
                        <li className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                          Licensed & qualified
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="lg:hidden fixed bottom-0 inset-x-0 bg-ct-surface border-t border-ct-line p-4 z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-ct-paper text-sm truncate">{displayName}</p>
                {rating && rating.total_reviews > 0 && (
                  <div className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-ct-amber text-ct-amber" />
                    <span className="text-xs text-ct-mute-2">
                      {rating.average_rating.toFixed(1)} ({rating.total_reviews})
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={handleRequestQuote}
                className="inline-flex items-center gap-2 px-5 py-3 bg-ct-teal text-ct-ink font-semibold rounded-ct-md hover:brightness-110 transition-colors min-h-[48px] shadow-sm"
              >
                <Send className="w-4 h-4" />
                Request a Quote
              </button>
            </div>
          </div>

          {lightboxImage && (
            <div
              className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
              onClick={() => setLightboxImage(null)}
            >
              <button
                onClick={() => setLightboxImage(null)}
                className="absolute top-4 right-4 text-ct-ink/80 hover:text-ct-ink transition-colors p-2"
              >
                <X className="w-6 h-6" />
              </button>
              <img
                src={lightboxImage}
                alt="Portfolio full view"
                className="max-w-full max-h-[85vh] rounded-ct-sm object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (isLoggedIn) {
    return <DashboardLayout>{content}</DashboardLayout>;
  }

  return content;
}

function DetailRow({
  icon,
  iconBg = 'bg-ct-surface-2',
  label,
  value,
}: {
  icon: React.ReactNode;
  iconBg?: string;
  label: string;
  value: string | null;
}) {
  return (
    <div className="px-5 py-3.5 flex items-center gap-3">
      <div className={`w-8 h-8 rounded-ct-sm ${iconBg} flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-ct-mute">{label}</p>
        {value ? (
          <p className="text-sm font-semibold text-ct-paper">{value}</p>
        ) : (
          <p className="text-sm text-ct-mute italic">Not listed</p>
        )}
      </div>
    </div>
  );
}
