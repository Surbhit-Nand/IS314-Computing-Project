# Style Format Guide - Animal Rescue & Adoption System

## Overview

This project uses a **utility-first CSS approach with minified custom properties** paired with **Tailwind CSS v4** and **PostCSS** for styling. The design system emphasizes semantic color variables and responsive grid layouts.

---

## CSS Architecture

### 1. **CSS Preprocessor & Framework**
- **Framework**: Tailwind CSS v4.2.1 with PostCSS plugin (`@tailwindcss/postcss`)
- **Minification**: All CSS is minified inline in `globals.css`
- **Bundler**: Vite 8.0.13 with Cloudflare plugin

### 2. **Import Structure**
```css
@import "tailwindcss";
```
The project imports Tailwind using the PostCSS import at the top of `app/globals.css`.

---

## Design System

### 3. **CSS Custom Properties (Variables)**

The project uses a comprehensive color palette defined in the `:root` selector:

```css
:root {
  --navy: #111820;
  --navy-2: #1b2630;
  --teal: #1587c3;
  --teal-dark: #0d6da2;
  --aqua: #55b8e7;
  --mint: #e8f4fb;
  --bg: #f3f6f9;
  --white: #fff;
  --slate: #657385;
  --line: #d7e0e8;
  --orange: #1587c3;
  --red: #d95050;
  --gold: #6daed4;
  --green: #147fb8;
  --shadow: 0 18px 45px rgba(15, 25, 34, .1);
}
```

### 4. **Color Palette**
| Variable | Hex Value | Usage |
|----------|-----------|-------|
| `--navy` | #111820 | Primary text, dark UI |
| `--navy-2` | #1b2630 | Secondary dark elements |
| `--teal` | #1587c3 | Primary accent, buttons, active states |
| `--teal-dark` | #0d6da2 | Hover states, emphasis |
| `--aqua` | #55b8e7 | Complementary accent |
| `--mint` | #e8f4fb | Light background for accents |
| `--bg` | #f3f6f9 | Default page background |
| `--white` | #fff | Backgrounds, card surfaces |
| `--slate` | #657385 | Secondary text, labels |
| `--line` | #d7e0e8 | Borders, dividers |
| `--red` | #d95050 | Alerts, urgent status |
| `--gold` | #6daed4 | Secondary accent |
| `--green` | #147fb8 | Success, availability |
| `--shadow` | rgba(15,25,34,.1) | Drop shadow default |

---

## Layout & Spacing

### 5. **Grid Systems**

#### Public Navigation
```css
.public-nav {
  display: grid;
  grid-template-columns: 250px 1fr 250px;  /* Logo | Nav | Staff Login */
  height: 82px;
  padding: 0 50px;
}
```

#### Catalog Layout
```css
.catalog-layout {
  display: grid;
  grid-template-columns: 310px 1fr;  /* Sidebar filters | Main content */
  gap: 30px;
}
```

#### Staff Dashboard Grid
```css
.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
}
```

#### Animal Grid
```css
.animal-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;  /* 3 columns at desktop */
}
```

### 6. **Spacing Conventions**
- **Padding**: 14px to 80px (multiples of 7, 14, 22, 28, etc.)
- **Gap (Flex/Grid)**: 5px to 70px
- **Margins**: Specific to component context
- **Min-height**: 100vh sections (full viewport height)

---

## Typography

### 7. **Font Stack**
```css
body {
  font-family: Arial, Helvetica, sans-serif;
}
```

### 8. **Font Sizing & Hierarchy**
- **Hero H1**: `clamp(62px, 7vw, 106px)` (responsive fluid scaling)
- **Form H2**: 22px
- **Small text**: 9px to 13px (labels, metadata)
- **Default body**: 12px to 15px

### 9. **Font Weight**
- **Regular**: 400
- **Bold**: 800 (buttons, headings)
- **Extra Bold**: 800 (labels, emphasis)

### 10. **Letter Spacing**
```css
letter-spacing: .04em;  /* Standard */
letter-spacing: .14em;  /* Labels */
letter-spacing: -.055em; /* Headlines (tighter) */
```

