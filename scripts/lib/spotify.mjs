export async function spotifyClientCredentialsToken({ clientId, clientSecret }) {
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ grant_type: "client_credentials" })
  });

  if (!response.ok) {
    throw new Error(`Spotify token request failed with HTTP ${response.status}`);
  }

  const json = await response.json();
  return json.access_token;
}

export async function spotifyGetShowEpisodes({ token, showId, limit = 50 }) {
  const items = [];
  let offset = 0;

  while (true) {
    const url = new URL(`https://api.spotify.com/v1/shows/${showId}/episodes`);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("market", "HU");

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after") || 5);
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      continue;
    }

    if (!response.ok) {
      throw new Error(`Spotify episodes request failed with HTTP ${response.status}`);
    }

    const json = await response.json();
    items.push(...(json.items || []));

    if (!json.next) break;
    offset += limit;
  }

  return items;
}
