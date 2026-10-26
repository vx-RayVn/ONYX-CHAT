export const publicPages: string[];
export const reservedPaths: Set<string>;
export function publicPage(pathname: string): string | null;
export function appLocation(url: URL): boolean;
