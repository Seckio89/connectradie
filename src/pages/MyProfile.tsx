import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  MapPin,
  Star,
  Shield,
  ShieldCheck,
  FileCheck,
  Crown,
  Truck,
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
    setPortfolio(portfolioResult.data || []);
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
      <DashboardLayout>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-6xl mx-auto">

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">My Public Profile</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                This is how clients see your profile. Hover over any section to edit.
              </p>
            </div>
            <Link
              to={`/tradie/${user?.id}`}
              target="_blank"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-sm font-medium text-gray-700 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-sm"
            >
              <Eye className="w-4 h-4" />
              View as Client
              <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
            </Link>
          </div>

          {/* ====== HERO BANNER ====== */}
          <EditableSection label="Cover Photo" onEdit={() => setEditCoverPhoto(true)} dark>
            <div className="rounded-2xl relative overflow-hidden">
              {profile?.cover_photo_url ? (
                <img
                  src={profile.cover_photo_url}
                  alt="Cover"
                  className="w-full h-56 sm:h-72 object-cover"
                />
              ) : (
                <div className="w-full h-56 sm:h-72 bg-gradient-to-br from-gray-700 via-gray-800 to-gray-900" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />

              {!profile?.cover_photo_url && (
                <button
                  onClick={() => setEditCoverPhoto(true)}
                  className="absolute top-4 left-4 inline-flex items-center gap-2 px-3 py-1.5 bg-white/15 backdrop-blur-sm border border-white/20 text-white/70 text-xs font-medium rounded-lg hover:bg-white/25 hover:text-white transition-colors"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Add Cover Photo
                </button>
              )}

              <div className="absolute inset-x-0 bottom-0 px-6 pb-6 pt-16">
                <div className="flex flex-col sm:flex-row items-start gap-5">
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-gray-700 overflow-hidden ring-4 ring-white/20 flex-shrink-0 relative group shadow-xl">
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-primary-600 flex items-center justify-center">
                        <span className="text-4xl font-bold text-white">
                          {profile?.full_name?.charAt(0) || 'T'}
                        </span>
                      </div>
                    )}
                    <Link
                      to="/settings"
                      className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Settings className="w-5 h-5 text-white" />
                    </Link>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="text-2xl sm:text-3xl font-bold text-white drop-shadow-sm">{displayName}</h2>
                      {isPro && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-500/20 text-amber-300 text-xs font-semibold rounded-full border border-amber-500/30">
                          <Crown className="w-3.5 h-3.5" />
                          PRO
                        </span>
                      )}
                    </div>

                    {personalName && (
                      <p className="text-white/60 mt-0.5">{personalName}</p>
                    )}

                    <p className="text-primary-300 font-medium capitalize mt-1 drop-shadow-sm">
                      {tradeCategory || 'Trade Professional'}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      {isIdentityVerified && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-500/20 text-green-300 text-xs font-semibold rounded-full border border-green-500/30">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          ID Verified
                        </span>
                      )}
                      {tradieDetails?.is_insured && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-500/20 text-blue-300 text-xs font-semibold rounded-full border border-blue-500/30">
                          <Shield className="w-3.5 h-3.5" />
                          Insured
                        </span>
                      )}
                      {tradieDetails?.is_licensed && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-500/20 text-amber-300 text-xs font-semibold rounded-full border border-amber-500/30">
                          <FileCheck className="w-3.5 h-3.5" />
                          Licensed
                        </span>
                      )}
                      {profile?.is_emergency_available && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-500/20 text-red-300 text-xs font-semibold rounded-full border border-red-500/30">
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
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                <Star className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">
                  {totalReviews > 0 ? avgRating.toFixed(1) : '4.8'}
                </p>
                <p className="text-xs text-gray-500">
                  {totalReviews > 0 ? `${totalReviews} reviews` : 'Rating'}
                </p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">
                  {completedJobs > 0 ? completedJobs : '24'}
                </p>
                <p className="text-xs text-gray-500">Jobs Completed</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">&lt; 1 hr</p>
                <p className="text-xs text-gray-500">Response Time</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">
                  {profile?.service_radius_km || 20}km
                </p>
                <p className="text-xs text-gray-500">
                  {suburb ? `from ${suburb}` : 'Service Radius'}
                </p>
              </div>
            </div>
          </div>

          {/* ====== TWO-COLUMN BODY ====== */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">

            {/* LEFT COLUMN: The Story (spans 2) */}
            <div className="lg:col-span-2 space-y-8">

              {/* About */}
              <EditableSection label="About" onEdit={() => setEditBio(true)}>
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-900">About</h2>
                  </div>
                  <div className="p-6">
                    {(profile?.bio || tradieDetails?.bio) ? (
                      <p className="text-gray-700 leading-relaxed whitespace-pre-line text-[15px]">
                        {profile?.bio || tradieDetails?.bio}
                      </p>
                    ) : (
                      <button
                        onClick={() => setEditBio(true)}
                        className="w-full border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-primary-400 hover:bg-primary-50/30 transition-colors group"
                      >
                        <Plus className="w-6 h-6 text-gray-300 group-hover:text-primary-500 mx-auto mb-2 transition-colors" />
                        <p className="text-sm font-medium text-gray-400 group-hover:text-primary-600 transition-colors">
                          Add a bio to tell clients about your experience
                        </p>
                      </button>
                    )}
                  </div>
                </div>
              </EditableSection>

              {/* Portfolio */}
              <EditableSection label="Portfolio" onEdit={() => setEditPortfolio(true)}>
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-900">
                      Portfolio
                      {portfolio.length > 0 && (
                        <span className="text-sm font-normal text-gray-400 ml-2">
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
                            className="group aspect-[4/3] rounded-xl overflow-hidden bg-gray-100 relative focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                          >
                            <img
                              src={img.image_url}
                              alt={img.caption || 'Portfolio work'}
                              loading="lazy"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            {img.caption && (
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                <p className="text-white text-xs leading-snug">{img.caption}</p>
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditPortfolio(true)}
                        className="w-full border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-primary-400 hover:bg-primary-50/30 transition-colors group"
                      >
                        <ImageIcon className="w-10 h-10 text-gray-300 group-hover:text-primary-400 mx-auto mb-2 transition-colors" />
                        <p className="text-sm font-medium text-gray-400 group-hover:text-primary-600 transition-colors">
                          Add portfolio photos to showcase your work
                        </p>
                      </button>
                    )}
                  </div>
                </div>
              </EditableSection>

              {/* Reviews */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h2 className="text-lg font-semibold text-gray-900">Client Reviews</h2>
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
                      <Star className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                      <p className="text-gray-500 font-medium mb-1">No reviews yet</p>
                      <p className="text-sm text-gray-400">
                        Reviews will appear here once clients leave feedback
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
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-5">
                    <button
                      disabled
                      className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-primary-600 text-white text-sm font-semibold rounded-xl opacity-90 cursor-not-allowed"
                    >
                      <Send className="w-4 h-4" />
                      Request a Quote
                    </button>
                    <p className="text-xs text-gray-400 text-center mt-2.5">
                      This is what clients see on your profile
                    </p>
                  </div>
                </div>

                {/* Details sidebar */}
                <EditableSection label="Details" onEdit={() => setEditDetails(true)}>
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100">
                      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Details</h3>
                    </div>
                    <div className="divide-y divide-gray-50">
                      <DetailRow
                        icon={<CircleDollarSign className="w-4.5 h-4.5 text-green-600" />}
                        label="Hourly Rate"
                        value={tradieDetails?.hourly_rate ? `$${tradieDetails.hourly_rate}/hr` : null}
                      />
                      <div className="px-5 py-3.5 flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Truck className="w-4 h-4 text-orange-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-500">Call-out Fee</p>
                          {profile?.call_out_fee && profile?.show_callout_fee ? (
                            <div>
                              <p className="text-sm font-semibold text-gray-900">${profile.call_out_fee}</p>
                              {profile.callout_fee_waived_on_proceed && (
                                <p className="text-xs text-green-600 font-medium mt-0.5">Waived if you proceed</p>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-400 italic">
                              {profile?.call_out_fee ? 'Hidden' : 'Not set'}
                            </p>
                          )}
                        </div>
                      </div>
                      <DetailRow
                        icon={<Briefcase className="w-4 h-4 text-blue-600" />}
                        label="Business Type"
                        value={tradieDetails?.contractor_type || null}
                      />
                      <DetailRow
                        icon={<Users className="w-4 h-4 text-teal-600" />}
                        label="Team Size"
                        value={profile?.team_size || null}
                      />
                      <DetailRow
                        icon={<MapPin className="w-4 h-4 text-gray-500" />}
                        label="Service Radius"
                        value={profile?.service_radius_km ? `${profile.service_radius_km}km` : null}
                      />

                      {profile?.is_emergency_available && (
                        <div className="px-5 py-3.5 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                            <Zap className="w-4 h-4 text-red-600" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-green-700">Emergency Available</p>
                          </div>
                        </div>
                      )}

                      {/* Qualifications */}
                      <div className="px-5 py-3.5">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                            <GraduationCap className="w-4 h-4 text-gray-600" />
                          </div>
                          <p className="text-xs text-gray-500">Qualifications</p>
                        </div>
                        {tradieDetails?.qualifications && tradieDetails.qualifications.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 ml-11">
                            {tradieDetails.qualifications.map((qual, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center px-2.5 py-1 bg-gray-50 text-gray-700 text-xs font-medium rounded-lg border border-gray-100"
                              >
                                {qual}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400 italic ml-11">None added</p>
                        )}
                      </div>
                    </div>
                  </div>
                </EditableSection>

                {/* Verification nudge for non-verified tradies */}
                {!isIdentityVerified && !tradieDetails?.is_insured && !tradieDetails?.is_licensed && (
                  <Link
                    to="/settings"
                    className="block bg-white rounded-xl border border-gray-100 shadow-sm p-5 hover:border-primary-300 transition-colors group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
                        <ShieldCheck className="w-5 h-5 text-primary-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 group-hover:text-primary-700 transition-colors">
                          Get Verified
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
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
              className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors p-2"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={lightboxImage}
              alt="Portfolio full view"
              className="max-w-full max-h-[85vh] rounded-lg object-contain"
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
      <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        {value ? (
          <p className="text-sm font-semibold text-gray-900">{value}</p>
        ) : (
          <p className="text-sm text-gray-400 italic">Not set</p>
        )}
      </div>
    </div>
  );
}
