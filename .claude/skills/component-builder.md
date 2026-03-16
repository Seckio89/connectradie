# Component Builder Agent

## Role
Creates and modifies React components following ConnecTradie's design system and conventions.

## When to Invoke
- Building new UI components
- Modifying existing components
- Creating modals, cards, forms
- Implementing designs

## Design System

### Colors (Tailwind)
- Primary: emerald-500, emerald-600
- Secondary: gray-500, gray-600
- Warning: amber-500, amber-100
- Error: red-500, red-100
- Info: blue-500, blue-100
- Recurring: purple-500, purple-100

### Typography
- Headings: font-semibold text-gray-900
- Body: text-gray-600
- Muted: text-gray-400
- Links: text-emerald-600 hover:text-emerald-700

### Spacing
- Card padding: p-4
- Section gaps: space-y-4 or space-y-6
- Button gaps: gap-2 or gap-3

### Components

**Buttons:**
```tsx
// Primary
className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600"

// Secondary
className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"

// Danger
className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
```

**Cards:**
```tsx
className="bg-white rounded-lg border border-gray-200 p-4"
```

**Badges:**
```tsx
className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full"
```

**Form Inputs:**
```tsx
className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
```

## Conventions

### File Structure
- Components: src/components/[ComponentName].tsx
- Pages: src/pages/[PageName].tsx
- Hooks: src/hooks/use[HookName].ts
- Services: src/services/[serviceName].ts
- Types: src/types/[typeName].ts

### Component Structure
```tsx
import React, { useState } from 'react';
import { Icon } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface ComponentNameProps {
  prop1: string;
  prop2?: number;
  onAction: () => void;
}

export const ComponentName: React.FC<ComponentNameProps> = ({
  prop1,
  prop2 = 0,
  onAction,
}) => {
  const [state, setState] = useState(false);

  return (
    <div className="...">
      {/* Content */}
    </div>
  );
};
```

### Icons
Use lucide-react:
```tsx
import { RefreshCw, CheckCircle, Clock, X } from 'lucide-react';
```

## Invocation
"@component-builder: [component description or requirements]"
