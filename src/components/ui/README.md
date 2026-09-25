# UI components (shadcn/ui)

These components are copied from [shadcn/ui](https://github.com/shadcn-ui/ui)
(`apps/v4/registry/new-york-v4/ui`, MIT licence). The team owns them and can restyle them.
They are built on Radix UI primitives through the unified `radix-ui` package.

Local changes from upstream:

- `cn` is imported from `@/lib/utils`.
- `sonner.tsx` takes its `theme` as a prop from the app shell instead of using `next-themes`.
- `form.tsx` translates validation messages, which are i18n keys (NFR-08).
- `toggle.tsx` also styles the pressed state from `aria-checked` / `aria-pressed`: a
  `TooltipTrigger asChild` around a toggle replaces its `data-state="on"` with the tooltip's
  own `data-state`, which hid the active tool in the toolbar.

To add another component, copy it from the same registry path and apply the same import
changes. The shadcn CLI also works where the registry is reachable; `components.json` is
configured for it.
