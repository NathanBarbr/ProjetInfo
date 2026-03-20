const STORAGE_KEY = "pingpong_favorites";

export interface FavoriteItem {
    id: string;
    videoSlug: string;
    clipId: string | null;
    title?: string;
    matchLabel?: string;
    winner?: string;
    nb_coups?: number;
    thumbnail?: string;
    backUrl?: string;
    addedAt: number;
}

export function loadFavorites(): FavoriteItem[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveFavorites(items: FavoriteItem[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function upsertFavorite(item: FavoriteItem): FavoriteItem[] {
    const items = loadFavorites().filter((f) => f.id !== item.id);
    items.unshift(item);
    saveFavorites(items);
    return items;
}

export function removeFavorite(id: string): FavoriteItem[] {
    const items = loadFavorites().filter((f) => f.id !== id);
    saveFavorites(items);
    return items;
}
