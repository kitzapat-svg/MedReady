---
name: Clinical Precision
colors:
  surface: '#fcf8fb'
  surface-dim: '#dcd9dc'
  surface-bright: '#fcf8fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f5'
  surface-container: '#f0edef'
  surface-container-high: '#eae7ea'
  surface-container-highest: '#e4e2e4'
  on-surface: '#1b1b1d'
  on-surface-variant: '#414753'
  inverse-surface: '#303032'
  inverse-on-surface: '#f3f0f2'
  outline: '#717785'
  outline-variant: '#c1c6d6'
  surface-tint: '#005cbb'
  primary: '#0059b5'
  on-primary: '#ffffff'
  primary-container: '#0071e3'
  on-primary-container: '#fcfbff'
  inverse-primary: '#abc7ff'
  secondary: '#5d5e60'
  on-secondary: '#ffffff'
  secondary-container: '#dfdfe1'
  on-secondary-container: '#616365'
  tertiary: '#9b3f00'
  on-tertiary: '#ffffff'
  tertiary-container: '#c25100'
  on-tertiary-container: '#fffaf9'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d7e2ff'
  primary-fixed-dim: '#abc7ff'
  on-primary-fixed: '#001b3f'
  on-primary-fixed-variant: '#00458f'
  secondary-fixed: '#e2e2e4'
  secondary-fixed-dim: '#c6c6c8'
  on-secondary-fixed: '#1a1c1d'
  on-secondary-fixed-variant: '#454749'
  tertiary-fixed: '#ffdbcb'
  tertiary-fixed-dim: '#ffb693'
  on-tertiary-fixed: '#341000'
  on-tertiary-fixed-variant: '#7a3000'
  background: '#fcf8fb'
  on-background: '#1b1b1d'
  surface-variant: '#e4e2e4'
  surface-pure: '#FFFFFF'
  text-muted: '#86868B'
  status-ready: '#28CD41'
  status-warning: '#FF9F0A'
  status-critical: '#FF3B30'
  border-subtle: '#D2D2D7'
typography:
  display-id:
    fontFamily: Hanken Grotesk
    fontSize: 44px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 17px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: Be Vietnam Pro
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  label-caps:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
  numeric-data:
    fontFamily: Hanken Grotesk
    fontSize: 19px
    fontWeight: '500'
    lineHeight: 24px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  margin-mobile: 20px
  margin-desktop: 40px
  gutter: 24px
  container-max: 1200px
---

## Brand & Style
The design system is anchored in the concept of "Quiet Efficiency." It prioritizes the cognitive load of healthcare professionals by stripping away non-essential decorative elements in favor of extreme clarity and disciplined restraint. The aesthetic is a fusion of **Modern Minimalism** and **Corporate Reliability**, mirroring the high-polish standards of premium hardware interfaces.

The emotional response should be one of calm control—critical information is surfaced through rigorous hierarchy, while the "clinical-but-warm" character is achieved through soft tonal shifts and generous whitespace. The interface acts as a silent partner, facilitating rapid communication without the "noise" of traditional administrative dashboards.

## Colors
The palette is dominated by neutrals to maintain a professional atmosphere. 
- **Primary:** A refined, high-visibility blue used exclusively for actionable elements and primary brand touchpoints.
- **Surface Strategy:** Use `#F5F5F7` for the base canvas and `#FFFFFF` for interactive cards to create depth without relying on heavy shadows.
- **Typography:** Primary text uses `#1D1D1F` (off-black) to reduce eye strain while maintaining maximum contrast. Secondary metadata uses `#86868B`.
- **Semantic Logic:** Status colors are saturated but used sparingly—only for indicators, icons, or progress bars—to ensure they command attention when a threshold is crossed.

## Typography
The system uses a sophisticated pairing to ensure Thai and Latin characters maintain visual parity. 
- **Headlines:** **Hanken Grotesk** provides a sharp, modern, and technical feel. Use `display-id` for Case IDs and Time-stamps to ensure they are glanceable from a distance.
- **Body:** **Be Vietnam Pro** is used for all descriptive text, providing high legibility for Thai script with a warm, approachable tone.
- **Numerals:** Always use tabular lining for time and IDs in tables to ensure columns align perfectly for rapid scanning.

## Layout & Spacing
The layout follows a **Fixed-Fluid Hybrid** model.
- **Desktop:** A centered 12-column grid with a maximum container width of 1200px to prevent line lengths from becoming unreadable.
- **Mobile:** A single-column flow with 20px side margins. Key actions are housed in a persistent bottom navigation bar.
- **Spacing Rhythm:** Based on an 8px baseline grid. Use 40px–64px of vertical whitespace between major sections to enforce a premium, uncrowded feel. Lists should utilize generous internal padding (16px–20px) to prevent the "data-heavy" look of typical hospital software.

## Elevation & Depth
Depth is conveyed through **Tonal Layering** and **Micro-Shadows**:
- **Level 0 (Canvas):** `#F5F5F7` background.
- **Level 1 (Cards/Surfaces):** `#FFFFFF` with a 1px border of `#D2D2D7`.
- **Level 2 (Active/Hover):** Add an extremely diffused, 12% opacity shadow (Offset: 0, 4px; Blur: 20px) tinted with the primary blue hue.
- **Glassmorphism:** Use for persistent top headers on scroll—apply a `backdrop-filter: blur(20px)` with a 80% white opacity fill to maintain context of the content beneath.

## Shapes
Elements use a refined **Rounded** language (8px default) to soften the clinical environment.
- **Buttons/Inputs:** 8px radius.
- **Large Cards:** 16px (`rounded-lg`) to create a distinct containerized feel.
- **Status Pills:** 100px (full-round) for "READY" or "URGENT" badges, ensuring they look like distinct physical objects.

## Components
- **Buttons:** Primary buttons use solid `#0071E3` with white text. Secondary buttons use a subtle gray fill (`#E8E8ED`) with blue text. No heavy gradients.
- **Minimalist Cards:** Cards should not have heavy borders; use the white-on-gray surface contrast. Include a 4px vertical "status strip" on the left edge of cards to indicate SLA status (Green, Amber, Red).
- **Timeline:** A signature vertical component using a thin 2px neutral line. Completed steps use a solid blue dot; upcoming steps use a hollow ring.
- **Progress Indicators:** Use thin (4px) linear bars. Avoid circular "loaders" unless for full-page transitions; use skeleton states for individual card content.
- **Input Fields:** Floating labels with a 1px bottom border that transforms into a 2px blue border on focus.
- **Bottom Nav (Mobile):** Icons should be lightweight (1.5pt stroke) with clear text labels in `label-caps` style.