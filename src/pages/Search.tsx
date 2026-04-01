import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { Search as SearchIcon, Filter, ChevronDown, Loader2, Star, X, LogIn, Eye, Briefcase, Bookmark, Bell, BellOff, Trash2, Zap, Map as MapIcon, List, Crown, FileText, Plus, MapPin as MapPinIcon } from 'lucide-react';
import { GoogleMap, MarkerF, useJsApiLoader } from '@react-google-maps/api';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { TradieWithDetails } from '../types/database';
import DashboardLayout from '../components/DashboardLayout';
import TradieCard from '../components/TradieCard';
import ChatDrawer from '../components/ChatDrawer';
import AvailabilityCalendar from '../components/AvailabilityCalendar';
import AddressAutocomplete from '../components/AddressAutocomplete';
import SEO from '../components/SEO';
import { recordProfileView, getDailyViewCount, hasEngagement, getRemainingViews, DAILY_VIEW_LIMIT_VALUE, redactName } from '../lib/contactGating';
import { useToast } from '../hooks/useToast';
import { saveSearch, getSavedSearches, deleteSavedSearch, toggleSearchAlerts, type SavedSearch, type SearchFilters } from '../lib/savedSearches';
import { TRADE_OPTIONS } from '../lib/tradeCategories';
import { calculateTradeScore, buildScoringFactors } from '../lib/searchRanking';

const tradeCategories = [{ value: '', label: 'All Trades' }, ...TRADE_OPTIONS];

