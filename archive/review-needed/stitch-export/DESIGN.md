---
name: Modern Intelligence
colors:
  surface: '#fbf8fe'
  surface-dim: '#dcd9de'
  surface-bright: '#fbf8fe'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f2f8'
  surface-container: '#f0edf2'
  surface-container-high: '#eae7ed'
  surface-container-highest: '#e4e1e7'
  on-surface: '#1b1b1f'
  on-surface-variant: '#5a4136'
  inverse-surface: '#303034'
  inverse-on-surface: '#f3f0f5'
  outline: '#8e7164'
  outline-variant: '#e2bfb0'
  surface-tint: '#a04100'
  primary: '#a04100'
  on-primary: '#ffffff'
  primary-container: '#ff6b00'
  on-primary-container: '#572000'
  inverse-primary: '#ffb693'
  secondary: '#5e5d67'
  on-secondary: '#ffffff'
  secondary-container: '#e1dee9'
  on-secondary-container: '#62626b'
  tertiary: '#5c5f60'
  on-tertiary: '#ffffff'
  tertiary-container: '#97999a'
  on-tertiary-container: '#2f3132'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbcc'
  primary-fixed-dim: '#ffb693'
  on-primary-fixed: '#351000'
  on-primary-fixed-variant: '#7a3000'
  secondary-fixed: '#e4e1ec'
  secondary-fixed-dim: '#c7c5d0'
  on-secondary-fixed: '#1b1b23'
  on-secondary-fixed-variant: '#46464f'
  tertiary-fixed: '#e1e3e4'
  tertiary-fixed-dim: '#c5c7c8'
  on-tertiary-fixed: '#191c1d'
  on-tertiary-fixed-variant: '#454748'
  background: '#fbf8fe'
  on-background: '#1b1b1f'
  surface-variant: '#e4e1e7'
typography:
  headline-lg:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Geist
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-sm:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1'
    letterSpacing: 0.01em
  mono-code:
    fontFamily: jetbrainsMono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.6'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 24px
  lg: 32px
  xl: 48px
  container-padding: 24px
  gutter: 16px
---

## Brand & Style

The design system is engineered for a premium SaaS environment that bridges the gap between high-performance utility and approachable intelligence. The brand personality is focused, energetic, and sophisticated, targeting power users who require a high-density dashboard that remains visually breathable.

The aesthetic follows a **Corporate/Modern** direction infused with **Soft Minimalism**. It prioritizes a high-contrast interaction model where the primary workspace is clinical and clean, while peripheral navigation and premium features utilize deep tones and vibrant gradients to signal depth and exclusivity. The emotional response should be one of "effortless control"—where complex AI workflows feel structured and premium.

## Colors

The palette is built on a "High-Energy Professional" foundation. 

- **Primary & Gradients:** The Primary Orange (#FF6B00) is used sparingly for core actions, focus states, and brand moments. For "Pro" or "Premium" surfaces, a directional gradient moving from the primary orange to a deeper red-orange is used to create a sense of heat and power.
- **Surface Strategy:** The design system utilizes a dual-surface approach. The navigation and global controls reside on the Secondary Dark Navy (#24242C), providing a sturdy frame. The active workspace uses a pure White (#FFFFFF) Surface to maximize legibility and minimize eye strain during long chat sessions.
- **Tonal Neutrals:** Surface-Variant (#F8F9FA) is reserved for low-priority panels like chat history or settings sidebars to provide subtle separation from the main canvas without the use of heavy lines.

## Typography

This design system utilizes **Geist** for its technical precision and neutral, modern stance. The typographic scale is optimized for high-density SaaS layouts, favoring readability and clear information hierarchy.

- **Headlines:** Use Semi-Bold weights with tight letter spacing for a modern, "engineered" look.
- **Body:** Standardized at 14px for density and 16px for primary chat output to ensure long-form reading comfort.
- **Monospace:** For AI code blocks or technical parameters, JetBrains Mono is integrated to provide a clear distinction from natural language.
- **Accessibility:** Ensure a minimum contrast ratio of 4.5:1 for all body text against their respective backgrounds (Surface and Surface-Variant).

## Layout & Spacing

The layout utilizes a **hybrid grid model**. 

- **Sidebar Navigation:** Fixed at 280px on desktop, collapsing to a 64px icon-only rail on smaller viewports.
- **Main Workspace:** A fluid container with a maximum content width of 1200px for dashboard views. For the chat interface, the text container is centered and constrained to 800px to maintain optimal line lengths.
- **Spacing Rhythm:** Based on an 8px linear scale. Use 24px (md) for standard internal component padding and 32px (lg) for section margins. 
- **Breakpoints:**
  - Mobile: < 768px (Single column, hidden sidebar via hamburger).
  - Tablet: 768px - 1024px (Collapsed sidebar rail).
  - Desktop: > 1024px (Full expanded sidebar).

## Elevation & Depth

Visual hierarchy is established through **Tonal Layering** and **Soft Ambient Shadows**.

- **Level 0 (Floor):** The Dark Navy Sidebar and White Workspace.
- **Level 1 (Cards/Panels):** Elements sitting on the workspace use a subtle 1px border (#E2E4E9) rather than shadows to maintain a clean SaaS look.
- **Level 2 (Active/Floating):** Use a soft, diffused shadow for active elements like the "Prompt Input" bar or hovering cards: `0px 4px 20px rgba(0, 0, 0, 0.05)`.
- **Level 3 (Overlays):** Modals and dropdowns use a more pronounced elevation with a backdrop blur (12px) on the layers beneath them to maintain context while focusing user attention.

## Shapes

The shape language is characterized by **Generous Roundness**, which softens the technical nature of the AI product. 

- **Outer Containers:** Large cards, the main chat window, and the sidebar use a signature 24px radius.
- **Interactive Elements:** Buttons, input fields, and chips use a 12px radius, creating a "squircle" feel that is friendly yet professional.
- **Nested Elements:** Small internal items (like individual messages or tooltips) should drop down to an 8px radius to maintain visual nested harmony (the "inner radius" rule).

## Components

- **Buttons:** Primary buttons use the Orange-Red gradient with white text. Ghost buttons use a 1px border of the Secondary Navy when on light surfaces. All buttons have a height of 44px for high touch/click targets.
- **Input Fields:** The chat prompt bar is a floating element with a 24px radius, a subtle 1px border, and a soft shadow. It should expand vertically as the user types.
- **Pro Plan Cards:** These are high-impact components using the Secondary Navy background with an accent border utilizing the Primary Orange gradient. Use "Glassmorphism" for internal card badges (e.g., "Popular").
- **Chat Bubbles:** AI responses are set against the Surface-Variant (#F8F9FA) with an 8px radius, while user messages are clean text or subtle outlined boxes to differentiate the "source of truth."
- **Sidebar Items:** Active states use a soft tint of the Primary color (10% opacity) or a small orange vertical indicator on the left edge.