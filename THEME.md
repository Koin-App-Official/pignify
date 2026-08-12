# Application Theme Guide

This document defines the official color palette and visual tokens for the **Piggy** application. All UI components should adhere to these definitions to ensure visual consistency and a premium feel.

## 🎨 Color Palette

### Core Colors
| Token | Hex | HSL (Variable Format) | Usage |
| :--- | :--- | :--- | :--- |
| **Primary** | `#1D4ED8` | `224 76% 48%` | Primary actions, branding, active states |
| **Secondary** | `#3B82F6` | `217 91% 60%` | Secondary actions, highlights |
| **Neutral** | `#0F172A` | `222 47% 11%` | Main text, dark backgrounds |

### Status & Feedback
| Token | Hex | HSL (Variable Format) | Usage |
| :--- | :--- | :--- | :--- |
| **Success/Progress** | `#10B981` | `160 84% 39%` | Positive feedback, growth indicators |
| **Warning** | `#D97706` | `32 95% 44%` | Cautions, pending states |
| **Error** | `#B91C1C` | `0 74% 42%` | Errors, destructive actions |

### UI Surface & Layout
| Token | Hex | HSL (Variable Format) | Usage |
| :--- | :--- | :--- | :--- |
| **Background** | `#F8FAFC` | `210 40% 98%` | Main app background |
| **Surface** | `#FFFFFF` | `0 0% 100%` | Cards, modals, elevated surfaces |
| **Muted** | `#64748B` | `215 16% 47%` | Secondary text, inactive icons |
| **Border** | `#CBD5E1` | `214 32% 84%` | Dividers, input outlines |

### Charts & Goals
| Token | Hex | HSL (Variable Format) | Usage |
| :--- | :--- | :--- | :--- |
| **Goal (Base)** | `#10B981` | `160 84% 39%` | Primary chart data, main goal progress |
| **Goal (Lighter)** | `#34D399` | `158 64% 52%` | Secondary chart data, accents |
| **Goal (Subtle)** | `#A7F3D0` | `152 69% 80%` | Progress backgrounds, subtle bars |

---

## 🛠 Implementation Note

These colors are implemented as HSL CSS variables in `global.css`. When updating the theme, ensure the HSL values are formatted as `H S% L%` without the `hsl()` wrapper, as they are consumed by Tailwind/NativeWind using `hsl(var(--variable-name))`.

Example:
```css
--primary: 224 76% 48%;
```
