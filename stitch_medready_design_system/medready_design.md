---
name: Clinical Precision
colors:
  surface: '#fcf8fb'
  surface-dim: '#dcd9dc'
  surface-bright: '#fcf8fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f5'
  surface-container: '#f1edf0'
  surface-container-high: '#ebe7ea'
  surface-container-highest: '#e5e2e5'
  on-surface: '#1c1b1e'
  on-surface-variant: '#49454e'
  outline: '#7a757f'
  outline-variant: '#cac4cf'
  primary: '#0071e3'
  on-primary: '#ffffff'
  primary-container: '#d0e4ff'
  on-primary-container: '#001d35'
  secondary: '#5d5e71'
  on-secondary: '#ffffff'
  secondary-container: '#e2e0f9'
  on-secondary-container: '#191b2c'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#410002'
  success: '#34a853'
  warning: '#f9ab00'
  info: '#0071e3'

typography:
  font_family: 'Hanken Grotesk, sans-serif'
  display:
    large: { size: 57px, weight: 400, leading: 64px }
    medium: { size: 45px, weight: 400, leading: 52px }
    small: { size: 36px, weight: 400, leading: 44px }
  headline:
    large: { size: 32px, weight: 400, leading: 40px }
    medium: { size: 28px, weight: 400, leading: 36px }
    small: { size: 24px, weight: 400, leading: 32px }
  title:
    large: { size: 22px, weight: 500, leading: 28px }
    medium: { size: 16px, weight: 500, leading: 24px }
    small: { size: 14px, weight: 500, leading: 20px }
  body:
    large: { size: 16px, weight: 400, leading: 24px }
    medium: { size: 14px, weight: 400, leading: 20px }
    small: { size: 12px, weight: 400, leading: 16px }
  label:
    large: { size: 14px, weight: 500, leading: 20px }
    medium: { size: 12px, weight: 500, leading: 16px }
    small: { size: 11px, weight: 500, leading: 16px }

spacing:
  base: 4px
  margin:
    desktop: 48px
    mobile: 16px
  gutter:
    desktop: 24px
    mobile: 12px

shape:
  none: 0px
  extra-small: 4px
  small: 8px
  medium: 12px
  large: 16px
  extra-large: 28px
  full: 9999px

elevation:
  level0: 'none'
  level1: '0px 1px 3px 1px rgba(0, 0, 0, 0.15), 0px 1px 2px 0px rgba(0, 0, 0, 0.30)'
  level2: '0px 2px 6px 2px rgba(0, 0, 0, 0.15), 0px 1px 2px 0px rgba(0, 0, 0, 0.30)'
  level3: '0px 4px 8px 3px rgba(0, 0, 0, 0.15), 0px 1px 3px 0px rgba(0, 0, 0, 0.30)'
---

# MedReady - Design Documentation (Clinical Precision)

## Design Philosophy
MedReady uses the **Clinical Precision** design system, which prioritizes data clarity, high legibility, and a minimalist medical aesthetic. The interface is designed to reduce cognitive load for hospital staff in high-pressure environments.

## Visual Language
- **Color Coding**: Used functionally to indicate status.
    - **Blue (Primary)**: Action and brand identity.
    - **Green (Success)**: Process completed or on track.
    - **Amber/Orange (Warning)**: SLA risk or approaching deadline.
    - **Red (Critical)**: SLA breach or critical error.
- **Typography**: Hanken Grotesk provides a professional and modern look with exceptional readability at small sizes.
- **Elevation & Depth**: Flat design with subtle shadows used only for high-priority modal elements (e.g., Bottleneck Reporting).

## Implementation Checklist
1. Ensure all screens are responsive between Desktop (1440px) and Mobile (390px).
2. Use the defined color tokens for all status indicators.
3. Maintain the consistent navigation structure (SideNavBar for Desktop, BottomNavBar for Mobile).
4. Implement "ตึกพิเศษ" specific room ranges (EX01-EX30) in the Ward submission flow.
