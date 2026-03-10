---
name: component-builder
description: Build React 18 + TypeScript + Tailwind components for ConnecTradie. Design system colors, component patterns, file structure, and accessibility requirements.
---

# Component Builder

## Colors
Primary: blue-600, Secondary: green-600, Warning: amber-500, Error: red-600, Bg: slate-50, Text: slate-900

## Structure
ui/ → Button, Card, Input, Badge, Modal, Skeleton
forms/ → JobPostForm, QuoteForm, ProfileEditForm, ReviewForm
layout/ → Header, Footer, Sidebar, PageWrapper
features/ → JobCard, TradieProfile, QuoteList, EscrowStatus, VerificationBadge

## Every component needs: loading (skeleton), error (message + retry), empty (icon + CTA), success states
## Mobile-first, all Tailwind utilities, TypeScript interfaces for props
## Accessibility: focus rings, labels, alt text, keyboard nav
