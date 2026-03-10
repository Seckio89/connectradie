import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import SEO from '../components/SEO';
import {
  Droplets,
  Zap,
  Hammer,
  Sparkles,
  ChefHat,
  UtensilsCrossed,
  Wrench,
  PaintBucket,
  TreeDeciduous,
  HardHat,
  Home,
  Layers,
  Square,
  Grid3X3,
  Fence,
  PanelTop,
  FlipVertical,
  Footprints,
  Lock,
  Wind,
  Sun,
  Waves,
  Bug,
  Trash2,
  Mountain,
  Droplet,
  Thermometer,
  DoorOpen,
  Shield,
  Tv,
  Settings,
  Blinds,
  ArrowRight,
  type LucideIcon
} from 'lucide-react';

interface Category {
  icon: LucideIcon;
  title: string;
  value: string;
  color: string;
  services: string[];
}

const allCategories: Category[] = [
  {
    icon: Droplets,
    title: 'Plumbing',
    value: 'plumber',
    color: 'sky',
    services: ['Blocked Drains', 'Gas Fitting', 'Hot Water Systems', 'Leak Detection', 'Pipe Installation', 'Bathroom Plumbing', 'Toilet Repairs', 'Tap Repairs', 'Burst Pipes', 'Sewer & Stormwater'],
  },
  {
    icon: Zap,
    title: 'Electrical',
    value: 'electrician',
    color: 'amber',
    services: ['Wiring & Rewiring', 'Light Installation', 'Switchboard Upgrades', 'Power Points', 'Safety Inspections', 'Ceiling Fans', 'Smoke Alarms', 'RCD Installation', 'Data Cabling', 'EV Charger Installation'],
  },
  {
    icon: Hammer,
    title: 'Carpentry',
    value: 'carpenter',
    color: 'orange',
    services: ['Custom Furniture', 'Decking', 'Door Installation', 'Kitchen Cabinets', 'Timber Repairs', 'Shelving', 'Pergolas', 'Wardrobes', 'Stairs & Balustrades', 'Window Installation'],
  },
  {
    icon: HardHat,
    title: 'Building',
    value: 'builder',
    color: 'slate',
    services: ['Extensions', 'Renovations', 'New Builds', 'Structural Work', 'Bathroom Remodeling', 'Granny Flats', 'Kitchen Renovations', 'Knockdown Rebuild', 'Heritage Restoration', 'Commercial Fitouts'],
  },
  {
    icon: PaintBucket,
    title: 'Painting',
    value: 'painter',
    color: 'rose',
    services: ['Interior Painting', 'Exterior Painting', 'Spray Painting', 'Wallpaper Installation', 'Color Consulting', 'Deck Staining', 'Feature Walls', 'Roof Painting', 'Commercial Painting', 'Epoxy Flooring'],
  },
  {
    icon: TreeDeciduous,
    title: 'Landscaping',
    value: 'landscaper',
    color: 'emerald',
    services: ['Garden Design', 'Lawn Care', 'Irrigation Systems', 'Paving', 'Tree Services', 'Retaining Walls', 'Outdoor Lighting', 'Turf Installation', 'Hedge Trimming', 'Land Clearing'],
  },
  {
    icon: Sparkles,
    title: 'Cleaning',
    value: 'cleaner',
    color: 'teal',
    services: ['End of Lease', 'Deep Cleaning', 'Regular Cleaning', 'Window Cleaning', 'Carpet Cleaning', 'Office Cleaning', 'Post-Construction', 'High Pressure Cleaning', 'Grout Cleaning', 'Upholstery Cleaning'],
  },
  {
    icon: Wrench,
    title: 'Handyman',
    value: 'handyman',
    color: 'gray',
    services: ['General Repairs', 'Furniture Assembly', 'Picture Hanging', 'Minor Plumbing', 'Minor Electrical', 'Door Repairs', 'Lock Installation', 'Gutter Cleaning', 'Pressure Washing', 'Property Maintenance'],
  },
  {
    icon: Home,
    title: 'Roofing',
    value: 'roofer',
    color: 'red',
    services: ['Roof Repairs', 'Roof Replacement', 'Tile Roofing', 'Metal Roofing', 'Colorbond Roofing', 'Gutters & Downpipes', 'Roof Restoration', 'Skylight Installation', 'Leak Detection', 'Roof Cleaning'],
  },
  {
    icon: Grid3X3,
    title: 'Tiling',
    value: 'tiler',
    color: 'blue',
    services: ['Floor Tiling', 'Wall Tiling', 'Bathroom Tiling', 'Kitchen Splashbacks', 'Outdoor Tiling', 'Pool Tiling', 'Mosaic Tiling', 'Tile Repairs', 'Waterproofing', 'Stone Installation'],
  },
  {
    icon: Layers,
    title: 'Concreting',
    value: 'concreter',
    color: 'stone',
    services: ['Driveways', 'Pathways', 'Concrete Slabs', 'Exposed Aggregate', 'Stamped Concrete', 'Polished Concrete', 'Concrete Resurfacing', 'Pool Surrounds', 'Concrete Cutting', 'Concrete Repairs'],
  },
  {
    icon: Square,
    title: 'Bricklaying',
    value: 'bricklayer',
    color: 'brick',
    services: ['Brick Walls', 'Brick Fences', 'Retaining Walls', 'Brick Repairs', 'Letterboxes', 'BBQ Areas', 'Feature Walls', 'Brick Paving', 'Stone Masonry', 'Repointing'],
  },
  {
    icon: PanelTop,
    title: 'Glazing',
    value: 'glazier',
    color: 'cyan',
    services: ['Window Replacement', 'Glass Repairs', 'Shower Screens', 'Mirrors', 'Splashbacks', 'Double Glazing', 'Security Glass', 'Balustrades', 'Emergency Glass Repairs', 'Glass Pool Fencing'],
  },
  {
    icon: Fence,
    title: 'Fencing',
    value: 'fencer',
    color: 'wood',
    services: ['Colorbond Fencing', 'Timber Fencing', 'Pool Fencing', 'Glass Fencing', 'Security Fencing', 'Gates & Automation', 'Rural Fencing', 'Commercial Fencing', 'Picket Fencing', 'Slat Fencing'],
  },
  {
    icon: FlipVertical,
    title: 'Plastering',
    value: 'plasterer',
    color: 'cream',
    services: ['Gyprock Installation', 'Plastering Repairs', 'Cornice Installation', 'Ceiling Repairs', 'Wall Lining', 'Ornamental Plastering', 'Acoustic Panels', 'Commercial Plastering', 'Bulkheads', 'Partition Walls'],
  },
  {
    icon: Layers,
    title: 'Rendering',
    value: 'renderer',
    color: 'sand',
    services: ['Cement Rendering', 'Acrylic Rendering', 'Texture Coating', 'Bagging', 'Hebel Rendering', 'Polished Render', 'Heritage Restoration', 'Commercial Rendering', 'Waterproofing', 'Crack Repairs'],
  },
  {
    icon: Footprints,
    title: 'Flooring',
    value: 'flooring',
    color: 'brown',
    services: ['Timber Flooring', 'Laminate Flooring', 'Vinyl Flooring', 'Carpet Installation', 'Floor Sanding', 'Floor Polishing', 'Bamboo Flooring', 'Engineered Flooring', 'Cork Flooring', 'Floor Repairs'],
  },
  {
    icon: Settings,
    title: 'Cabinet Making',
    value: 'cabinet-maker',
    color: 'walnut',
    services: ['Custom Kitchens', 'Bathroom Vanities', 'Built-in Wardrobes', 'Entertainment Units', 'Home Offices', 'Laundry Cabinets', 'Shop Fittings', 'Furniture Restoration', 'Custom Shelving', 'Garage Storage'],
  },
  {
    icon: Lock,
    title: 'Locksmith',
    value: 'locksmith',
    color: 'steel',
    services: ['Lock Installation', 'Lock Repairs', 'Key Cutting', 'Emergency Lockout', 'Safe Opening', 'Security Upgrades', 'Master Key Systems', 'Digital Locks', 'Car Locksmith', 'Access Control'],
  },
  {
    icon: Wind,
    title: 'Air Conditioning',
    value: 'air-conditioning',
    color: 'sky',
    services: ['Split System Installation', 'Ducted Air Con', 'Air Con Repairs', 'Air Con Servicing', 'Evaporative Cooling', 'Commercial HVAC', 'Refrigeration', 'Ventilation', 'Heat Pumps', 'Dehumidifiers'],
  },
  {
    icon: Sun,
    title: 'Solar',
    value: 'solar',
    color: 'yellow',
    services: ['Solar Panel Installation', 'Battery Storage', 'Solar Repairs', 'Solar Maintenance', 'Grid Connection', 'Off-Grid Systems', 'Commercial Solar', 'Solar Hot Water', 'EV Charging', 'Energy Audits'],
  },
  {
    icon: Waves,
    title: 'Pool Services',
    value: 'pool',
    color: 'aqua',
    services: ['Pool Construction', 'Pool Renovations', 'Pool Maintenance', 'Pool Cleaning', 'Pool Heating', 'Pool Fencing', 'Pool Equipment', 'Spa Installation', 'Pool Resurfacing', 'Leak Detection'],
  },
  {
    icon: Bug,
    title: 'Pest Control',
    value: 'pest-control',
    color: 'lime',
    services: ['General Pest Control', 'Termite Inspection', 'Termite Treatment', 'Rodent Control', 'Cockroach Control', 'Ant Control', 'Spider Control', 'Bee & Wasp Removal', 'Bird Control', 'Pre-Purchase Inspections'],
  },
  {
    icon: Trash2,
    title: 'Demolition',
    value: 'demolition',
    color: 'charcoal',
    services: ['House Demolition', 'Partial Demolition', 'Asbestos Removal', 'Site Clearing', 'Strip Outs', 'Commercial Demolition', 'Pool Demolition', 'Concrete Removal', 'Garage Demolition', 'Shed Removal'],
  },
  {
    icon: Mountain,
    title: 'Excavation',
    value: 'excavation',
    color: 'earth',
    services: ['Site Excavation', 'Pool Excavation', 'Trenching', 'Bobcat Hire', 'Excavator Hire', 'Land Clearing', 'Drainage', 'Retaining Walls', 'Driveway Excavation', 'Rock Breaking'],
  },
  {
    icon: Droplet,
    title: 'Waterproofing',
    value: 'waterproofing',
    color: 'navy',
    services: ['Bathroom Waterproofing', 'Balcony Waterproofing', 'Basement Waterproofing', 'Roof Waterproofing', 'Deck Waterproofing', 'Pool Waterproofing', 'Tanking', 'Membrane Systems', 'Crack Injection', 'Rising Damp'],
  },
  {
    icon: Thermometer,
    title: 'Insulation',
    value: 'insulation',
    color: 'pink',
    services: ['Ceiling Insulation', 'Wall Insulation', 'Floor Insulation', 'Roof Insulation', 'Acoustic Insulation', 'Spray Foam', 'Batts Installation', 'Underfloor Insulation', 'Commercial Insulation', 'Thermal Assessment'],
  },
  {
    icon: DoorOpen,
    title: 'Garage Doors',
    value: 'garage-doors',
    color: 'metal',
    services: ['Roller Door Installation', 'Sectional Doors', 'Tilt Doors', 'Garage Door Repairs', 'Motor Installation', 'Remote Programming', 'Commercial Doors', 'Industrial Doors', 'Door Automation', 'Spring Replacement'],
  },
  {
    icon: Shield,
    title: 'Security Systems',
    value: 'security',
    color: 'dark',
    services: ['CCTV Installation', 'Alarm Systems', 'Intercom Systems', 'Access Control', 'Security Cameras', 'Video Doorbells', 'Sensor Lights', 'Safe Installation', 'Home Automation', '24/7 Monitoring'],
  },
  {
    icon: Tv,
    title: 'Antenna & TV',
    value: 'antenna',
    color: 'indigo',
    services: ['TV Antenna Installation', 'Antenna Repairs', 'Satellite Dish', 'TV Wall Mounting', 'Home Theatre Setup', 'Signal Boosters', 'Multi-Room Setup', 'Smart TV Setup', 'Streaming Setup', 'Commercial AV'],
  },
  {
    icon: Settings,
    title: 'Appliance Repair',
    value: 'appliance-repair',
    color: 'silver',
    services: ['Washing Machine Repair', 'Dryer Repair', 'Dishwasher Repair', 'Fridge Repair', 'Oven Repair', 'Cooktop Repair', 'Microwave Repair', 'Rangehood Repair', 'Coffee Machine Repair', 'Commercial Appliances'],
  },
  {
    icon: Blinds,
    title: 'Curtains & Blinds',
    value: 'curtains-blinds',
    color: 'beige',
    services: ['Roller Blinds', 'Venetian Blinds', 'Vertical Blinds', 'Roman Blinds', 'Plantation Shutters', 'Curtains', 'Motorised Blinds', 'Awnings', 'Outdoor Blinds', 'Blind Repairs'],
  },
  {
    icon: ChefHat,
    title: 'Private Chef',
    value: 'private-chef',
    color: 'gold',
    services: ['Dinner Parties', 'Meal Prep', 'Special Occasions', 'Corporate Events', 'Cooking Classes', 'Diet-Specific Meals', 'In-Home Dining', 'Wedding Catering', 'Birthday Parties', 'Holiday Meals'],
  },
  {
    icon: UtensilsCrossed,
    title: 'Event Catering',
    value: 'catering',
    color: 'burgundy',
    services: ['Weddings', 'Corporate Events', 'Private Parties', 'BBQ Catering', 'Cocktail Events', 'Food Trucks', 'Buffet Service', 'Canapes', 'High Tea', 'Festival Catering'],
  },
];