---

## Component Patterns

### 11. **Button Styles**

#### Primary (Teal Button)
```css
.teal-button {
  display: inline-flex;
  min-height: 54px;
  padding: 0 26px;
  border-radius: 21px;
  background: var(--teal);
  color: white;
  font-weight: 800;
  border: 0;
}

.teal-button:hover {
  background: var(--teal-dark);
}
```

#### Ghost Button (Outlined)
```css
.ghost-button {
  border: 1px solid rgba(255, 255, 255, .5);
  background: rgba(255, 255, 255, .12);
  color: white;
}
```

#### Submit Button
```css
.submit-button {
  width: 100%;
  padding: 15px;
  border-radius: 11px;
  background: var(--teal);
  color: white;
}
```

### 12. **Card & Modal Styles**

#### Modal
```css
.modal {
  width: min(820px, 100%);
  max-height: 92vh;
  border-radius: 24px;
  background: white;
  box-shadow: 0 30px 80px rgba(0, 0, 0, .3);
}

.modal-backdrop {
  background: rgba(6, 20, 35, .72);
  backdrop-filter: blur(5px);
}
```

#### Form Grid
```css
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 17px;
}

.form-grid input,
.form-grid select,
.form-grid textarea {
  border: 1px solid #ced9e5;
  border-radius: 10px;
}

.form-grid input:focus {
  border-color: var(--teal);
  box-shadow: 0 0 0 3px rgba(21, 135, 195, .12);
}
```

### 13. **Status Indicators**

#### Animal Status Badge
```css
.animal-status {
  display: inline-block;
  padding: 6px 12px;
  border-radius: 20px;
  background: var(--bg);
  color: var(--navy);
  font-size: 12px;
}

.animal-status.available { /* Dynamic class from statusClass() */ }
.animal-status.adopted { }
.animal-status.in-treatment { }
```

#### Urgency Indicators
```css
.urgency-dot.critical { background: var(--red); }
.urgency-dot.high { background: #ff9500; }
.urgency-dot.moderate { background: var(--gold); }
.urgency-dot.low { background: var(--green); }
```

### 14. **Toast Notifications**

```css
.toast {
  position: fixed;
  z-index: 1000;
  top: 92px;
  right: 24px;
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  border-radius: 14px;
  background: #effbf8;
  border: 1px solid #a9dfd5;
  color: #08665f;
  box-shadow: var(--shadow);
}

.toast b {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--teal);
  color: white;
}
```

---

## Responsive Design

### 15. **Breakpoints (Mobile-First)**

#### Desktop (1180px and up)
```css
@media (max-width: 1180px) {
  /* 2-column layouts */
  .animal-grid { grid-template-columns: 1fr 1fr; }
  .metric-grid { grid-template-columns: 1fr 1fr; }
}
```

#### Tablet (900px and up)
```css
@media (max-width: 900px) {
  .public-nav { grid-template-columns: 1fr auto; height: 72px; }
  .public-nav nav { position: fixed; bottom: 0; grid-template-columns: repeat(4, 1fr); }
  .staff-shell { grid-template-columns: 78px 1fr; }
  .animal-grid { grid-template-columns: 1fr 1fr; }
}
```

#### Mobile (620px and under)
```css
@media (max-width: 620px) {
  .public-hero { min-height: 620px; padding: 30px 20px 0; }
  .hero-content h1 { font-size: 49px; }
  .animal-grid { grid-template-columns: 1fr; }
  .form-grid { grid-template-columns: 1fr; }
  .staff-sidebar { position: fixed; bottom: 0; height: 64px; }
}
```

---

## Special Effects

### 16. **Gradients**

#### Hero Gradient
```css
background: linear-gradient(90deg, rgba(7, 21, 31, .96) 0%, rgba(8, 49, 77, .7) 48%, rgba(8, 28, 44, .32)), url('/spca-hero.webp') center 42%/cover no-repeat;
```

