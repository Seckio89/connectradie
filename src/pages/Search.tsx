import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Search as SearchIcon, Filter, ChevronDown, Loader2, Star, X, Wrench, LogIn, Eye, Briefcase } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { TradieWithDetails, AvailabilitySlot } from '../types/database';
import DashboardLayout from '../components/DashboardLayout';
import TradieCard from '../components/TradieCard';
import ChatDrawer from '../components/ChatDrawer';
import AvailabilityCalendar from '../components/AvailabilityCalendar';
import AddressAutocomplete from '../components/AddressAutocomplete';
import SEO from '../components/SEO';
import { recordProfileView, getDailyViewCount, hasEngagement, getRemainingViews, DAILY_VIEW_LIMIT_VALUE } from '../lib/contactGating';

const tradeCategories = [
  { value: '', label: 'All Trades' },
  { value: 'plumber', label: 'Plumber' },
  { value: 'electrician', label: 'Electrician' },
  { value: 'carpenter', label: 'Carpenter' },
  { value: 'builder', label: 'Builder' },
  { value: 'painter', label: 'Painter' },
  { value: 'landscaper', label: 'Landscaper' },
  { value: 'handyman', label: 'Handyman' },
  { value: 'cleaner', label: 'Cleaner' },
  { value: 'roofer', label: 'Roofer' },
  { value: 'tiler', label: 'Tiler' },
  { value: 'concreter', label: 'Concreter' },
  { value: 'bricklayer', label: 'Bricklayer' },
  { value: 'glazier', label: 'Glazier' },
  { value: 'fencer', label: 'Fencer' },
  { value: 'plasterer', label: 'Plasterer' },
  { value: 'renderer', label: 'Renderer' },
  { value: 'flooring', label: 'Flooring Specialist' },
  { value: 'cabinet-maker', label: 'Cabinet Maker' },
  { value: 'locksmith', label: 'Locksmith' },
  { value: 'air-conditioning', label: 'Air Conditioning' },
  { value: 'solar', label: 'Solar Installer' },
  { value: 'pool', label: 'Pool Builder/Technician' },
  { value: 'pest-control', label: 'Pest Control' },
  { value: 'demolition', label: 'Demolition' },
  { value: 'excavation', label: 'Excavation' },
  { value: 'scaffolding', label: 'Scaffolding' },
  { value: 'waterproofing', label: 'Waterproofing' },
  { value: 'insulation', label: 'Insulation' },
  { value: 'garage-doors', label: 'Garage Doors' },
  { value: 'security', label: 'Security Systems' },
  { value: 'antenna', label: 'Antenna & TV' },
  { value: 'appliance-repair', label: 'Appliance Repair' },
  { value: 'curtains-blinds', label: 'Curtains & Blinds' },
  { value: 'private-chef', label: 'Private Chef' },
  { value: 'catering', label: 'Event Catering' },
];

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

interface TradieRatingMap {
  [tradieId: string]: number;
}