const iconColors: Record<string, string> = {
  sky: 'text-secondary-600',
  amber: 'text-warm-600',
  orange: 'text-warm-600',
  slate: 'text-navy-600',
  rose: 'text-warm-600',
  emerald: 'text-secondary-600',
  teal: 'text-secondary-600',
  gray: 'text-gray-600',
  red: 'text-red-600',
  blue: 'text-secondary-600',
  stone: 'text-stone-600',
  brick: 'text-warm-700',
  cyan: 'text-secondary-600',
  wood: 'text-warm-700',
  cream: 'text-neutral-600',
  sand: 'text-yellow-700',
  brown: 'text-warm-800',
  walnut: 'text-warm-800',
  steel: 'text-zinc-600',
  yellow: 'text-yellow-600',
  aqua: 'text-secondary-500',
  lime: 'text-lime-600',
  charcoal: 'text-gray-700',
  earth: 'text-warm-700',
  navy: 'text-secondary-700',
  pink: 'text-warm-600',
  metal: 'text-navy-600',
  dark: 'text-gray-800',
  indigo: 'text-primary-600',
  silver: 'text-gray-500',
  beige: 'text-stone-500',
  gold: 'text-warm-600',
  burgundy: 'text-warm-700',
};

export default function Explore() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-white">
      <SEO
        title="Explore All Trade Categories"
        description="Browse 35+ trade categories on ConnecTradie. From plumbers and electricians to solar installers and private chefs — find the right professional for any job in Australia."
        canonical="/explore"
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
              {user ? (
                <Link
                  to="/dashboard"
                  className="px-4 py-2 bg-warm-500 text-white font-medium rounded-lg hover:bg-warm-600 transition-colors"
                >
                  Dashboard
                </Link>
              ) : (
                <>
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
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main id="main-content" className="py-12 sm:py-16">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
              Explore All Trade Categories
            </h1>
            <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
              Find the right professional for any job. Browse by category or search for specific services.
            </p>
          </div>

          <div className="space-y-5">
            {allCategories.map((category) => {
              const Icon = category.icon;
              const iconColor = iconColors[category.color] || 'text-secondary-600';

              return (
                <div
                  key={category.value}
                  className="bg-gray-100 rounded-xl border border-gray-200 p-5 sm:p-6"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-white rounded-lg border border-gray-200 flex items-center justify-center shadow-sm">
                      <Icon className={`w-5 h-5 ${iconColor}`} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-secondary-900">{category.title}</h2>
                      <Link
                        to={`/search?trade=${category.value}`}
                        className="text-xs text-primary-600 font-medium hover:underline inline-flex items-center gap-1"
                      >
                        View all tradies
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {category.services.map((service) => (
                      <Link
                        key={service}
                        to={`/search?trade=${category.value}&q=${encodeURIComponent(service)}`}
                        className="bg-white px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium transition-all hover:bg-warm-400 hover:border-warm-400 hover:text-gray-900 hover:shadow-sm"
                      >
                        {service}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-16 text-center">
            <p className="text-gray-600 mb-4">Can't find what you're looking for?</p>
            <Link
              to="/search"
              className="inline-flex items-center gap-2 px-6 py-3 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 transition-colors"
            >
              Browse All Tradies
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </main>

      <footer className="bg-gray-900 text-gray-400 py-8 mt-12">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Link to="/" className="inline-flex items-center mb-4">
            <span className="text-2xl font-extrabold tracking-tight text-white">
              Connec<span className="text-warm-500">Tradie</span>
            </span>
          </Link>
          <p className="text-sm">Connecting Australians with trusted trade professionals.</p>
        </div>
      </footer>
    </div>
  );
}