#### Text Gradient (H1 Emphasis)
```css
.hero-content h1 em {
  background: linear-gradient(90deg, #5bc0ec, #1687c3 48%, #9ed9f2);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
```

#### Rounded Pill Gradient (Accent Icon)
```css
.paw-logo {
  background: linear-gradient(145deg, #d9f0ec, #fff0df);
}
```

### 17. **Backdrop Effects**
```css
.modal-backdrop {
  backdrop-filter: blur(5px);
}

.impact-bar {
  backdrop-filter: blur(10px);
}
```

---

## Accessible Patterns

### 18. **Focus States**
All interactive elements use the teal focus ring:
```css
input:focus, select:focus, textarea:focus {
  border-color: var(--teal);
  box-shadow: 0 0 0 3px rgba(21, 135, 195, .12);
}
```

### 19. **Icon Grid**
```css
.ui-icon {
  display: inline-grid;
  min-width: 20px;
  place-items: center;
  font-style: normal;
}
```

---

## CSS Minification

### 20. **File Format**
The `app/globals.css` file is **intentionally minified** (no line breaks, compact format) to optimize bundle size. Comments are preserved for major section markers:

```css
/* Public navigation */
.public-nav { /* styles */ }

/* Animal catalog */
.catalog-page { /* styles */ }

/* Staff shell */
.staff-shell { /* styles */ }
```

---

## PostCSS & Build Configuration

### 21. **PostCSS Config** (`postcss.config.mjs`)
```javascript
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
export default config;
```

### 22. **Tailwind Integration**
- Tailwind v4 uses the PostCSS `@tailwindcss/postcss` plugin
- Automatic utility class generation from custom properties
- No separate config file needed (using defaults)

---

## TypeScript & JSX Styling

### 23. **CSS-in-JS via className**
React components use class-based styling (not inline styles):

```tsx
<button className="teal-button">{icon("animals")} Meet the Animals</button>
<div className={`animal-status ${statusClass(animal.status)}`}>
  ● {animal.status}
</div>
```

The `statusClass()` utility converts status strings to CSS classes:
```typescript
function statusClass(status: string) { 
  return status.toLowerCase().replaceAll(" ", "-"); 
}
// "Available" → "available", "In Treatment" → "in-treatment"
```

---

## Design Tokens Summary

| Token | Values |
|-------|--------|
| **Colors** | 14 CSS custom properties (navy, teal, slate, etc.) |
| **Shadows** | 1 default shadow variable |
| **Border Radius** | 10px, 11px, 12px, 14px, 20px, 21px, 24px, 28px, 30px, 999px |
| **Spacing Unit** | 7px multiples (14px, 22px, 28px, etc.) |
| **Font Family** | Arial, Helvetica, sans-serif |
| **Font Sizes** | 9px to clamp(62px, 7vw, 106px) |
| **Font Weights** | 400, 700, 800 |
| **Z-index Layers** | 20 (nav), 100 (modal), 1000 (toast) |
| **Breakpoints** | 1180px, 900px, 620px |

---

## Quick Reference: Common Patterns

### Flex Layout (Navigation)
```css
display: flex;
align-items: center;
justify-content: center;
gap: 12px;
```

### Grid Sidebar
```css
display: grid;
grid-template-columns: 310px 1fr;
gap: 30px;
```

### Centered Overlay
```css
position: fixed;
inset: 0;
display: grid;
place-items: center;
```

### Responsive Text Size
```css
font-size: clamp(62px, 7vw, 106px);
```

---

## Customization Guide

To modify styles:
1. **Add/modify colors**: Update `:root` variables in `app/globals.css`
2. **Update typography**: Modify font-size/font-weight in component classes
3. **Adjust spacing**: Change padding/gap values in grid and flex classes
4. **Add breakpoints**: Insert new `@media` block at bottom of file
5. **Component variants**: Add new class modifiers (e.g., `.teal-button.small`)

All changes cascade automatically via CSS custom properties and will apply across all components using `var(--colorName)`.