export default function Search() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [tradies, setTradies] = useState<TradieWithDetails[]>([]);
  const [filteredTradies, setFilteredTradies] = useState<TradieWithDetails[]>([]);
  const [savedTradieIds, setSavedTradieIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [tradeFilter, setTradeFilter] = useState(searchParams.get('trade') || '');
  const [postcodeFilter, setPostcodeFilter] = useState(searchParams.get('postcode') || '');
  const [chatTradie, setChatTradie] = useState<TradieWithDetails | null>(null);
  const [calendarTradie, setCalendarTradie] = useState<TradieWithDetails | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [ratingFilter, setRatingFilter] = useState(0);
  const [contractorTypeFilter, setContractorTypeFilter] = useState<string>('');
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [tradieRatings, setTradieRatings] = useState<TradieRatingMap>({});
  const [showViewLimitModal, setShowViewLimitModal] = useState(false);
  const [dailyViewCount, setDailyViewCount] = useState(0);
  const [isEngaged, setIsEngaged] = useState(true);
  const { user, profile } = useAuth();
  const isClient = profile?.role === 'client';

  useEffect(() => {
    fetchTradies();
    fetchRatings();
    if (user) {
      fetchSavedTradies();
      checkViewLimits();
    }
  }, [tradeFilter, user]);

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
  }, [tradies, ratingFilter, contractorTypeFilter, searchQuery, tradieRatings, postcodeFilter]);

  const fetchRatings = async () => {
    const { data } = await supabase
      .from('tradie_ratings')
      .select('tradie_id, average_rating');

    if (data) {
      const map: TradieRatingMap = {};
      data.forEach((r: { tradie_id: string; average_rating: number }) => {
        map[r.tradie_id] = r.average_rating;
      });
      setTradieRatings(map);
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
        tradie_details (*)
      `)
      .eq('role', 'tradie')
      .not('tradie_details', 'is', null)
      .order('is_premium', { ascending: false })
      .range(currentPage * TRADIES_PER_PAGE, (currentPage + 1) * TRADIES_PER_PAGE - 1);

    if (tradeFilter) {
      query.eq('tradie_details.trade_category', tradeFilter);
    }

    const { data: profiles } = await query;

    if (profiles) {
      const tradiesResult = profiles.map((tradie: Record<string, unknown>) => ({
        ...tradie,
        tradie_details: tradie.tradie_details,
      } as TradieWithDetails));

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

    if (postcodeFilter.trim()) {
      const pc = postcodeFilter.toLowerCase();
      result = result.filter((t) => {
        const postcode = t.postcode?.toLowerCase() || '';
        const address = t.address?.toLowerCase() || '';
        return postcode.includes(pc) || address.includes(pc);
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

    setFilteredTradies(result);
  };

  const clearFilters = () => {
    setRatingFilter(0);
    setTradeFilter('');
    setPostcodeFilter('');
    setLocationCoords(null);
    setContractorTypeFilter('');
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

    if (isSaved) {
      await supabase
        .from('my_trades')
        .delete()
        .eq('client_id', user.id)
        .eq('tradie_id', tradie.id);

      setSavedTradieIds(savedTradieIds.filter((id) => id !== tradie.id));
    } else {
      await supabase
        .from('my_trades')
        .insert({ client_id: user.id, tradie_id: tradie.id });

      setSavedTradieIds([...savedTradieIds, tradie.id]);
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

  const tradeLabel = tradeCategories.find(c => c.value === tradeFilter)?.label;
  const seoTitle = tradeLabel && tradeLabel !== 'All Trades'
    ? `Find a ${tradeLabel} Near You`
    : 'Find a Tradie Near You';
  const seoDescription = tradeLabel && tradeLabel !== 'All Trades'
    ? `Browse verified ${tradeLabel.toLowerCase()}s in ${postcodeFilter || 'Australia'}. Compare ratings, view availability and request quotes on ConnecTradie.`
    : 'Search verified trade professionals across Australia. Compare ratings, check real-time availability and request quotes instantly.';

  const searchContent = (
    <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Find a Tradie</h1>
          <p className="text-gray-700 mt-1">Browse verified trade professionals near you</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
          <div className="relative mb-6">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="What do you need done? (e.g., fix a leaking tap, install lights)"
              className="w-full pl-14 pr-4 py-4 text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
            />
          </div>

          <button
            onClick={() => setShowAdvancedSearch(!showAdvancedSearch)}
            className="text-primary-600 hover:text-primary-700 font-medium text-sm transition-colors flex items-center gap-2 mb-4"
          >
            {showAdvancedSearch ? '▼' : '▶'} Advanced Search
          </button>

          {showAdvancedSearch && (
            <div className="space-y-6 p-4 bg-gray-50 rounded-xl">
              <div className="grid md:grid-cols-2 gap-4">
                {Object.entries(advancedCategories).map(([category, services]) => (
                  <div key={category} className="space-y-2">
                    <h3 className="font-semibold text-gray-900 capitalize flex items-center gap-2">
                      <ChevronDown className="w-4 h-4 text-primary-600" />
                      {tradeCategories.find((c) => c.value === category)?.label || category}
                    </h3>
                    <div className="pl-6 space-y-1.5">
                      {services.map((service) => (
                        <button
                          key={service}
                          onClick={() => {
                            setTradeFilter(category);
                            setSearchQuery(service);
                            setShowAdvancedSearch(false);
                          }}
                          className="block text-sm text-gray-600 hover:text-primary-600 hover:underline transition-colors text-left"
                        >
                          {service}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-4 mt-6">
            <div className="flex-1">
              <AddressAutocomplete
                value={postcodeFilter}
                onChange={(value, coordinates) => {
                  setPostcodeFilter(value);
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
              className={`px-6 py-3 font-medium rounded-xl transition-colors flex items-center gap-2 min-h-[44px] ${
                showFilters
                  ? 'bg-primary-600 text-white hover:bg-primary-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Filter className="w-5 h-5" />
              Filters
            </button>
          </div>

          {showFilters && (
            <div className="mt-6 pt-6 border-t border-gray-200 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Minimum Rating</label>
                <div className="flex gap-2">
                  {[0, 3, 4, 5].map((rating) => (
                    <button
                      key={rating}
                      onClick={() => setRatingFilter(rating)}
                      className={`flex-1 px-4 py-2.5 rounded-lg border-2 transition-all min-h-[44px] ${
                        ratingFilter === rating
                          ? 'border-primary-600 bg-primary-50 text-primary-700'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {rating === 0 ? (
                        'All'
                      ) : (
                        <div className="flex items-center justify-center gap-1">
                          <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                          <span className="font-medium">{rating}+</span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Contractor Type</label>
                <div className="flex gap-2">
                  {['', 'Solo', 'Company', 'Labour Hire'].map((type) => (
                    <button
                      key={type || 'all'}
                      onClick={() => setContractorTypeFilter(type)}
                      className={`flex-1 px-4 py-2.5 rounded-lg border-2 transition-all text-sm min-h-[44px] ${
                        contractorTypeFilter === type
                          ? 'border-primary-600 bg-primary-50 text-primary-700 font-medium'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {type || 'All'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={clearFilters}
                  className="flex-1 px-4 py-2.5 border-2 border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 min-h-[44px]"
                >
                  <X className="w-4 h-4" />
                  Clear Filters
                </button>
                <button
                  onClick={() => setShowFilters(false)}
                  className="flex-1 px-4 py-2.5 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 transition-colors min-h-[44px]"
                >
                  Apply Filters
                </button>
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
          </div>
        ) : filteredTradies.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <SearchIcon className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">No tradies found</h3>
            <p className="text-gray-600">Try adjusting your search filters</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-4">{filteredTradies.length} tradies found</p>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTradies.map((tradie) => (
                <TradieCard
                  key={tradie.id}
                  tradie={tradie}
                  onChat={handleChatTradie}
                  onViewCalendar={handleViewCalendar}
                  onSave={handleSaveTradie}
                  isSaved={savedTradieIds.includes(tradie.id)}
                />
              ))}
            </div>
            {hasMore && !searchQuery.trim() && !postcodeFilter.trim() && !ratingFilter && !contractorTypeFilter && (
              <div className="flex justify-center mt-8">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="px-8 py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50 min-h-[44px]"
                >
                  {loading ? 'Loading...' : 'Load More'}
                </button>
              </div>
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
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Eye className="w-8 h-8 text-amber-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-3">Daily View Limit Reached</h2>
        <p className="text-gray-600 mb-6">
          You've used all {DAILY_VIEW_LIMIT_VALUE} of your free daily profile views. Post what you need and let tradies come to you instead.
        </p>
        <div className="flex flex-col gap-3">
          <Link
            to="/post-lead"
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors"
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
        <h2 className="text-2xl font-bold text-gray-900 mb-3">Sign In Required</h2>
        <p className="text-gray-600 mb-8">
          Create a free account or sign in to connect with tradies, view their availability, and request bookings.
        </p>
        <div className="flex flex-col gap-3">
          <Link
            to="/register"
            className="w-full px-6 py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors"
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

  if (user) {
    return (
      <DashboardLayout>
        <SEO title={seoTitle} description={seoDescription} canonical="/search" />
        {isClient && !isEngaged && remainingViews > 0 && remainingViews <= DAILY_VIEW_LIMIT_VALUE && (
          <div className="max-w-7xl mx-auto mb-4">
            <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
              <Eye className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <p className="text-sm text-blue-800">
                <span className="font-semibold">{remainingViews}</span> free profile view{remainingViews !== 1 ? 's' : ''} remaining today.{' '}
                <Link to="/post-lead" className="font-semibold underline hover:text-blue-900">Post a job</Link> for unlimited access.
              </p>
            </div>
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
      </DashboardLayout>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-9 h-9 bg-primary-600 rounded-lg flex items-center justify-center">
                <Wrench className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900">
                Connec<span className="text-blue-600">Tradie</span>
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
                className="px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="p-4 sm:p-6 lg:p-8">
        {searchContent}
      </main>

      {authPromptModal}
    </div>
  );
}
