# UI components (shadcn/ui)

These components are copied from [shadcn/ui](https://github.com/shadcn-ui/ui)
(`apps/v4/registry/new-york-v4/ui`, MIT licence). The team owns them and can restyle them.
They are built on Radix UI primitives through the unified `radix-ui` package.

Local changes from upstream:

- `cn` is imported from `@/lib/utils`.
- `sonner.tsx` takes its `theme` as a prop from the app shell instead of using `next-themes`.

To add another component, copy it from the same registry path and apply the same import
changes. The shadcn CLI also works where the registry is reachable; `components.json` is
configured for it.
