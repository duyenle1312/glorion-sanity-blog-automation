# GLORION Media design system

Extracted from `glorion-website` (`app/globals.css`, `components/ui/*`, and the
patterns repeated across its pages). This app copies it. Tokens live in
[`app/globals.css`](app/globals.css), primitives in [`components/ui/`](components/ui).

## Colour

| Token (Tailwind)        | Value                  | Website usage                                         |
| ----------------------- | ---------------------- | ----------------------------------------------------- |
| `primary`               | `#5169F7`              | Italic serif accent words, links on hover            |
| `secondary`             | `#091199`              | Default `<Button>` fill (glows blue on hover)         |
| `gold`                  | `#C6A45A`              | "READ MORE" links, gold borders, highlights           |
| `navy`                  | `#0D1670`              | Radial page ground `bg-radial from-navy to-black` (contact/mediakit pages; not used in the agent) |
| `body` / `muted-foreground` | `#C3C3C3`          | Body copy on black (`text-[#C3C3C3]` on the website)  |
| `periwinkle`            | `#8FA0FF`              | Light-blue secondary text (`text-[#8FA0FF]`)           |
| `surface` / `card`      | `#151515`              | Dark panels (the website also uses `#2b2a2a` + `border-gray-700` for service cards) |
| `background`            | black                  | Page body is `bg-black`                               |
| `foreground`            | near-white             | Headlines are `text-white`                            |
| `destructive`           | `oklch(0.704 0.191 22.2)` | shadcn dark destructive                           |

The website's shadcn semantic tokens (`border`, `input`, `ring`, `muted`, `accent`, …)
are the **new-york / neutral** set. The agent always uses the `.dark` values
(`<html class="dark">`).

**Agent state colours:** `primary` = in progress, `gold` = done/skipped, `destructive` = failed.

## Typography

| Font            | CSS variable / class             | Role                                                         |
| --------------- | -------------------------------- | ------------------------------------------------------------ |
| Geist           | `--font-geist-sans` / `font-sans` | Headlines (`font-semibold text-white`) and body           |
| Libre Bodoni    | `font-libre-bodoni`              | **Italic accent** inside headlines, usually `text-primary`: `Grow with <span class="font-libre-bodoni italic text-primary">GLORION Media</span>` |
| Poppins         | `font-poppins`                   | Nav items and buttons, weight 600                            |

The website also loads Golos Text, but it is barely used (4 times), so the agent leaves it out.

## Shape and effects

- Radius base `--radius: 0.625rem`. Cards and panels use `rounded-2xl`. CTAs are pills (`rounded-full`).
- Nav is a floating, blurred bar: `backdrop-blur-lg`, `rounded-[20px]` on mobile and `rounded-full` on desktop, sticky at the top.
- Hover glow: `shadow-glow` (`0 0 60px 12px rgb(37 99 235 / .6)`) on buttons, and `shadow-glow-violet` (`0 0 60px 30px rgb(72 38 240 / .6)`) on cards.
- Primary CTA: `<Button>` with `rounded-full font-poppins px-12 py-7`, uppercase on the marketing site.

## Primitives (shadcn new-york, copied verbatim)

- `components/ui/button.tsx`: the `default` variant is `bg-secondary` with the blue glow on hover.
- `components/ui/card.tsx`, `components/ui/input.tsx`
- `lib/utils.ts`: `cn()` (clsx + tailwind-merge)
- `components.json` for `npx shadcn add …`

## Assets

- `public/logo.png` is the wordmark copied from the website (2584×916).
