/** Browser-side site origin (configuration-and-constants.md §1). */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin).replace(/\/$/, '');
}
