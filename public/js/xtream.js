/**
 * M3U PLAYLIST & XTREAM CODES API CLIENT
 * Enables importing custom playlists or connecting any IPTV provider account
 */

class PlaylistManager {
  constructor() {
    this.storageKey = "ott_custom_channels_v12";
  }

  // Parse raw M3U / M3U8 text into standard channel objects
  parseM3U(m3uContent) {
    const lines = m3uContent.split(/\r?\n/);
    const channels = [];
    let currentChannel = null;
    let chNumber = 1000;
    let pendingProps = { licenseKey: null, userAgent: null, referer: null };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith("#KODIPROP:inputstream.adaptive.license_key=")) {
        const keyVal = line.replace("#KODIPROP:inputstream.adaptive.license_key=", "").trim();
        if (currentChannel && !currentChannel.streamUrl) {
          currentChannel.licenseKey = keyVal;
        } else {
          pendingProps.licenseKey = keyVal;
        }
      } else if (line.startsWith("#EXTVLCOPT:http-user-agent=")) {
        const uaVal = line
          .replace("#EXTVLCOPT:http-user-agent=", "")
          .replace(/^User-Agent:\s*/i, "")
          .trim();
        if (currentChannel && !currentChannel.streamUrl) {
          currentChannel.userAgent = uaVal;
        } else {
          pendingProps.userAgent = uaVal;
        }
      } else if (line.startsWith("#EXTVLCOPT:http-referrer=") || line.startsWith("#EXTVLCOPT:http-referer=")) {
        const refVal = line.replace(/#EXTVLCOPT:http-referr?er=/i, "").trim();
        if (currentChannel && !currentChannel.streamUrl) {
          currentChannel.referer = refVal;
        } else {
          pendingProps.referer = refVal;
        }
      } else if (line.startsWith("#EXTINF:")) {
        if (currentChannel) {
          if (!currentChannel.streamUrl && currentChannel.candidateUrl) {
            currentChannel.streamUrl = currentChannel.candidateUrl;
            currentChannel.isDash = currentChannel.candidateUrl.includes(".mpd");
          }
          if (currentChannel.streamUrl) {
            channels.push(currentChannel);
          }
          currentChannel = null;
        }

        chNumber++;
        currentChannel = {
          id: `custom-ch-${chNumber}`,
          number: String(chNumber),
          name: "Unknown Channel",
          group: "Malaysia",
          logo: "https://images.unsplash.com/photo-1598899134739-24c46f58b8c0?w=100&auto=format&fit=crop&q=80",
          streamUrl: "",
          resolution: "HD",
          currentProgram: "Live Broadcast",
          nextProgram: "Upcoming Program",
          desc: "Custom imported playlist channel.",
          favorite: false,
          licenseKey: pendingProps.licenseKey || null,
          userAgent: pendingProps.userAgent || null,
          referer: pendingProps.referer || null
        };
        pendingProps = { licenseKey: null, userAgent: null, referer: null };

        // Extract metadata: tvg-name, tvg-logo, group-title, ch-number
        const tvgNameMatch = line.match(/tvg-name="([^"]+)"/i);
        const tvgLogoMatch = line.match(/tvg-logo="([^"]+)"/i);
        const groupTitleMatch = line.match(/group-title="([^"]+)"/i);
        const chNumberMatch = line.match(/ch-number="([^"]+)"/i);
        
        // Extract channel name after comma
        const commaIdx = line.lastIndexOf(",");
        if (commaIdx !== -1) {
          currentChannel.name = line.substring(commaIdx + 1).trim();
        } else if (tvgNameMatch) {
          currentChannel.name = tvgNameMatch[1];
        }

        if (tvgLogoMatch && tvgLogoMatch[1].startsWith("http")) {
          currentChannel.logo = tvgLogoMatch[1];
        }

        if (groupTitleMatch) {
          let grp = groupTitleMatch[1].trim();
          // Clean up group titles like "PREMIUM MALAY[TEST]" or "MALAYSIA"
          grp = grp.replace(/\[.*?\]/g, "").trim();
          if (grp.toLowerCase() === "malaysia") grp = "Malaysia";
          currentChannel.group = grp || "Malaysia";
        }

        if (chNumberMatch) {
          currentChannel.number = chNumberMatch[1];
        } else {
          const numPrefixMatch = currentChannel.name.match(/^(\d{1,4})\s+/);
          if (numPrefixMatch) currentChannel.number = numPrefixMatch[1];
        }
        currentChannel.id = `ch-${currentChannel.number}`;

        // Inherit real EPG show data if available
        if (typeof DEFAULT_CHANNELS !== "undefined" && Array.isArray(DEFAULT_CHANNELS)) {
          const matchedDc = DEFAULT_CHANNELS.find(dc => String(dc.number) === String(currentChannel.number));
          if (matchedDc) {
            currentChannel.currentProgram = matchedDc.currentProgram || "Live TV";
            currentChannel.nextProgram = matchedDc.nextProgram || "";
            currentChannel.desc = matchedDc.desc || "";
            currentChannel.progress = matchedDc.progress ?? 50;
            currentChannel.programStart = matchedDc.programStart || null;
            currentChannel.programEnd = matchedDc.programEnd || null;
            currentChannel.schedule = matchedDc.schedule || [];
          }
        }

        // Detect resolution from channel name
        const nameUpper = currentChannel.name.toUpperCase();
        if (nameUpper.includes("4K") || nameUpper.includes("UHD")) {
          currentChannel.resolution = "4K UHD";
        } else if (nameUpper.includes("FHD") || nameUpper.includes("1080")) {
          currentChannel.resolution = "1080P";
        } else if (nameUpper.includes("HD") || nameUpper.includes("720")) {
          currentChannel.resolution = "720P";
        } else {
          currentChannel.resolution = "HD";
        }

      } else if (currentChannel && (line.startsWith("http://") || line.startsWith("https://") || line.startsWith("#http://") || line.startsWith("#https://"))) {
        const isCommented = line.startsWith("#");
        const cleanUrl = isCommented ? line.substring(1).trim() : line;

        if (!currentChannel.streamUrl) {
          if (!isCommented) {
            currentChannel.streamUrl = cleanUrl;
            currentChannel.isDash = cleanUrl.includes(".mpd");
          } else if (!currentChannel.candidateUrl) {
            currentChannel.candidateUrl = cleanUrl;
          }
        } else if (!currentChannel.fallbackUrl && cleanUrl !== currentChannel.streamUrl) {
          currentChannel.fallbackUrl = cleanUrl;
        }
      }
    }

    // Flush last channel if pending
    if (currentChannel) {
      if (!currentChannel.streamUrl && currentChannel.candidateUrl) {
        currentChannel.streamUrl = currentChannel.candidateUrl;
        currentChannel.isDash = currentChannel.candidateUrl.includes(".mpd");
      }
      if (currentChannel.streamUrl) {
        channels.push(currentChannel);
      }
    }

    return channels;
  }

  // Connect to Xtream Codes API server
  async fetchXtream(serverUrl, username, password) {
    let cleanUrl = serverUrl.replace(/\/+$/, "");
    if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
      cleanUrl = `http://${cleanUrl}`;
    }

    const authUrl = `${cleanUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

    try {
      const res = await fetch(authUrl);
      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      const data = await res.json();

      if (!data.user_info || data.user_info.auth === 0) {
        throw new Error("Authentication failed. Please check username & password.");
      }

      // Fetch live channels
      const liveUrl = `${authUrl}&action=get_live_streams`;
      const liveRes = await fetch(liveUrl);
      const liveData = await liveRes.json();

      const channels = liveData.map((stream, idx) => ({
        id: `xtream-${stream.stream_id || idx}`,
        number: String(stream.num || idx + 1),
        name: stream.name,
        group: stream.category_id || "Xtream Live",
        logo: stream.stream_icon || "https://images.unsplash.com/photo-1598899134739-24c46f58b8c0?w=100&auto=format&fit=crop&q=80",
        streamUrl: `${cleanUrl}/live/${username}/${password}/${stream.stream_id}.m3u8`,
        resolution: "HD",
        currentProgram: "Live Broadcast",
        nextProgram: "Program",
        desc: "Live stream via Xtream Codes provider.",
        favorite: false
      }));

      return { success: true, channels, userInfo: data.user_info };
    } catch (err) {
      console.error("Xtream fetch error:", err);
      return { success: false, error: err.message };
    }
  }

  // Save custom channels into localStorage
  saveCustomChannels(channels) {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(channels));
      return true;
    } catch (e) {
      console.error("Storage error:", e);
      return false;
    }
  }

  getSavedCustomChannels() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }

  clearCustomChannels() {
    localStorage.removeItem(this.storageKey);
  }
}
