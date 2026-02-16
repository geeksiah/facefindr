# Ferchr Logo Assets

Place your logo files in this directory. The app expects the following variations:

## Naming Convention

**IMPORTANT:** The `-dark` suffix indicates files **for use in dark mode** (light colored logos visible on dark backgrounds).

| File | Colors | Use When |
|------|--------|----------|
| `icon.svg` | Dark colors (black/dark gray) | Light mode (light backgrounds) |
| `icon-dark.svg` | Light colors (white/light gray) | Dark mode (dark backgrounds) |

## Required Logo Files

### Primary Logo (Full)
- `logo.svg` - Full logo with icon + wordmark (dark colors for light backgrounds)
- `logo-dark.svg` - Dark mode variant (light colors for dark backgrounds)

### Icon Only (Favicon/App Icon)
- `icon.svg` - Square icon, dark colors (for light mode)
- `icon-dark.svg` - Square icon, light colors (for dark mode)

### Wordmark Only
- `wordmark.svg` - Text only "Ferchr" (dark colors for light backgrounds)
- `wordmark-dark.svg` - Text only (light colors for dark backgrounds)

## Recommended Dimensions

### SVG Files (Vector - Preferred)
All SVG files should be designed at these viewBox sizes:
- **icon.svg**: `viewBox="0 0 48 48"` (square)
- **logo.svg**: `viewBox="0 0 180 48"` (horizontal, ~4:1 ratio)
- **wordmark.svg**: `viewBox="0 0 140 32"`

### PNG Exports (if needed)
Generate PNGs at these sizes for specific use cases:

#### Favicons
- `favicon-16x16.png` (16×16px)
- `favicon-32x32.png` (32×32px)
- `favicon-48x48.png` (48×48px)

#### Apple Touch Icons
- `apple-touch-icon.png` (180×180px)

#### Open Graph / Social
- `og-logo.png` (1200×630px) - For social sharing
- `twitter-card.png` (800×418px)

#### App Store Icons (Mobile)
- `app-icon-512.png` (512×512px) - iOS/Android stores
- `app-icon-1024.png` (1024×1024px) - High-res source

## Design Guidelines

### Colors
The logo should work well with these brand colors:

**Light Mode (use `*.svg` - dark icons):**
- Background: `#FAFAFA` (off-white)
- Icon/Text: `#1A1A1A` (almost black)
- Accent: `#0A84FF` (iOS blue)

**Dark Mode (use `*-dark.svg` - light icons):**
- Background: `#000000` (true black)
- Icon/Text: `#F5F5F7` (off-white)
- Accent: `#0A84FF` (same blue)

### Corner Radius
- App icon should have built-in rounded corners: 22.37% (iOS standard)
- Or provide square and let platforms apply their own rounding

### Safe Zone
- Keep essential elements within 80% of the icon area
- Allow for platform-specific masking

## File Checklist

```
logos/
├── icon.svg              # Dark icon for light mode (48x48 viewBox)
├── icon-dark.svg         # Light icon for dark mode
├── logo.svg              # Dark horizontal logo for light mode
├── logo-dark.svg         # Light horizontal logo for dark mode
├── wordmark.svg          # Dark text for light mode
├── wordmark-dark.svg     # Light text for dark mode
├── favicon-32x32.png     # Browser favicon
├── apple-touch-icon.png  # iOS bookmark (180x180)
├── og-logo.png           # Social sharing (1200x630)
└── app-icon-512.png      # App stores (512x512)
```

## Usage in App

The app will automatically switch between variants based on the current theme:
- Light theme → `icon.svg`, `logo.svg`, `wordmark.svg`
- Dark theme → `icon-dark.svg`, `logo-dark.svg`, `wordmark-dark.svg`

Update `apps/web/src/app/layout.tsx` to reference the favicon, and the `Logo` component handles theme switching automatically.
