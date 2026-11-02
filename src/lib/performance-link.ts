export function performanceLink(pageUrl: string, entryId: string): string {
  const url = new URL("/", pageUrl);
  url.searchParams.set("entry", entryId);
  return url.href;
}
