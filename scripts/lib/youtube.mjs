export function youtubeFeedUrlFromChannelId(channelId) {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
}

export function extractYouTubeVideoId(url) {
  try {
    const parsed = new URL(url);

    if (parsed.hostname.includes("youtube.com")) {
      const value = parsed.searchParams.get("v");
      if (value) return value;
    }

    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.replace(/^\//, "") || null;
    }
  } catch {
    return null;
  }

  return null;
}
