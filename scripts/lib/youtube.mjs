export function youtubeFeedUrlFromChannelId(channelId) {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
}

export function extractYouTubeVideoId(url) {
  try {
    const parsed = new URL(url);

    if (parsed.hostname.includes("youtube.com")) {
      return parsed.searchParams.get("v") || "";
    }

    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.replace(/^\//, "");
    }

    return "";
  } catch {
    return "";
  }
}
