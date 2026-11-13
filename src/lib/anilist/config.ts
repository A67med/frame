export const ANILIST_GRAPHQL_URL = "https://graphql.anilist.co";
export const ANILIST_AUTHORIZE_URL = "https://anilist.co/api/v2/oauth/authorize";
export const ANILIST_PIN_REDIRECT_URI = "https://anilist.co/api/v2/oauth/pin";
export const ANILIST_DEVELOPER_URL = "https://anilist.co/settings/developer";
// Frame's AniList client, registered with the pin redirect; the implicit grant needs no secret.
export const ANILIST_CLIENT_ID = (import.meta.env?.VITE_ANILIST_CLIENT_ID ?? "").trim() || "42941";