const advancedCategories: Record<string, string[]> = {
  plumber: ['Blocked Drains', 'Gas Fitting', 'Hot Water Systems', 'Leak Detection & Repairs', 'Pipe Installation', 'Bathroom Plumbing', 'Kitchen Plumbing', 'Toilet Repairs', 'Tap Repairs', 'Burst Pipes', 'Sewer & Stormwater', 'Backflow Prevention', 'Water Filtration'],
  electrician: ['Wiring & Rewiring', 'Light Installation', 'Switchboard Upgrades', 'Power Points', 'Safety Inspections', 'Ceiling Fans', 'Smoke Alarms', 'RCD Installation', 'Data Cabling', 'EV Charger Installation', 'Emergency Repairs', 'Commercial Electrical', 'Industrial Electrical'],
  carpenter: ['Custom Furniture', 'Decking', 'Door Installation', 'Kitchen Cabinets', 'Timber Repairs', 'Shelving', 'Pergolas', 'Wardrobes', 'Stairs & Balustrades', 'Window Installation', 'Timber Framing', 'Renovation Carpentry', 'Shop Fitting'],
  builder: ['Extensions', 'Renovations', 'New Builds', 'Structural Work', 'Bathroom Remodeling', 'Granny Flats', 'Commercial Fitouts', 'Kitchen Renovations', 'Knockdown Rebuild', 'Project Management', 'Council Approvals', 'Heritage Restoration'],
  painter: ['Interior Painting', 'Exterior Painting', 'Spray Painting', 'Wallpaper Installation', 'Color Consulting', 'Deck Staining', 'Feature Walls', 'Roof Painting', 'Commercial Painting', 'Lead Paint Removal', 'Texture Coating', 'Epoxy Flooring'],
  landscaper: ['Garden Design', 'Lawn Care', 'Irrigation Systems', 'Paving', 'Tree Services', 'Retaining Walls', 'Outdoor Lighting', 'Turf Installation', 'Garden Maintenance', 'Hedge Trimming', 'Mulching', 'Stump Removal', 'Land Clearing'],
  handyman: ['General Repairs', 'Furniture Assembly', 'Picture Hanging', 'Minor Plumbing', 'Minor Electrical', 'Door Repairs', 'Lock Installation', 'Gutter Cleaning', 'Pressure Washing', 'Odd Jobs', 'Property Maintenance', 'Fence Repairs'],
  cleaner: ['End of Lease', 'Deep Cleaning', 'Regular Cleaning', 'Window Cleaning', 'Carpet Cleaning', 'Office Cleaning', 'Post-Construction', 'Spring Cleaning', 'Oven Cleaning', 'High Pressure Cleaning', 'Grout Cleaning', 'Upholstery Cleaning'],
  roofer: ['Roof Repairs', 'Roof Replacement', 'Tile Roofing', 'Metal Roofing', 'Colorbond Roofing', 'Gutters & Downpipes', 'Roof Restoration', 'Skylight Installation', 'Roof Ventilation', 'Leak Detection', 'Fascia & Soffit', 'Roof Cleaning'],
  tiler: ['Floor Tiling', 'Wall Tiling', 'Bathroom Tiling', 'Kitchen Splashbacks', 'Outdoor Tiling', 'Pool Tiling', 'Mosaic Tiling', 'Tile Repairs', 'Waterproofing', 'Underfloor Heating', 'Stone Installation', 'Tile Removal'],
  concreter: ['Driveways', 'Pathways', 'Concrete Slabs', 'Exposed Aggregate', 'Stamped Concrete', 'Polished Concrete', 'Concrete Resurfacing', 'Retaining Walls', 'Pool Surrounds', 'Commercial Concreting', 'Concrete Cutting', 'Concrete Repairs'],
  bricklayer: ['Brick Walls', 'Brick Fences', 'Retaining Walls', 'Brick Repairs', 'Letterboxes', 'BBQ Areas', 'Feature Walls', 'Brick Paving', 'Stone Masonry', 'Repointing', 'Chimney Repairs', 'Block Laying'],
  glazier: ['Window Replacement', 'Glass Repairs', 'Shower Screens', 'Mirrors', 'Splashbacks', 'Double Glazing', 'Security Glass', 'Balustrades', 'Shopfronts', 'Emergency Glass Repairs', 'Pet Doors', 'Glass Pool Fencing'],
  fencer: ['Colorbond Fencing', 'Timber Fencing', 'Pool Fencing', 'Glass Fencing', 'Security Fencing', 'Gates & Automation', 'Retaining Walls', 'Rural Fencing', 'Commercial Fencing', 'Fence Repairs', 'Picket Fencing', 'Slat Fencing'],
  plasterer: ['Gyprock Installation', 'Plastering Repairs', 'Cornice Installation', 'Ceiling Repairs', 'Wall Lining', 'Ornamental Plastering', 'Acoustic Panels', 'Fire-Rated Systems', 'Commercial Plastering', 'Bulkheads', 'Partition Walls'],
  renderer: ['Cement Rendering', 'Acrylic Rendering', 'Texture Coating', 'Bagging', 'Scratch Coat', 'Hebel Rendering', 'Polished Render', 'Heritage Restoration', 'Commercial Rendering', 'Waterproofing', 'Crack Repairs'],
  flooring: ['Timber Flooring', 'Laminate Flooring', 'Vinyl Flooring', 'Carpet Installation', 'Floor Sanding', 'Floor Polishing', 'Bamboo Flooring', 'Engineered Flooring', 'Cork Flooring', 'Epoxy Flooring', 'Commercial Flooring', 'Floor Repairs'],
  'cabinet-maker': ['Custom Kitchens', 'Bathroom Vanities', 'Built-in Wardrobes', 'Entertainment Units', 'Home Offices', 'Laundry Cabinets', 'Shop Fittings', 'Furniture Restoration', 'Custom Shelving', 'Wine Cellars', 'Garage Storage'],
  locksmith: ['Lock Installation', 'Lock Repairs', 'Key Cutting', 'Emergency Lockout', 'Safe Opening', 'Security Upgrades', 'Master Key Systems', 'Digital Locks', 'Car Locksmith', 'Commercial Locksmith', 'Access Control', 'CCTV'],
  'air-conditioning': ['Split System Installation', 'Ducted Air Con', 'Air Con Repairs', 'Air Con Servicing', 'Evaporative Cooling', 'Commercial HVAC', 'Refrigeration', 'Ventilation', 'Air Quality', 'Heat Pumps', 'Dehumidifiers'],
  solar: ['Solar Panel Installation', 'Battery Storage', 'Solar Repairs', 'Solar Maintenance', 'Grid Connection', 'Off-Grid Systems', 'Commercial Solar', 'Solar Hot Water', 'EV Charging', 'Solar Pool Heating', 'Energy Audits'],
  pool: ['Pool Construction', 'Pool Renovations', 'Pool Maintenance', 'Pool Cleaning', 'Pool Heating', 'Pool Fencing', 'Pool Equipment', 'Spa Installation', 'Pool Resurfacing', 'Leak Detection', 'Water Testing', 'Pool Covers'],
  'pest-control': ['General Pest Control', 'Termite Inspection', 'Termite Treatment', 'Rodent Control', 'Cockroach Control', 'Ant Control', 'Spider Control', 'Bee & Wasp Removal', 'Bird Control', 'Pre-Purchase Inspections', 'Commercial Pest Control'],
  demolition: ['House Demolition', 'Partial Demolition', 'Asbestos Removal', 'Site Clearing', 'Strip Outs', 'Commercial Demolition', 'Pool Demolition', 'Concrete Removal', 'Garage Demolition', 'Shed Removal'],
  excavation: ['Site Excavation', 'Pool Excavation', 'Trenching', 'Bobcat Hire', 'Excavator Hire', 'Land Clearing', 'Drainage', 'Retaining Walls', 'Driveway Excavation', 'Foundation Digging', 'Rock Breaking'],
  waterproofing: ['Bathroom Waterproofing', 'Balcony Waterproofing', 'Basement Waterproofing', 'Roof Waterproofing', 'Deck Waterproofing', 'Pool Waterproofing', 'Tanking', 'Membrane Systems', 'Crack Injection', 'Rising Damp'],
  'garage-doors': ['Roller Door Installation', 'Sectional Doors', 'Tilt Doors', 'Garage Door Repairs', 'Motor Installation', 'Remote Programming', 'Commercial Doors', 'Industrial Doors', 'Door Automation', 'Spring Replacement'],
  security: ['CCTV Installation', 'Alarm Systems', 'Intercom Systems', 'Access Control', 'Security Cameras', 'Video Doorbells', 'Sensor Lights', 'Safe Installation', 'Home Automation', 'Commercial Security', '24/7 Monitoring'],
  antenna: ['TV Antenna Installation', 'Antenna Repairs', 'Satellite Dish', 'TV Wall Mounting', 'Home Theatre Setup', 'Signal Boosters', 'Multi-Room Setup', 'Smart TV Setup', 'Streaming Setup', 'Commercial AV'],
  'appliance-repair': ['Washing Machine Repair', 'Dryer Repair', 'Dishwasher Repair', 'Fridge Repair', 'Oven Repair', 'Cooktop Repair', 'Microwave Repair', 'Rangehood Repair', 'Coffee Machine Repair', 'Commercial Appliances'],
  'curtains-blinds': ['Roller Blinds', 'Venetian Blinds', 'Vertical Blinds', 'Roman Blinds', 'Plantation Shutters', 'Curtains', 'Motorised Blinds', 'Awnings', 'Outdoor Blinds', 'Commercial Blinds', 'Blind Repairs'],
  'private-chef': ['Dinner Parties', 'Meal Prep', 'Special Occasions', 'Corporate Events', 'Cooking Classes', 'Diet-Specific Meals', 'In-Home Dining', 'Wedding Catering', 'Birthday Parties', 'Holiday Meals'],
  catering: ['Weddings', 'Corporate Events', 'Private Parties', 'BBQ Catering', 'Cocktail Events', 'Food Trucks', 'Buffet Service', 'Canapes', 'High Tea', 'Festival Catering', 'Office Catering'],
  scaffolding: ['Residential Scaffolding', 'Commercial Scaffolding', 'Industrial Scaffolding', 'Scaffold Hire', 'Mobile Scaffolds', 'Suspended Scaffolds', 'Scaffolding Inspections'],
  insulation: ['Ceiling Insulation', 'Wall Insulation', 'Floor Insulation', 'Roof Insulation', 'Acoustic Insulation', 'Spray Foam', 'Batts Installation', 'Underfloor Insulation', 'Commercial Insulation'],
};

