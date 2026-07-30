import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  MapPin,
  Star,
  Shield,
  ShieldCheck,
  FileCheck,
  Crown,
  Users,
  Zap,
  Loader2,
  ExternalLink,
  Image as ImageIcon,
  Plus,
  Settings,
  Eye,
  CircleDollarSign,
  Briefcase,
  GraduationCap,
  CheckCircle2,
  Clock,
  Camera,
  Send,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getTradieRating, type TradieRating } from '../lib/reviews';
import { extractSuburb } from '../lib/contactGating';
import type { PortfolioImage } from '../types/database';
import DashboardLayout from '../components/DashboardLayout';
import UserTradeBadges from '../components/UserTradeBadges';
import ReviewsList from '../components/ReviewsList';
import RatingBreakdown from '../components/RatingBreakdown';
import EditableSection from '../components/EditableSection';
import EditBioModal from '../components/profile-editor/EditBioModal';
import EditDetailsModal from '../components/profile-editor/EditDetailsModal';
import EditPortfolioModal from '../components/profile-editor/EditPortfolioModal';
import EditCoverPhotoModal from '../components/profile-editor/EditCoverPhotoModal';
import Toast from '../components/Toast';

export default function MyProfile() {
  const { user, profile, tradieDetails, updateProfile, updateTradieDetails } = useAuth();

  const [rating, setRating] = useState<TradieRating | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioImage[]>([]);
  const [completedJobs, setCompletedJobs] = useState(0);
  const [loading, setLoading] = useState(true);

  const [editBio, setEditBio] = useState(false);
  const [editDetails, setEditDetails] = useState(false);
  const [editPortfolio, setEditPortfolio] = useState(false);
  const [editCoverPhoto, setEditCoverPhoto] = useState(false);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  useEffect(() => {
    if (user) loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);

    const [ratingResult, portfolioResult, jobsResult] = await Promise.all([
      getTradieRating(user.id),
      supabase
        .from('portfolio_images')
        .select('*')
        .eq('tradie_id', user.id)
        .order('sort_order', { ascending: true }),
      supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('tradie_id', user.id)
        .eq('status', 'completed'),
    ]);

    setRating(ratingResult);
    setPortfolio((portfolioResult.data as PortfolioImage[]) || []);
    setCompletedJobs(jobsResult.count || 0);
    setLoading(false);
  };

  const displayName = tradieDetails?.business_name || profile?.full_name || 'My Profile';
  const personalName = tradieDetails?.business_name && profile?.full_name ? profile.full_name : null;
  const suburb = profile ? extractSuburb(profile.address) : '';
  const isPro = tradieDetails?.subscription_tier === 'pro';
  const isIdentityVerified = tradieDetails?.is_verified || profile?.verification_status === 'verified';
  const tradeCategory = tradieDetails?.trade_category;
  const avgRating = rating?.average_rating ?? 4.8;
  const totalReviews = rating?.total_reviews ?? 0;

  const handleSaveBio = async (bio: string) => {
    const { error } = await updateProfile({ bio });
    if (error) {
      setToast({ message: 'Failed to update bio', type: 'error' });
    } else {
      setToast({ message: 'Bio updated', type: 'success' });
    }
  };

  const handleSaveCoverPhoto = async (url: string | null) => {
    const { error } = await updateProfile({ cover_photo_url: url });
    if (error) {
      setToast({ message: 'Failed to update cover photo', type: 'error' });
    } else {
      setToast({ message: url ? 'Cover photo updated' : 'Cover photo removed', type: 'success' });
    }
  };

  const handleSaveDetails = async (values: {
    businessName: string;
    hourlyRate: number | null;
    callOutFee: number | null;
    showCalloutFee: boolean;
    calloutFeeWaived: boolean;
    contractorType: string;
    teamSize: string;
    qualifications: string[];
    serviceRadius: number;
    isEmergencyAvailable: boolean;
  }) => {
    const [profileResult, detailsResult] = await Promise.all([
      updateProfile({
        call_out_fee: values.callOutFee,
        show_callout_fee: values.showCalloutFee,
        callout_fee_waived_on_proceed: values.calloutFeeWaived,
        team_size: values.teamSize,
        service_radius_km: values.serviceRadius,
        is_emergency_available: values.isEmergencyAvailable,
      }),
      updateTradieDetails({
        business_name: values.businessName,
        hourly_rate: values.hourlyRate,
        contractor_type: values.contractorType as 'Solo' | 'Company' | 'Labour Hire',
        qualifications: values.qualifications,
      }),
    ]);

    if (profileResult.error || detailsResult.error) {
      setToast({ message: 'Failed to update details', type: 'error' });
    } else {
      setToast({ message: 'Details updated', type: 'success' });
    }
  };

  if (loading) {
    return (
      <DashboardLayout wide>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 text-ct-mute-2 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout wide>
      <div>
        <div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-ct-paper">My Public Profile</h1>
              <p className="text-sm text-ct-mute mt-0.5">
                This is how clients see your profile. <span className="hidden sm:inline">Hover over any section to edit.</span><span className="sm:hidden">Tap any section to edit.</span>
              </p>
            </div>
            <Link
              to={`/tradie/${user?.id}`}
              target="_blank"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-ct-surface border border-ct-line text-sm font-medium text-ct-mute-2 rounded-ct-md hover:bg-ct-surface-2 hover:border-ct-line transition-colors shadow-sm"
            >
              <Eye className="w-4 h-4" />
              View as Client
              <ExternalLink className="w-3.5 h-3.5 text-ct-mute" />
            </Link>
          </div>

          {/* ====== HERO BANNER ====== */}
          <EditableSection label="Cover Photo" onEdit={() => setEditCoverPhoto(true)} dark>
            <div className="rounded-ct-lg relative overflow-hidden dark-overlay">
              {/* Cover image / gradient as an absolute background so the info
                  block below defines the banner height. This prevents the
                  avatar + business name from overflowing a fixed-height banner
                  and overlapping the header on mobile. */}
              <div className="absolute inset-0">
                {profile?.cover_photo_url ? (
                  <img
                    src={profile.cover_photo_url}
                    alt="Cover"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-ct-surface-2 via-ct-surface to-ct-surface" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
              </div>

              {!profile?.cover_photo_url && (
                <button
                  onClick={() => setEditCoverPhoto(true)}
                  className="absolute top-4 left-4 inline-flex items-center justify-center gap-2 min-h-[44px] px-3 py-1.5 bg-ct-surface/15 backdrop-blur-sm border border-white/20 text-ct-paper/70 text-xs font-medium rounded-ct-sm hover:bg-ct-surface/25 hover:text-ct-paper transition-colors"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Add Cover Photo
                </button>
              )}

              <div className="relative px-6 pb-6 pt-16 min-h-[14rem] sm:min-h-[18rem] flex flex-col justify-end">
                <div className="flex flex-col sm:flex-row items-start gap-5">
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-ct-lg bg-ct-surface-2 overflow-hidden ring-4 ring-white/20 flex-shrink-0 relative group shadow-xl">
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-ct-teal flex items-center justify-center">
                        <span className="text-4xl font-bold text-ct-ink">
                          {profile?.full_name?.charAt(0) || 'T'}
                        </span>
                      </div>
                    )}
                    <Link
                      to="/settings"
                      className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Settings className="w-5 h-5 text-ct-paper" />
                    </Link>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="text-2xl sm:text-3xl font-bold text-ct-paper drop-shadow-sm">{displayName}</h2>
                      {isPro && (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-ct-teal/20 text-ct-teal text-xs font-medium rounded-full border border-ct-teal/30">
                          <Crown className="w-3.5 h-3.5" />
                          PRO
                        </span>
                      )}
                    </div>

                    {personalName && (
                      <p className="text-ct-paper/60 mt-0.5">{personalName}</p>
                    )}

                    <p className="text-ct-teal font-medium capitalize mt-1 drop-shadow-sm">
                      {tradeCategory || 'Trade Professional'}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      {isIdentityVerified && (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-ct-teal/[0.14]/20 text-ct-teal text-xs font-medium rounded-full border border-ct-teal/30">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          ID Verified
                        </span>
                      )}
                      {tradieDetails?.is_insured && (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-ct-surface-2/20 text-ct-mute-2 text-xs font-medium rounded-full border border-ct-teal/30">
                          <Shield className="w-3.5 h-3.5" />
                          Insured
                        </span>
                      )}
                      {tradieDetails?.is_licensed && (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-ct-teal/20 text-ct-teal text-xs font-medium rounded-full border border-ct-teal/30">
                          <FileCheck className="w-3.5 h-3.5" />
                          Licensed
                        </span>
                      )}
                      {profile?.is_emergency_available && (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-ct-rose/[0.13]/20 text-ct-rose text-xs font-medium rounded-full border border-ct-rose/30">
                          <Zap className="w-3.5 h-3.5" />
                          Emergency
                        </span>
                      )}
                    </div>

                    <div className="mt-3">
                      <UserTradeBadges
                        verifiedTrades={profile?.verified_trades || []}
                        declaredTrades={profile?.declared_trades || []}
                        size="md"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </EditableSection>

          {/* ====== STATS BAR ====== */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
            <div className="bg-ct-surface rounded-ct-md border border-ct-line-soft shadow-sm px-4 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-ct-sm bg-ct-amber/[0.13] flex items-center justify-center flex-shrink-0">
                <Star className="w-5 h-5 text-ct-amber" />
              </div>
              <div>
                <p className="text-lg font-bold text-ct-paper">
                  {totalReviews > 0 ? avgRating.toFixed(1) : '4.8'}
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
                  {completedJobs > 0 ? completedJobs : '24'}
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
                  {profile?.service_radius_km || 20}km
                </p>
                <p className="text-xs text-ct-mute">
                  {suburb ? `from ${suburb}` : 'Service Radius'}
                </p>
              </div>
            </div>
          </div>

          {/* ====== PROFILE COMPLETENESS ====== */}
          {(() => {
            const checks = [
              { label: 'Profile photo', done: !!profile?.avatar_url },
              { label: 'Cover photo', done: !!profile?.cover_photo_url },
              { label: 'Bio', done: !!(profile?.bio || tradieDetails?.bio) },
              { label: 'Hourly rate', done: !!tradieDetails?.hourly_rate },
              { label: 'Qualifications', done: (tradieDetails?.qualifications?.length || 0) > 0 },
              { label: 'Portfolio photos', done: portfolio.length > 0 },
              { label: 'Service radius', done: !!profile?.service_radius_km },
              { label: 'Identity verified', done: isIdentityVerified },
              { label: 'Trade category', done: !!tradeCategory },
              { label: 'Address / suburb', done: !!suburb },
            ];
            const done = checks.filter(c => c.done).length;
            const pct = Math.round((done / checks.length) * 100);
            if (pct >= 100) return null;
            return (
              <div className="mt-6 bg-ct-surface rounded-ct-md border border-ct-line-soft shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-ct-paper">Profile Completeness</h3>
                  <span className="text-sm font-bold text-ct-mute-2">{pct}%</span>
                </div>
                <div className="w-full bg-ct-surface-2 rounded-full h-2.5 mb-4">
                  <div className="bg-ct-teal h-2.5 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {checks.filter(c => !c.done).map(c => (
                    <div key={c.label} className="flex items-center gap-2 text-xs text-ct-mute">
                      <div className="w-1.5 h-1.5 rounded-full bg-ct-line flex-shrink-0" />
                      {c.label}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* ====== TWO-COLUMN BODY ====== */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">

            {/* LEFT COLUMN: The Story (spans 2) */}
            <div className="lg:col-span-2 space-y-8">

              {/* About */}
              <EditableSection label="About" onEdit={() => setEditBio(true)}>
                <div className="bg-ct-surface rounded-ct-md border border-ct-line-soft shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-ct-line-soft">
                    <h2 className="text-lg font-semibold text-ct-paper">About</h2>
                  </div>
                  <div className="p-6">
                    {(profile?.bio || tradieDetails?.bio) ? (
                      <p className="text-ct-mute-2 leading-relaxed whitespace-pre-line text-[15px]">
                        {profile?.bio || tradieDetails?.bio}
                      </p>
                    ) : (
                      <button
                        onClick={() => setEditBio(true)}
                        className="w-full border-2 border-dashed border-ct-line rounded-ct-md p-8 text-center hover:border-ct-teal hover:bg-ct-surface-2/30 transition-colors group"
                      >
                        <Plus className="w-6 h-6 text-ct-mute group-hover:text-ct-teal mx-auto mb-2 transition-colors" />
                        <p className="text-sm font-medium text-ct-mute group-hover:text-ct-mute-2 transition-colors">
                          Tell clients why you’re the right tradie for the job
                        </p>
                      </button>
                    )}
                  </div>
                </div>
              </EditableSection>

              {/* Portfolio */}
              <EditableSection label="Portfolio" onEdit={() => setEditPortfolio(true)}>
                <div className="bg-ct-surface rounded-ct-md border border-ct-line-soft shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-ct-line-soft flex items-center justify-between">
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
                      <button
                        onClick={() => setEditPortfolio(true)}
                        className="w-full border-2 border-dashed border-ct-line rounded-ct-md p-8 text-center hover:border-ct-teal hover:bg-ct-surface-2/30 transition-colors group"
                      >
                        <ImageIcon className="w-10 h-10 text-ct-mute group-hover:text-ct-mute mx-auto mb-2 transition-colors" />
                        <p className="text-sm font-medium text-ct-mute group-hover:text-ct-mute-2 transition-colors">
                          Show clients the standard of your work
                        </p>
                      </button>
                    )}
                  </div>
                </div>
              </EditableSection>

              {/* Reviews */}
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
                      <ReviewsList tradieId={user?.id || ''} />
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <Star className="w-10 h-10 text-ct-paper mx-auto mb-3" />
                      <p className="text-ct-mute font-medium mb-1">No reviews yet</p>
                      <p className="text-sm text-ct-mute">
                        Finish a job and your client’s rating lands here
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Fast Facts Sidebar (spans 1) */}
            <div className="lg:col-span-1">
              <div className="lg:sticky lg:top-24 space-y-6">

                {/* Request a Quote (mock) */}
                <div className="bg-ct-surface rounded-ct-md border border-ct-line-soft shadow-sm overflow-hidden">
                  <div className="p-5">
                    <button
                      disabled
                      className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-ct-teal text-ct-ink text-sm font-semibold rounded-ct-md opacity-90 cursor-not-allowed"
                    >
                      <Send className="w-4 h-4" />
                      Request a Quote
                    </button>
                    <p className="text-xs text-ct-mute text-center mt-2.5">
                      This is what clients see on your profile
                    </p>
                  </div>
                </div>

                {/* Details sidebar */}
                <EditableSection label="Details" onEdit={() => setEditDetails(true)}>
                  <div className="bg-ct-surface rounded-ct-md border border-ct-line-soft shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-ct-line-soft">
                      <h3 className="text-sm font-semibold text-ct-paper uppercase tracking-wider">Details</h3>
                    </div>
                    <div className="divide-y divide-ct-line-soft">
                      <DetailRow
                        icon={<CircleDollarSign className="w-4.5 h-4.5 text-ct-teal" />}
                        label="Hourly Rate"
                        value={tradieDetails?.hourly_rate ? `$${tradieDetails.hourly_rate}/hr` : null}
                      />
                      <DetailRow
                        icon={<Briefcase className="w-4 h-4 text-ct-mute-2" />}
                        label="Business Type"
                        value={tradieDetails?.contractor_type || null}
                      />
                      <DetailRow
                        icon={<Users className="w-4 h-4 text-ct-mute-2" />}
                        label="Team Size"
                        value={profile?.team_size || null}
                      />
                      <DetailRow
                        icon={<MapPin className="w-4 h-4 text-ct-mute" />}
                        label="Service Radius"
                        value={profile?.service_radius_km ? `${profile.service_radius_km}km` : null}
                      />

                      {profile?.is_emergency_available && (
                        <div className="px-5 py-3.5 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-ct-sm bg-ct-rose/[0.13] flex items-center justify-center flex-shrink-0">
                            <Zap className="w-4 h-4 text-ct-rose" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-ct-teal">Emergency Available</p>
                          </div>
                        </div>
                      )}

                      {/* Qualifications */}
                      <div className="px-5 py-3.5">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-8 h-8 rounded-ct-sm bg-ct-surface-2 flex items-center justify-center flex-shrink-0">
                            <GraduationCap className="w-4 h-4 text-ct-mute-2" />
                          </div>
                          <p className="text-xs text-ct-mute">Qualifications</p>
                        </div>
                        {tradieDetails?.qualifications && tradieDetails.qualifications.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 ml-11">
                            {tradieDetails.qualifications.map((qual, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center px-2.5 py-1 bg-ct-surface-2 text-ct-mute-2 text-xs font-medium rounded-ct-sm border border-ct-line-soft"
                              >
                                {qual}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-ct-mute italic ml-11">None added</p>
                        )}
                      </div>
                    </div>
                  </div>
                </EditableSection>

                {/* Verification nudge for non-verified tradies */}
                {!isIdentityVerified && !tradieDetails?.is_insured && !tradieDetails?.is_licensed && (
                  <Link
                    to="/settings"
                    className="block bg-ct-surface rounded-ct-md border border-ct-line-soft shadow-sm p-5 hover:border-ct-teal/30 transition-colors group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-ct-sm bg-ct-surface-2 flex items-center justify-center flex-shrink-0">
                        <ShieldCheck className="w-5 h-5 text-ct-mute-2" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-ct-paper group-hover:text-ct-mute-2 transition-colors">
                          Get Verified
                        </p>
                        <p className="text-xs text-ct-mute mt-0.5">
                          Verified tradies get up to 3x more enquiries
                        </p>
                      </div>
                    </div>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ====== LIGHTBOX ====== */}
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

        {/* ====== MODALS ====== */}
        <EditCoverPhotoModal
          isOpen={editCoverPhoto}
          onClose={() => setEditCoverPhoto(false)}
          currentUrl={profile?.cover_photo_url || null}
          userId={user?.id || ''}
          onSave={handleSaveCoverPhoto}
        />

        <EditBioModal
          isOpen={editBio}
          onClose={() => setEditBio(false)}
          currentBio={profile?.bio || tradieDetails?.bio || ''}
          onSave={handleSaveBio}
        />

        <EditDetailsModal
          isOpen={editDetails}
          onClose={() => setEditDetails(false)}
          currentValues={{
            businessName: tradieDetails?.business_name || '',
            hourlyRate: tradieDetails?.hourly_rate || null,
            callOutFee: profile?.call_out_fee || null,
            showCalloutFee: profile?.show_callout_fee ?? true,
            calloutFeeWaived: profile?.callout_fee_waived_on_proceed ?? false,
            contractorType: tradieDetails?.contractor_type || 'Solo',
            teamSize: profile?.team_size || 'Solo',
            qualifications: tradieDetails?.qualifications || [],
            serviceRadius: profile?.service_radius_km || 20,
            isEmergencyAvailable: profile?.is_emergency_available ?? false,
          }}
          onSave={handleSaveDetails}
        />

        <EditPortfolioModal
          isOpen={editPortfolio}
          onClose={() => setEditPortfolio(false)}
          images={portfolio}
          tradieId={user?.id || ''}
          onUpdate={(updated) => setPortfolio(updated)}
        />

        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </div>
    </DashboardLayout>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
}) {
  return (
    <div className="px-5 py-3.5 flex items-center gap-3">
      <div className="w-8 h-8 rounded-ct-sm bg-ct-surface-2 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-ct-mute">{label}</p>
        {value ? (
          <p className="text-sm font-semibold text-ct-paper">{value}</p>
        ) : (
          <p className="text-sm text-ct-mute italic">Not set</p>
        )}
      </div>
    </div>
  );
}
