export interface FavoriteItem {
    id: string;
    videoSlug: string;
    clipId: string | null;
    title?: string;
    matchLabel?: string;
    thumbnail?: string;
    addedAt: number;
}

const STORAGE_KEY = "pp_favorites";

function isBrowser(): boolean {
    return typeof window !== "undefined";
}

export function loadFavorites(): FavoriteItem[] {
    if (!isBrowser()) return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed as FavoriteItem[];
    } catch {
        return [];
    }
}

function saveFavorites(items: FavoriteItem[]): FavoriteItem[] {
    if (isBrowser()) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    }
    return items;
}

export function upsertFavorite(item: FavoriteItem): FavoriteItem[] {
    const items = loadFavorites();
    const next = [item, ...items.filter((f) => f.id !== item.id)];
    return saveFavorites(next);
}

export function removeFavorite(id: string): FavoriteItem[] {
    const items = loadFavorites();
    const next = items.filter((f) => f.id !== id);
    return saveFavorites(next);
}
