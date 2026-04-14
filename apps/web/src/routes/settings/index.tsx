// Settings pages are now split into individual route files:
// - models.tsx (default)
// - repositories.tsx
// - api-keys.tsx
// - workspace.tsx
// - profile.tsx
//
// The router in App.tsx redirects /settings → /settings/models.
// This file is kept for backwards compatibility but is no longer used directly.

export { ModelsPage as SettingsPage } from './models';