interface TradieRatingInfo {
  averageRating: number;
  totalReviews: number;
}

interface TradieRatingMap {
  [tradieId: string]: number;
}

interface TradieRatingDetailMap {
  [tradieId: string]: TradieRatingInfo;
}

export default function Search() {
  const [searchParams] = useSearchParams();
  const [tradies, setTradies] = useState<TradieWithDetails[]>([]);
  const [filteredTradies, setFilteredTradies] = useState<TradieWithDetails[]>([]);
  const [savedTradieIds, setSavedTradieIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const rawTrade = searchParams.get('trade') || '';
  const normalizedTrade = rawTrade
    ? (TRADE_OPTIONS.find(t => {
        const raw = rawTrade.toLowerCase();
        const val = t.value.toLowerCase();
        const lbl = t.label.toLowerCase();
        // Exact match
        if (val === raw || lbl === raw) return true;
        // Contains match
        if (lbl.includes(raw) || raw.includes(lbl) || val.includes(raw) || raw.includes(val)) return true;
        // Stem match — strip common suffixes (ing, er, or, s) and compare roots
        const stem = (s: string) => s.replace(/(ing|er|or|ist|tion|s)$/i, '');
        if (stem(raw) === stem(val) || stem(raw) === stem(lbl)) return true;
        // Subcategory match
        if (t.subcategories?.some(s => s.toLowerCase() === raw || s.toLowerCase().includes(raw))) return true;
        return false;
      })?.value || rawTrade)
    : '';
  const [tradeFilter, setTradeFilter] = useState(normalizedTrade);
  const [postcodeFilter, setPostcodeFilter] = useState(searchParams.get('postcode') || '');
  const [postcodeQuery, setPostcodeQuery] = useState(searchParams.get('postcode') || '');
  const [chatTradie, setChatTradie] = useState<TradieWithDetails | null>(null);
  const [calendarTradie, setCalendarTradie] = useState<TradieWithDetails | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [ratingFilter, setRatingFilter] = useState(0);
  const [contractorTypeFilter, setContractorTypeFilter] = useState<string>('');
  const [emergencyFilter, setEmergencyFilter] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [, setLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [tradieRatings, setTradieRatings] = useState<TradieRatingMap>({});
  const [tradieRatingDetails, setTradieRatingDetails] = useState<TradieRatingDetailMap>({});
  const [jobCompletionCounts, setJobCompletionCounts] = useState<Record<string, number>>({});
  const [showViewLimitModal, setShowViewLimitModal] = useState(false);
  const [, setShowSubscriptionModal] = useState(false);
  const [dailyViewCount, setDailyViewCount] = useState(0);
  const [isEngaged, setIsEngaged] = useState(true);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [showSavedSearches, setShowSavedSearches] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);
  const { user, profile } = useAuth();
  const { toast, showToast } = useToast();
  const navigate = useNavigate();
  const isClient = profile?.role === 'client';
  const [quoteRequestTradie, setQuoteRequestTradie] = useState<TradieWithDetails | null>(null);
  const [clientPendingJobs, setClientPendingJobs] = useState<{ id: string; title: string; description: string; location_address: string }[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);

  const fetchSavedSearchesList = useCallback(async () => {
    if (!user) return;
    try {
      const searches = await getSavedSearches(user.id);
      setSavedSearches(searches);
    } catch {
      // silently fail
    }
  }, [user]);

  useEffect(() => {
    fetchTradies();
    fetchRatings();
    if (user) {
      fetchSavedTradies();
      checkViewLimits();
      fetchSavedSearchesList();
    }
  }, [tradeFilter, postcodeQuery, user]);

  const checkViewLimits = async () => {
    if (!user || !isClient) return;
    const [engaged, count] = await Promise.all([
      hasEngagement(user.id),
      getDailyViewCount(user.id),
    ]);
    setIsEngaged(engaged);
    setDailyViewCount(count);
  };

  useEffect(() => {
    applyFilters();
  }, [tradies, ratingFilter, contractorTypeFilter, searchQuery, tradieRatings, tradieRatingDetails, jobCompletionCounts, emergencyFilter]);

  const fetchRatings = async () => {
    const { data } = await supabase
      .from('tradie_ratings')
      .select('tradie_id, average_rating, total_reviews');

    if (data) {
      const map: TradieRatingMap = {};
      const detailMap: TradieRatingDetailMap = {};
      data.forEach((r: { tradie_id: string; average_rating: number; total_reviews: number }) => {
        map[r.tradie_id] = r.average_rating;
        detailMap[r.tradie_id] = {
          averageRating: r.average_rating,
          totalReviews: r.total_reviews,
        };
      });
      setTradieRatings(map);
      setTradieRatingDetails(detailMap);
    }
  };

  const TRADIES_PER_PAGE = 30;
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  const fetchTradies = async (reset = true) => {
    setLoading(true);
    const currentPage = reset ? 0 : page;

    const query = supabase
      .from('profiles')
      .select(`
        id, full_name, email, phone, address, postcode, avatar_url,
        is_premium, role, verified_trades, declared_trades,
        verification_status, call_out_fee, show_callout_fee, callout_fee_waived_on_proceed,
        is_emergency_available,
        tradie_details (*)
      `)
      .eq('role', 'tradie')
      .not('tradie_details', 'is', null)
      .order('is_premium', { ascending: false })
      .range(currentPage * TRADIES_PER_PAGE, (currentPage + 1) * TRADIES_PER_PAGE - 1);

    if (tradeFilter) {
      query.eq('tradie_details.trade_category', tradeFilter);
    }

    if (postcodeQuery.trim()) {
      query.ilike('postcode', `${postcodeQuery.trim()}%`);
    }

    const { data: profiles } = await query;

    if (profiles) {
      const now = new Date();
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const tradieIds = profiles.map((p: Record<string, unknown>) => p.id as string);

      // Fetch available slots this week
      const { data: allSlots } = await supabase
        .from('availability_slots')
        .select('tradie_id, start_time, end_time')
        .in('tradie_id', tradieIds)
        .eq('status', 'available')
        .gte('start_time', now.toISOString())
        .lte('start_time', weekFromNow.toISOString());

      // Check which tradies have ever set up any availability slots
      const { data: tradiesWithSlots } = await supabase
        .from('availability_slots')
        .select('tradie_id')
        .in('tradie_id', tradieIds)
        .limit(1000);

      // Fetch completed job counts for ranking
      const { data: completedJobs } = await supabase
        .from('jobs')
        .select('tradie_id')
        .in('tradie_id', tradieIds)
        .eq('status', 'completed');

      const completionCounts: Record<string, number> = {};
      if (completedJobs) {
        for (const j of completedJobs) {
          completionCounts[j.tradie_id] = (completionCounts[j.tradie_id] || 0) + 1;
        }
      }
      setJobCompletionCounts(prev => ({ ...prev, ...completionCounts }));

      const tradiesWithAnySlots = new Set(
        (tradiesWithSlots || []).map((s: { tradie_id: string }) => s.tradie_id)
      );

      const slotsByTradie: Record<string, number> = {};
      if (allSlots) {
        for (const slot of allSlots) {
          const hours = (new Date(slot.end_time).getTime() - new Date(slot.start_time).getTime()) / (1000 * 60 * 60);
          slotsByTradie[slot.tradie_id] = (slotsByTradie[slot.tradie_id] || 0) + hours;
        }
      }

      const tradiesResult = profiles.map((tradie: Record<string, unknown>) => {
        const id = tradie.id as string;
        const hasSlots = tradiesWithAnySlots.has(id);
        return {
          ...tradie,
          tradie_details: tradie.tradie_details,
          // undefined = never set up availability, 0 = has slots but none available this week
          availability_hours: hasSlots ? (slotsByTradie[id] || 0) : undefined,
        } as TradieWithDetails;
      });

      setHasMore(tradiesResult.length === TRADIES_PER_PAGE);

      if (reset) {
        setTradies(tradiesResult);
        setFilteredTradies(tradiesResult);
        setPage(1);
      } else {
        setTradies(prev => [...prev, ...tradiesResult]);
        setFilteredTradies(prev => [...prev, ...tradiesResult]);
        setPage(currentPage + 1);
      }
    }
    setLoading(false);
  };

  const loadMore = () => {
    if (!loading && hasMore) {
      fetchTradies(false);
    }
  };

  const applyFilters = () => {
    let result = [...tradies];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((t) => {
        const name = t.full_name?.toLowerCase() || '';
        const business = t.tradie_details?.business_name?.toLowerCase() || '';
        const trade = t.tradie_details?.trade_category?.toLowerCase() || '';
        const bio = t.tradie_details?.bio?.toLowerCase() || '';
        return name.includes(query) || business.includes(query) || trade.includes(query) || bio.includes(query);
      });
    }

    if (ratingFilter > 0) {
      result = result.filter((t) => {
        const rating = tradieRatings[t.id] || 0;
        return rating >= ratingFilter;
      });
    }

    if (contractorTypeFilter) {
      result = result.filter(
        (t) => t.tradie_details?.contractor_type === contractorTypeFilter
      );
    }

    if (emergencyFilter) {
      result = result.filter((t) => t.is_emergency_available);
    }

    // Rank results by weighted score (premium tradies still float to top)
    result.sort((a, b) => {
      // Premium tradies always rank first
      const aPremium = a.is_premium ? 1 : 0;
      const bPremium = b.is_premium ? 1 : 0;
      if (aPremium !== bPremium) return bPremium - aPremium;

      const aRating = tradieRatingDetails[a.id] || { averageRating: 0, totalReviews: 0 };
      const bRating = tradieRatingDetails[b.id] || { averageRating: 0, totalReviews: 0 };

      const aScore = calculateTradeScore(buildScoringFactors({
        abn_verified: a.abn_verified,
        license_verified: a.license_verified,
        verification_status: a.verification_status,
        bio: a.tradie_details?.bio,
        avatar_url: a.avatar_url,
        phone: a.phone,
        postcode: a.postcode,
        tradie_details: a.tradie_details,
        averageRating: aRating.averageRating,
        reviewCount: aRating.totalReviews,
        jobsCompleted: jobCompletionCounts[a.id] || 0,
      }));

      const bScore = calculateTradeScore(buildScoringFactors({
        abn_verified: b.abn_verified,
        license_verified: b.license_verified,
        verification_status: b.verification_status,
        bio: b.tradie_details?.bio,
        avatar_url: b.avatar_url,
        phone: b.phone,
        postcode: b.postcode,
        tradie_details: b.tradie_details,
        averageRating: bRating.averageRating,
        reviewCount: bRating.totalReviews,
        jobsCompleted: jobCompletionCounts[b.id] || 0,
      }));

      return bScore - aScore;
    });

    setFilteredTradies(result);
  };

  const clearFilters = () => {
    setRatingFilter(0);
    setTradeFilter('');
    setPostcodeFilter('');
    setPostcodeQuery('');
    setLocationCoords(null);
    setContractorTypeFilter('');
    setEmergencyFilter(false);
    setSearchQuery('');
  };

  const fetchSavedTradies = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('my_trades')
      .select('tradie_id')
      .eq('client_id', user.id);

    setSavedTradieIds(data?.map((t) => t.tradie_id) || []);
  };

  const handleSaveTradie = async (tradie: TradieWithDetails) => {
    if (!user) {
      setShowAuthPrompt(true);
      return;
    }

    const isSaved = savedTradieIds.includes(tradie.id);
    const isPro = tradie.tradie_details?.subscription_tier === 'pro' || tradie.tradie_details?.subscription_tier === 'business';
    const displayName = isPro ? (tradie.tradie_details?.business_name || tradie.full_name) : redactName(tradie.full_name);

    if (isSaved) {
      await supabase
        .from('my_trades')
        .delete()
        .eq('client_id', user.id)
        .eq('tradie_id', tradie.id);

      setSavedTradieIds(savedTradieIds.filter((id) => id !== tradie.id));
      showToast(`${displayName} removed from saved`);
    } else {
      await supabase
        .from('my_trades')
        .insert({ client_id: user.id, tradie_id: tradie.id });

      setSavedTradieIds([...savedTradieIds, tradie.id]);
      showToast(`${displayName} saved!`);
    }
  };

  const checkAndRecordView = async (tradieId: string): Promise<boolean> => {
    if (!user || !isClient || isEngaged) return true;
    if (dailyViewCount >= DAILY_VIEW_LIMIT_VALUE) {
      setShowViewLimitModal(true);
      return false;
    }
    await recordProfileView(user.id, tradieId);
    setDailyViewCount(prev => prev + 1);
    return true;
  };

  const handleChatTradie = async (tradie: TradieWithDetails) => {
    if (!user) {
      setShowAuthPrompt(true);
      return;
    }
    const allowed = await checkAndRecordView(tradie.id);
    if (!allowed) return;
    setChatTradie(tradie);
  };

  const handleViewCalendar = async (tradie: TradieWithDetails) => {
    if (!user) {
      setShowAuthPrompt(true);
      return;
    }
    const allowed = await checkAndRecordView(tradie.id);
    if (!allowed) return;
    setCalendarTradie(tradie);
  };

  const handleRequestQuote = async (tradie: TradieWithDetails) => {
    if (!user) {
      setShowAuthPrompt(true);
      return;
    }
    const allowed = await checkAndRecordView(tradie.id);
    if (!allowed) return;
    setQuoteRequestTradie(tradie);
    setLoadingJobs(true);
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, title, description, location_address')
        .eq('client_id', user.id)
        .in('status', ['pending', 'accepted'])
        .is('archived_at', null)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) {
        console.error('Failed to fetch jobs for quote request:', error);
        setClientPendingJobs([]);
      } else {
        setClientPendingJobs(data || []);
      }
    } catch (err) {
      console.error('Quote request job fetch error:', err);
      setClientPendingJobs([]);
    } finally {
      setLoadingJobs(false);
    }
  };

  const sendQuoteInvitation = async (jobId: string) => {
    if (!user || !quoteRequestTradie) return;
    setSendingInvite(true);
    try {
      // Send notification to tradie — don't assign tradie_id so the job stays in Leads
      const clientName = profile?.full_name || 'A client';
      await supabase.from('notifications').insert({
        user_id: quoteRequestTradie.id,
        type: 'new_job',
        title: 'Quote invitation',
        message: `${clientName} has invited you to quote on a job`,
        job_id: jobId,
        metadata: { invited: true, invited_by: user.id },
      });

      showToast('Quote request sent! The tradie will be notified.');
      setQuoteRequestTradie(null);
    } catch {
      showToast('Failed to send quote request. Please try again.', true);
    } finally {
      setSendingInvite(false);
    }
  };

  const tradeLabel = tradeCategories.find(c => c.value === tradeFilter)?.label;
  const seoTitle = tradeLabel && tradeLabel !== 'All Trades'
    ? `Find a ${tradeLabel} Near You`
    : 'Find a Tradie Near You';
  const seoDescription = tradeLabel && tradeLabel !== 'All Trades'
    ? `Browse verified ${tradeLabel.toLowerCase()}s in ${postcodeFilter || 'Australia'}. Compare ratings, view availability and request quotes on ConnecTradie.`
    : 'Search verified trade professionals across Australia. Compare ratings, check real-time availability and request quotes instantly.';

  const activeFilterCount = [ratingFilter > 0, contractorTypeFilter, postcodeFilter.trim(), emergencyFilter].filter(Boolean).length;

  const searchContent = (
    <div className="max-w-[1600px] mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Find a Tradie</h1>
          <p className="text-sm text-gray-500 mt-1">Licensed professionals in your area, ready to quote</p>
        </div>

        {/* Search & Filters Card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm shadow-gray-200/60 p-5 sm:p-6 mb-6">
          {/* Main search input */}
          <div className="relative">
            <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="What do you need done? (e.g., fix a leaking tap, install lights)"
              className="w-full pl-11 pr-4 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all bg-white placeholder:text-gray-400"
            />
          </div>

          {/* Advanced Search toggle */}
          <button
            onClick={() => setShowAdvancedSearch(!showAdvancedSearch)}
            className="mt-3 text-primary-600 hover:text-primary-700 font-medium text-xs transition-colors flex items-center gap-1.5"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvancedSearch ? 'rotate-180' : ''}`} />
            Browse by trade
          </button>

          {showAdvancedSearch && (
            <div className="mt-3 rounded-xl border border-gray-100 overflow-hidden">
              {/* Trade category grid */}
              <div className="p-3 bg-gray-50/80 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {Object.keys(advancedCategories).map((category) => (
                  <button
                    key={category}
                    onClick={() => setExpandedCategory(expandedCategory === category ? null : category)}
                    className={`text-sm px-3 py-2.5 rounded-lg font-medium text-center transition-all ${
                      expandedCategory === category
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'bg-white border border-gray-200 text-gray-700 hover:border-primary-300 hover:text-primary-600'
                    }`}
                  >
                    {tradeCategories.find((c) => c.value === category)?.label || category}
                  </button>
                ))}
              </div>

              {/* Selected category services */}
              {expandedCategory && advancedCategories[expandedCategory] && (
                <div className="px-4 py-3 border-t border-gray-100 bg-white">
                  <div className="flex flex-wrap gap-1.5">
                    {advancedCategories[expandedCategory].map((service) => (
                      <button
                        key={service}
                        onClick={() => {
                          setTradeFilter(expandedCategory);
                          setSearchQuery(service);
                          setShowAdvancedSearch(false);
                          setExpandedCategory(null);
                        }}
                        className="text-sm px-3 py-1.5 bg-gray-50 border border-gray-200 text-gray-600 rounded-lg hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                      >
                        {service}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Location + Filters row */}
          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            <div className="flex-1">
              <AddressAutocomplete
                value={postcodeFilter}
                onChange={(value, coordinates, details) => {
                  setPostcodeFilter(value);
                  setPostcodeQuery(details?.postcode || value.replace(/\D/g, '').slice(0, 4) || value);
                  if (coordinates) {
                    setLocationCoords(coordinates);
                  }
                }}
                placeholder="Enter your address or postcode (e.g., 2000, Sydney)"
                searchTypes={['geocode']}
              />
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-5 py-2.5 text-sm font-medium rounded-xl transition-all flex items-center justify-center gap-2 min-h-[44px] ${
                showFilters
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100'
              }`}
            >
              <Filter className="w-4 h-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-warm-500 text-white text-xs flex items-center justify-center font-semibold">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Expanded filter panel */}
          {showFilters && (
            <div className="mt-5 pt-5 border-t border-gray-100 space-y-5">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2.5">Minimum Rating</label>
                <div className="flex gap-2">
                  {[0, 3, 4, 5].map((rating) => (
                    <button
                      key={rating}
                      onClick={() => setRatingFilter(rating)}
                      className={`flex-1 px-3 py-2 rounded-lg border text-sm transition-all min-h-[40px] ${
                        ratingFilter === rating
                          ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium shadow-sm'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {rating === 0 ? (
                        'All'
                      ) : (
                        <div className="flex items-center justify-center gap-1">
                          <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                          <span>{rating}+</span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2.5">Contractor Type</label>
                <div className="flex gap-2">
                  {['', 'Solo', 'Company', 'Labour Hire'].map((type) => (
                    <button
                      key={type || 'all'}
                      onClick={() => setContractorTypeFilter(type)}
                      className={`flex-1 px-3 py-2 rounded-lg border text-sm transition-all min-h-[40px] ${
                        contractorTypeFilter === type
                          ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium shadow-sm'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {type || 'All'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2.5">Other</label>
                <button
                  onClick={() => setEmergencyFilter(!emergencyFilter)}
                  className={`px-4 py-2 rounded-lg border text-sm transition-all min-h-[40px] flex items-center gap-2 ${
                    emergencyFilter
                      ? 'border-red-500 bg-red-50 text-red-700 font-medium shadow-sm'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  Emergency Available
                </button>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={clearFilters}
                  className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 min-h-[40px]"
                >
                  <X className="w-3.5 h-3.5" />
                  Clear All
                </button>
                <button
                  onClick={() => { setShowFilters(false); showToast('Filters applied'); }}
                  className="flex-1 px-4 py-2.5 bg-warm-500 text-white text-sm font-medium rounded-xl hover:bg-warm-600 transition-colors min-h-[40px] shadow-sm shadow-warm-500/20"
                >
                  Apply Filters
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Saved Searches */}
        {user && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setShowSavedSearches(!showSavedSearches)}
                className="text-sm font-medium text-gray-600 hover:text-gray-900 flex items-center gap-2 transition-colors"
              >
                <Bookmark className="w-4 h-4" />
                Saved Searches ({savedSearches.length})
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showSavedSearches ? 'rotate-180' : ''}`} />
              </button>
              {(tradeFilter || postcodeFilter || ratingFilter > 0 || contractorTypeFilter) && (
                <button
                  onClick={() => setShowSaveForm(true)}
                  className="text-sm font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1.5 transition-colors"
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  Save Current Search
                </button>
              )}
            </div>

            {showSaveForm && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3 flex gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Search Name</label>
                  <input
                    type="text"
                    value={saveSearchName}
                    onChange={(e) => setSaveSearchName(e.target.value)}
                    placeholder="e.g., Plumber in Sydney"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <button
                  onClick={async () => {
                    if (!saveSearchName.trim()) return;
                    const filters: SearchFilters = {};
                    if (tradeFilter) filters.trade_category = tradeFilter;
                    if (postcodeFilter) filters.postcode = postcodeFilter;
                    if (ratingFilter > 0) filters.min_rating = ratingFilter;
                    try {
                      await saveSearch(saveSearchName.trim(), filters);
                      showToast('Search saved!');
                      setSaveSearchName('');
                      setShowSaveForm(false);
                      fetchSavedSearchesList();
                    } catch {
                      showToast('Failed to save search');
                    }
                  }}
                  disabled={!saveSearchName.trim()}
                  className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => { setShowSaveForm(false); setSaveSearchName(''); }}
                  className="px-3 py-2 text-gray-500 hover:text-gray-700 text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}

            {showSavedSearches && savedSearches.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                {savedSearches.map((s) => (
                  <div key={s.id} className="flex items-center justify-between px-4 py-3">
                    <button
                      onClick={() => {
                        const f = s.filters;
                        if (f.trade_category) setTradeFilter(f.trade_category);
                        if (f.postcode) {
                          setPostcodeFilter(f.postcode);
                          setPostcodeQuery(f.postcode);
                        }
                        if (f.min_rating) setRatingFilter(f.min_rating);
                        setShowSavedSearches(false);
                        showToast(`Loaded: ${s.name}`);
                      }}
                      className="text-left flex-1 min-w-0"
                    >
                      <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {[
                          s.filters.trade_category && tradeCategories.find(c => c.value === s.filters.trade_category)?.label,
                          s.filters.postcode,
                          s.filters.min_rating && `${s.filters.min_rating}+ stars`,
                        ].filter(Boolean).join(' · ') || 'All tradies'}
                      </p>
                    </button>
                    <div className="flex items-center gap-1 ml-3">
                      <button
                        onClick={async () => {
                          try {
                            await toggleSearchAlerts(s.id, !s.alert_enabled);
                            showToast(s.alert_enabled ? 'Alerts disabled' : 'Alerts enabled');
                            fetchSavedSearchesList();
                          } catch {
                            showToast('Failed to update alerts');
                          }
                        }}
                        className={`p-2 rounded-lg transition-colors ${s.alert_enabled ? 'text-primary-600 bg-primary-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
                        title={s.alert_enabled ? 'Disable alerts' : 'Enable alerts'}
                      >
                        {s.alert_enabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            await deleteSavedSearch(s.id);
                            showToast('Search deleted');
                            fetchSavedSearchesList();
                          } catch {
                            showToast('Failed to delete');
                          }
                        }}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete saved search"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {showSavedSearches && savedSearches.length === 0 && (
              <div className="bg-gray-50 rounded-xl border border-gray-100 p-6 text-center">
                <Bookmark className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No saved searches yet. Apply filters and save your search to quickly access it later.</p>
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-7 h-7 text-primary-600 animate-spin" />
            <p className="text-sm text-gray-400">Searching tradies...</p>
          </div>
        ) : filteredTradies.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <SearchIcon className="w-6 h-6 text-gray-400" />
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">No tradies found</h3>
            <p className="text-sm text-gray-500 mb-6">Try adjusting your search or filters</p>
            <Link
              to="/post-lead"
              className="inline-flex items-center gap-2 px-6 py-3 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 transition-colors shadow-sm shadow-warm-500/20"
            >
              <Briefcase className="w-5 h-5" />
              Post a Job Instead
            </Link>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500 font-medium">{filteredTradies.length} {filteredTradies.length === 1 ? 'tradie' : 'tradies'} found</p>
              <div className="flex bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${viewMode === 'grid' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <List className="w-3.5 h-3.5" />
                  List
                </button>
                <button
                  onClick={() => setViewMode('map')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${viewMode === 'map' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <MapIcon className="w-3.5 h-3.5" />
                  Map
                </button>
              </div>
            </div>

            {viewMode === 'grid' ? (
              <>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {filteredTradies.map((tradie) => (
                    <TradieCard
                      key={tradie.id}
                      tradie={tradie}
                      onChat={handleChatTradie}
                      onViewCalendar={handleViewCalendar}
                      onSave={handleSaveTradie}
                      isSaved={savedTradieIds.includes(tradie.id)}
                      onRequestQuote={isClient ? handleRequestQuote : undefined}
                    />
                  ))}
                </div>
                {hasMore && (
                  <div className="flex justify-center mt-8">
                    <button
                      onClick={loadMore}
                      disabled={loading}
                      className="px-8 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50 min-h-[44px] shadow-sm"
                    >
                      {loading ? 'Loading...' : 'Load More'}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <MapView
                tradies={filteredTradies}
                tradieRatings={tradieRatings}
                onChat={handleChatTradie}
                onViewCalendar={handleViewCalendar}
              />
            )}
          </>
        )}
    </div>
  );

  const remainingViews = getRemainingViews(dailyViewCount);

  const viewLimitModal = showViewLimitModal && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => setShowViewLimitModal(false)}
      />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
        <div className="w-16 h-16 bg-warm-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Eye className="w-8 h-8 text-warm-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-3">Want Unlimited Access?</h2>
        <p className="text-gray-600 mb-6">
          You've viewed {DAILY_VIEW_LIMIT_VALUE} profiles today. Post what you need and let verified tradies come to you — it's free.
        </p>
        <div className="flex flex-col gap-3">
          <Link
            to="/post-lead"
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 transition-colors"
          >
            <Briefcase className="w-5 h-5" />
            Post What You Need
          </Link>
          <button
            onClick={() => setShowViewLimitModal(false)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Continue browsing
          </button>
        </div>
      </div>
    </div>
  );

  const authPromptModal = showAuthPrompt && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => setShowAuthPrompt(false)}
      />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
        <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <LogIn className="w-8 h-8 text-primary-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-3">One Step Away</h2>
        <p className="text-gray-600 mb-8">
          Create a free account to message tradies, check their availability, and get quotes — takes 30 seconds.
        </p>
        <div className="flex flex-col gap-3">
          <Link
            to="/register"
            className="w-full px-6 py-3 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 transition-colors"
          >
            Create Free Account
          </Link>
          <Link
            to="/login"
            className="w-full px-6 py-3 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
          >
            Sign In
          </Link>
        </div>
        <button
          onClick={() => setShowAuthPrompt(false)}
          className="mt-6 text-sm text-gray-500 hover:text-gray-700"
        >
          Continue browsing
        </button>
      </div>
    </div>
  );

  const quoteRequestModal = quoteRequestTradie && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => setQuoteRequestTradie(null)}
      />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <button
          onClick={() => setQuoteRequestTradie(null)}
          className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
            <FileText className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Request Quote</h2>
            <p className="text-sm text-gray-500">
              from {quoteRequestTradie.tradie_details?.business_name || quoteRequestTradie.full_name}
            </p>
          </div>
        </div>

        {loadingJobs ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
          </div>
        ) : clientPendingJobs.length > 0 ? (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Select a job to invite them to quote on:</p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {clientPendingJobs.map(job => {
                const categoryMatch = job.description?.match(/^\[([^\]]+)\]/);
                const category = categoryMatch ? categoryMatch[1].replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : null;
                const desc = job.description?.replace(/^\[[^\]]+\]\s*/, '') || '';
                return (
                  <button
                    key={job.id}
                    onClick={() => sendQuoteInvitation(job.id)}
                    disabled={sendingInvite}
                    className="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/50 transition-colors disabled:opacity-50"
                  >
                    <p className="text-sm font-semibold text-gray-900 capitalize truncate">
                      {(job.title || category || 'Untitled Job').replace(/_/g, ' ')}
                    </p>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{desc}</p>
                    {job.location_address && (
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                        <MapPinIcon className="w-3 h-3" />
                        {job.location_address.split(',')[0]}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100">
              <button
                onClick={() => { setQuoteRequestTradie(null); navigate(`/post-lead?trade=${quoteRequestTradie.tradie_details?.trade_type || ''}&tradie=${quoteRequestTradie.id}`); }}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Post a New Job Instead
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-gray-600 mb-4">You don't have any open jobs yet. Post one and this tradie will be invited to quote.</p>
            <button
              onClick={() => { setQuoteRequestTradie(null); navigate(`/post-lead?trade=${quoteRequestTradie.tradie_details?.trade_type || ''}&tradie=${quoteRequestTradie.id}`); }}
              className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 bg-emerald-500 text-white text-sm font-medium rounded-xl hover:bg-emerald-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Post a Job
            </button>
          </div>
        )}
      </div>
    </div>
  );

  if (user) {
    return (
      <DashboardLayout>
        <SEO title={seoTitle} description={seoDescription} canonical="/search" />
        {isClient && !isEngaged && (
          <div className="max-w-[1600px] mx-auto mb-4">
            {remainingViews === DAILY_VIEW_LIMIT_VALUE ? (
              <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
                <Eye className="w-5 h-5 text-blue-600 flex-shrink-0" />
                <p className="text-sm text-blue-800">
                  Free accounts can view <span className="font-semibold">{DAILY_VIEW_LIMIT_VALUE}</span> tradie profiles per day.{' '}
                  <Link to="/post-lead" className="font-semibold underline hover:text-blue-900">Post a job</Link> to unlock unlimited access.
                </p>
              </div>
            ) : remainingViews > 0 && remainingViews <= 3 ? (
              <div className="flex items-center gap-3 px-4 py-3 bg-warm-50 border border-warm-200 rounded-xl">
                <Eye className="w-5 h-5 text-warm-600 flex-shrink-0" />
                <p className="text-sm text-warm-800">
                  <span className="font-semibold">{remainingViews}</span> free profile view{remainingViews !== 1 ? 's' : ''} left today.{' '}
                  <Link to="/post-lead" className="font-semibold underline hover:text-warm-900">Post your job</Link> and let tradies come to you — free and unlimited.
                </p>
              </div>
            ) : remainingViews <= 0 ? (
              <div className="bg-gradient-to-r from-warm-50 to-primary-50 border border-warm-200 rounded-2xl p-6 text-center">
                <Crown className="w-10 h-10 text-warm-500 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-gray-900 mb-2">You've reached your daily view limit</h3>
                <p className="text-gray-600 mb-4 max-w-md mx-auto">
                  Free accounts can view {DAILY_VIEW_LIMIT_VALUE} tradie profiles per day. Upgrade to Pro for unlimited views, verified badge, and priority search.
                </p>
                <div className="flex items-center justify-center gap-4">
                  <span className="text-2xl font-bold text-warm-600">$45/mo</span>
                  <button onClick={() => setShowSubscriptionModal(true)} className="px-6 py-3 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 transition-colors shadow-lg shadow-warm-200">
                    Upgrade to Pro
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
        {searchContent}

        <ChatDrawer
          isOpen={!!chatTradie}
          onClose={() => setChatTradie(null)}
          tradie={chatTradie}
        />

        <AvailabilityCalendar
          isOpen={!!calendarTradie}
          onClose={() => setCalendarTradie(null)}
          tradie={calendarTradie}
        />

        {viewLimitModal}
        {quoteRequestModal}
        {toast.show && (
          <div className={`fixed bottom-4 right-4 ${toast.isError ? 'bg-red-600' : 'bg-green-600'} text-white px-6 py-3 rounded-xl shadow-lg z-50 animate-slide-up`}>
            {toast.message}
          </div>
        )}
      </DashboardLayout>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <SEO
        title={seoTitle}
        description={seoDescription}
        canonical="/search"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          "name": seoTitle,
          "description": seoDescription,
          "url": "https://connectradie.com.au/search",
          "numberOfItems": filteredTradies.length,
          "itemListElement": filteredTradies.slice(0, 10).map((tradie, index) => ({
            "@type": "ListItem",
            "position": index + 1,
            "url": `https://connectradie.com.au/tradie/${tradie.id}`
          }))
        }}
      />
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center">
              <span className="text-2xl font-extrabold tracking-tight text-black">
                Connec<span className="text-warm-500">Tradie</span>
              </span>
            </Link>

            <div className="flex items-center gap-3">
              <Link
                to="/login"
                className="px-4 py-2 text-gray-700 font-medium hover:text-gray-900 transition-colors"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                className="px-4 py-2 bg-warm-500 text-white font-medium rounded-lg hover:bg-warm-600 transition-colors"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main id="main-content" className="p-4 sm:p-6 lg:p-8">
        {searchContent}
      </main>

      {authPromptModal}
    </div>
  );
}

function MapView({
  tradies,
}: {
  tradies: TradieWithDetails[];
  tradieRatings: TradieRatingMap;
  onChat: (t: TradieWithDetails) => void;
  onViewCalendar: (t: TradieWithDetails) => void;
}) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
  });

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-gray-50" style={{ height: 500 }}>
        <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden border border-gray-200" style={{ height: 500 }}>
      <GoogleMap
        center={{ lat: -33.8688, lng: 151.2093 }}
        zoom={10}
        mapContainerStyle={{ width: '100%', height: '100%' }}
      >
        {tradies.map(tradie => {
          const lat = (tradie as Record<string, unknown>).latitude as number | undefined;
          const lng = (tradie as Record<string, unknown>).longitude as number | undefined;
          return lat && lng ? (
            <MarkerF
              key={tradie.id}
              position={{ lat, lng }}
              title={(tradie.tradie_details?.subscription_tier === 'pro' || tradie.tradie_details?.subscription_tier === 'business')
                ? (tradie.tradie_details?.business_name || tradie.full_name || '')
                : (redactName(tradie.full_name) || '')}
            />
          ) : null;
        })}
      </GoogleMap>
    </div>
  );
}
