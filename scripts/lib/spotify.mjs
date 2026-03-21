export async function spotifyClientCredentialsToken({ clientId, clientSecret }) {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${credentials}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ grant_type: "client_credentials" })
  });

  if (!response.ok) {
    throw new Error(`Spotify token hiba: ${response.status}`);
  }

  const json = await response.json();
  return json.access_token;
}

export async function spotifyGetShowEpisodes({ token, showId, limit = 50 }) {
  const response = await fetch(`https://api.spotify.com/v1/shows/${showId}/episodes?market=HU&limit=${limit}`, {
    headers: {
      authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`Spotify episodes hiba: ${response.status}`);
  }

  const json = await response.json();
  return Array.isArray(json.items) ? json.items : [];
}
