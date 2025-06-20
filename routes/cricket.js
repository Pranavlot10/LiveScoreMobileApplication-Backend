import express from "express";
import axios from "axios";

const router = express.Router();

// Assuming these are passed or imported from the main app
let cache,
  pool,
  Cricbuzz_APIProvider_URL,
  Cricbuzz_API_URL,
  updateApiKeyUsage,
  getAvailableApiKey,
  checkAndStoreTeamImages;

function setDependencies(deps) {
  ({
    cache,
    pool,
    Cricbuzz_APIProvider_URL,
    Cricbuzz_API_URL,
    updateApiKeyUsage,
    getAvailableApiKey,
    checkAndStoreTeamImages,
  } = deps);
}

const extractMatches = (data) => {
  if (!data) return [];
  return data.typeMatches.flatMap(
    (typeMatch) =>
      typeMatch.seriesMatches?.flatMap(
        (seriesMatch) => seriesMatch.seriesAdWrapper?.matches || []
      ) || []
  );
};

// Today's matches
router.get("/todays-matches", async (req, res) => {
  try {
    const cachedMatchesKey = "MatchesKey";
    const cachedMatches = cache.get(cachedMatchesKey);
    if (cachedMatches) {
      console.log("Serving from cache");
      return res.json(cachedMatches);
    }

    const cricbuzzProviderKeyData = await getAvailableApiKey(
      "cricbuzzProvider"
    );
    console.log(`Using API Key: ${cricbuzzProviderKeyData.api_key_id}`);

    let headers = {
      "x-rapidapi-key": cricbuzzProviderKeyData.value,
      "x-rapidapi-host": "cricbuzz-cricket2.p.rapidapi.com",
    };

    const [
      liveMatchesResponse,
      upcomingMatchesResponse,
      recentMatchesResponse,
    ] = await Promise.all([
      axios.get(`${Cricbuzz_APIProvider_URL}/matches/v1/live`, { headers }),
      axios.get(`${Cricbuzz_APIProvider_URL}/matches/v1/upcoming`, { headers }),
      axios.get(`${Cricbuzz_APIProvider_URL}/matches/v1/recent`, { headers }),
    ]);

    console.log("All API calls completed");

    const liveMatchesData = extractMatches(liveMatchesResponse?.data);
    const upcomingMatchesData = extractMatches(upcomingMatchesResponse?.data);
    const recentMatchesData = extractMatches(recentMatchesResponse?.data);

    const updatedCache = {
      liveMatchesData,
      upcomingMatchesData,
      recentMatchesData,
    };
    cache.set(cachedMatchesKey, updatedCache);

    console.log("Serving from API and caching the data");
    res.json(updatedCache);

    await updateApiKeyUsage(cricbuzzProviderKeyData.id, 3);
  } catch (error) {
    console.error(
      "Error fetching data from API from matches route:",
      error.message
    );
    res.status(500).json({ error: "Unable to fetch match data" });
  }
});

// Scorecard
router.get("/scorecard/:matchId", async (req, res) => {
  const { matchId } = req.params;
  const aTeam = JSON.parse(req.query.aTeam);
  const hTeam = JSON.parse(req.query.hTeam);

  if (!matchId) return res.status(400).json({ error: "Match ID is required" });

  const matchCacheKey = matchId;
  const cachedMatchData = cache.get(matchCacheKey);
  if (cachedMatchData) {
    console.log("Serving from cache");
    return res.json(cachedMatchData);
  }

  try {
    const cricbuzzProviderKeyData = await getAvailableApiKey(
      "cricbuzzProvider"
    );
    if (!cricbuzzProviderKeyData) {
      console.warn("⚠️ No available API keys for news sources.");
      return res.status(429).json({
        error: "All API keys for news sources are exhausted. Try again later.",
      });
    }

    let headers = {
      "x-rapidapi-key": cricbuzzProviderKeyData.value,
      "x-rapidapi-host": "cricbuzz-cricket2.p.rapidapi.com",
    };

    console.log("CricbuzzProvider:", cricbuzzProviderKeyData.api_key_id);

    const scorecardCallURL = `${Cricbuzz_APIProvider_URL}/mcenter/v1/${matchId}/scard`;
    const squadsCallURL = `${Cricbuzz_APIProvider_URL}/mcenter/v1/${matchId}/teams`;

    const [scorecardResponse, squadsResponse] = await Promise.all([
      axios.get(scorecardCallURL, { headers }),
      axios.get(squadsCallURL, { headers }),
    ]);

    console.log("All API calls completed");

    const teamImageIds = [
      { team: hTeam.teamSName, teamId: hTeam.teamId, imageId: hTeam.imageId },
      { team: aTeam.teamSName, teamId: aTeam.teamId, imageId: aTeam.imageId },
    ];

    const imageResults = await checkAndStoreTeamImages(teamImageIds);

    const combinedData = {
      scorecard: scorecardResponse.data,
      teamImages: imageResults,
      squads: squadsResponse.data,
    };

    cache.set(matchCacheKey, combinedData);
    await updateApiKeyUsage(cricbuzzProviderKeyData.id, 1);
    res.json(combinedData);
  } catch (error) {
    console.error("Error fetching data from API from scorecard route:", {
      message: error.message,
    });
    res.status(500).json({ error: "Unable to fetch scorecard data" });
  }
});

router.get("/commentary/:matchId", async (req, res) => {
  const { matchId } = req.params;

  if (!matchId) {
    return res.status(400).json({ error: "Match ID is required" });
  }

  const matchCommentaryCacheKey = `${matchId}commentary`;

  // Check cache before making API calls
  const cachedMatchCommentary = cache.get(matchCommentaryCacheKey);
  if (cachedMatchCommentary) {
    console.log("Serving from cache");
    return res.json(cachedMatchCommentary);
  }

  try {
    // Fetch an available API key for "cricket_live_line"
    const cricbuzzProviderKeyData = await getAvailableApiKey(
      "cricbuzzProvider"
    );

    let headers = {
      "x-rapidapi-key": cricbuzzProviderKeyData.value,
      "x-rapidapi-host": "cricbuzz-cricket2.p.rapidapi.com",
    };

    if (!cricbuzzProviderKeyData) {
      console.warn("⚠️ No available API keys for news sources.");
      return res.status(429).json({
        error: "All API keys for news sources are exhausted. Try again later.",
      });
    }

    console.log("CricbuzzProvider:", cricbuzzProviderKeyData.api_key_id);

    let matchCommentaryCallURL = `${Cricbuzz_APIProvider_URL}/mcenter/v1/${matchId}/comm`;
    // const matchOverHistoryCallURL = `${CRIC_LIVE_LINE_API_URL}/match/${matchId}/overHistory`;

    const [matchCommentaryResponse] = await Promise.all([
      axios.get(matchCommentaryCallURL, { headers: headers }),
    ]);

    console.log("commentary API calls completed");

    const combinedData = {
      matchCommentary: matchCommentaryResponse.data,
    };

    // console.log("commentary Data", matchCommentaryResponse?.data);
    // Cache the response
    cache.set(matchCommentaryCacheKey, combinedData);

    // Update API key usage count (2 API calls made)
    await updateApiKeyUsage(cricbuzzProviderKeyData.id, 2);

    res.json(combinedData);
  } catch (error) {
    console.error("Error fetching data from API from commentary route:", {
      message: error.message,
    });

    res.status(500).json({ error: "Unable to fetch commentary data" });
  }
});

router.get("/more-commentary/:matchId", async (req, res) => {
  const { matchId } = req.params;
  const { tms, iid } = req.query;
  console.log(tms, iid);

  if (!matchId) {
    return res.status(400).json({ error: "Match ID is required" });
  }

  const matchCommentaryCacheKey = `${tms}commentary`;

  // Check cache before making API calls
  const cachedMatchCommentary = cache.get(matchCommentaryCacheKey);
  if (cachedMatchCommentary) {
    console.log("Serving from cache");
    return res.json(cachedMatchCommentary);
  }

  try {
    // Fetch an available API key for "cricket_live_line"
    const cricbuzzProviderKeyData = await getAvailableApiKey(
      "cricbuzzProvider"
    );

    let headers = {
      "x-rapidapi-key": cricbuzzProviderKeyData.value,
      "x-rapidapi-host": "cricbuzz-cricket2.p.rapidapi.com",
    };

    if (!cricbuzzProviderKeyData) {
      console.warn("⚠️ No available API keys for news sources.");
      return res.status(429).json({
        error: "All API keys for news sources are exhausted. Try again later.",
      });
    }

    console.log("CricbuzzProvider:", cricbuzzProviderKeyData.api_key_id);

    let matchCommentaryCallURL = `${Cricbuzz_APIProvider_URL}/mcenter/v1/${matchId}/comm`;

    const [matchCommentaryResponse] = await Promise.all([
      axios.get(matchCommentaryCallURL, {
        headers: headers,
        params: { tms: tms, iid: iid },
      }),
    ]);

    console.log("more commentary API calls completed");

    const combinedData = {
      matchCommentary: matchCommentaryResponse.data,
    };

    // console.log("commentary Data", matchCommentaryResponse?.data);
    // Cache the response
    cache.set(matchCommentaryCacheKey, combinedData);

    // Update API key usage count (2 API calls made)
    await updateApiKeyUsage(cricbuzzProviderKeyData.id, 2);

    res.json(combinedData);
  } catch (error) {
    console.error("Error fetching data from API from more commentary route:", {
      message: error.message,
    });

    res.status(500).json({ error: "Unable to fetch morecommentary data" });
  }
});

router.get("/overHistory/:matchId", async (req, res) => {
  const { matchId } = req.params;

  if (!matchId) {
    return res.status(400).json({ error: "Match ID is required" });
  }

  const matchOverHistoryCacheKey = `${matchId}overHistory`;

  // Check cache before making API calls
  const cachedMatchCommentary = cache.get(matchOverHistoryCacheKey);
  if (cachedMatchCommentary) {
    console.log("Serving from cache");
    return res.json(cachedMatchCommentary);
  }

  try {
    // Fetch an available API key for "cricket_live_line"
    const cricbuzzProviderKeyData = await getAvailableApiKey(
      "cricbuzzProvider"
    );

    let headers = {
      "x-rapidapi-key": cricbuzzProviderKeyData.value,
      "x-rapidapi-host": "cricbuzz-cricket2.p.rapidapi.com",
    };

    if (!cricbuzzProviderKeyData) {
      console.warn("⚠️ No available API keys for news sources.");
      return res.status(429).json({
        error: "All API keys for news sources are exhausted. Try again later.",
      });
    }

    console.log("cricbuzzProvider:", cricbuzzProviderKeyData.api_key_id);

    const matchOverHistoryCallURL = `${Cricbuzz_APIProvider_URL}/mcenter/v1/${matchId}/overs`;

    const [matchOverHistoryResponse] = await Promise.all([
      axios.get(matchOverHistoryCallURL, { headers }),
    ]);

    console.log("Over History API calls completed");
    // console.log("over", matchOverHistoryResponse?.data);

    const combinedData = {
      matchOverHistory: matchOverHistoryResponse.data,
    };

    // Cache the response
    cache.set(matchOverHistoryCacheKey, combinedData);

    // Update API key usage count (2 API calls made)
    await updateApiKeyUsage(cricbuzzProviderKeyData.id, 2);

    res.json(combinedData);
  } catch (error) {
    console.error("Error fetching data from API from overHistory route:", {
      message: error.message,
    });

    res.status(500).json({ error: "Unable to fetch overHistory data" });
  }
});

router.get("/more-overHistory/:matchId", async (req, res) => {
  const { matchId } = req.params;
  const { tms, iid } = req.query;
  console.log(tms, iid);

  if (!matchId) {
    return res.status(400).json({ error: "Match ID is required" });
  }

  const matchOverHistoryCacheKey = `${tms}overHistory`;

  // Check cache before making API calls
  const cachedMatchCommentary = cache.get(matchOverHistoryCacheKey);
  if (cachedMatchCommentary) {
    console.log("Serving from cache");
    return res.json(cachedMatchCommentary);
  }

  try {
    // Fetch an available API key for "cricket_live_line"
    const cricbuzzProviderKeyData = await getAvailableApiKey(
      "cricbuzzProvider"
    );

    let headers = {
      "x-rapidapi-key": cricbuzzProviderKeyData.value,
      "x-rapidapi-host": "cricbuzz-cricket2.p.rapidapi.com",
    };

    if (!cricbuzzProviderKeyData) {
      console.warn("⚠️ No available API keys for news sources.");
      return res.status(429).json({
        error: "All API keys for news sources are exhausted. Try again later.",
      });
    }

    console.log("CricbuzzProvider:", cricbuzzProviderKeyData.api_key_id);

    let matchCommentaryCallURL = `${Cricbuzz_APIProvider_URL}/mcenter/v1/${matchId}/overs`;

    const [matchCommentaryResponse] = await Promise.all([
      axios.get(matchCommentaryCallURL, {
        headers: headers,
        params: { tms: tms, iid: iid },
      }),
    ]);

    console.log("more commentary API calls completed");

    const combinedData = {
      matchOverHistory: matchCommentaryResponse.data,
    };

    // console.log("commentary Data", matchCommentaryResponse?.data);
    // Cache the response
    cache.set(matchOverHistoryCacheKey, combinedData);

    // Update API key usage count (2 API calls made)
    await updateApiKeyUsage(cricbuzzProviderKeyData.id, 2);

    res.json(combinedData);
  } catch (error) {
    console.error("Error fetching data from API from more commentary route:", {
      message: error.message,
    });

    res.status(500).json({ error: "Unable to fetch morecommentary data" });
  }
});

router.get("/matchForms/:matchId", async (req, res) => {
  const matchId = req.params.matchId;
  const seriesId = req.query.seriesId;

  const matchFormsCacheKey = `${matchId}form`;

  // Check cache first
  const cachedMatchFormsData = cache.get(matchFormsCacheKey);
  if (cachedMatchFormsData) {
    console.log("Serving from cache");
    return res.json(cachedMatchFormsData);
  }

  try {
    const cricbuzzKeyData = await getAvailableApiKey("cricbuzz");
    if (!cricbuzzKeyData) {
      console.warn("⚠️ No available API key for Cricbuzz.");
      return res
        .status(429)
        .json({ error: "Cricbuzz API keys exhausted. Try again later." });
    }

    let cricbuzzHeaders = {
      "x-rapidapi-key": cricbuzzKeyData.value,
      "x-rapidapi-host": "cricbuzz-cricket.p.rapidapi.com",
    };

    console.log("Cricbuzz API Key:", cricbuzzKeyData.api_key_id);

    const seriesMatchesResponse = await axios.get(
      `${Cricbuzz_API_URL}/series/v1/${seriesId}`,
      { headers: cricbuzzHeaders }
    );

    const combinedData = {
      seriesMatches: seriesMatchesResponse?.data || null,
    };

    // Update Cricbuzz API key usage
    await updateApiKeyUsage(cricbuzzKeyData.id, 1);

    // Cache the response
    cache.set(matchFormsCacheKey, combinedData);

    res.json(combinedData);
  } catch (error) {
    console.error("❌ Error fetching data:", error.message);
    res.status(500).json({ error: "Unable to fetch data" });
  }
});

router.get("/news", async (req, res) => {
  const cachedNewsKey = "NewsKey";

  // Check if data is in cache
  const cachedNews = cache.get(cachedNewsKey);
  if (cachedNews) {
    console.log("Serving from cache");
    return res.json(cachedNews);
  }

  try {
    // Fetch available API keys for both APIs
    const unofficialCricbuzzKeyData = await getAvailableApiKey(
      "unofficial_cricbuzz"
    );
    const cricketLiveLineKeyData = await getAvailableApiKey(
      "cricket_live_line"
    );

    if (!unofficialCricbuzzKeyData || !cricketLiveLineKeyData) {
      console.warn("⚠️ No available API keys for news sources.");
      return res.status(429).json({
        error: "All API keys for news sources are exhausted. Try again later.",
      });
    }

    console.log("unofficial Cricbuzz:", unofficialCricbuzzKeyData.api_key_id);
    console.log("CricLiveLine:", cricketLiveLineKeyData.api_key_id);

    let unofficialCricbuzzHeaders = {
      "x-rapidapi-key": unofficialCricbuzzKeyData.value,
      "x-rapidapi-host": "unofficial-cricbuzz.p.rapidapi.com",
    };
    let cricLiveLineHeaders = {
      "x-rapidapi-key": cricketLiveLineKeyData.value,
      "x-rapidapi-host": "cricket-live-line1.p.rapidapi.com",
    };

    // Fetch News Data
    const [cricbuzzNewsResponse, cricLiveLineNewsResponse] = await Promise.all([
      axios.get(`${UnofficialCricbuzz_API_URL}/news/list`, {
        headers: unofficialCricbuzzHeaders,
      }),
      axios.get(`${CRIC_LIVE_LINE_API_URL}/news`, {
        headers: cricLiveLineHeaders,
      }),
    ]);

    const cricbuzzNewsList = cricbuzzNewsResponse?.data?.newsList || [];
    const cricLiveLineNewsList = cricLiveLineNewsResponse?.data?.data || [];

    // Filter out ads
    const filteredNews = cricbuzzNewsList.filter((item) => item.story);

    // Extract imageIds
    const newsWithImageIds = filteredNews
      .map((item) => item.story)
      .filter((story) => story && story.coverImage?.id);

    // Fetch images in parallel with delay
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const imagePromises = newsWithImageIds.map((story, index) =>
      delay(index * 300) // Delay each request by 300ms
        .then(() =>
          axios.get(`${UnofficialCricbuzz_API_URL}/get-image`, {
            headers: unofficialCricbuzzHeaders,
            params: { id: story.coverImage.id, p: "de" },
            responseType: "arraybuffer",
          })
        )
        .then((imgRes) => ({
          id: story.coverImage.id,
          url: convertImageToBase64(imgRes.data),
        }))
        .catch((error) => {
          console.error(
            `Error fetching image ${story.coverImage.id}:`,
            error.message
          );
          return { id: story.coverImage.id, url: null };
        })
    );

    const imageResults = await Promise.all(imagePromises);

    // Map images to news articles
    const cricbuzzFinalNewsData = newsWithImageIds.map((story) => {
      const imageUrl =
        imageResults?.find((img) => img.id === story.coverImage.id)?.url ||
        null;
      return {
        id: story.id,
        headline: story.hline,
        summary: story.intro,
        pubAgo: getTimeAgo(Number(story.pubTime)),
        pubTime: formatDateTime(Number(story.pubTime)),
        source: story.source,
        imageUrl: imageUrl,
      };
    });

    const cricLLFinalNewsData = cricLiveLineNewsList.map((story) => ({
      id: story.news_id,
      headline: story.title,
      summary: story.description,
      pubAgo: getTimeAgo(story.pub_date.replace("|", "").trim()),
      pubTime: story.pub_date,
      source: "Cricket Champion",
      imageUrl: story.image || null,
      content: he.decode(story.content[0]),
    }));

    const finalNewsData = [...cricbuzzFinalNewsData, ...cricLLFinalNewsData];
    const randomizedNewsData = shuffleArray(finalNewsData);

    // Cache the result
    cache.set(cachedNewsKey, randomizedNewsData);

    console.log("Serving from API and caching the data");
    res.json(randomizedNewsData);

    const unofficialCricbuzzCalls = 1 + imagePromises.length;

    // Update API key usage count (1 call per API)
    await updateApiKeyUsage(
      unofficialCricbuzzKeyData.id,
      unofficialCricbuzzCalls
    );
    await updateApiKeyUsage(cricketLiveLineKeyData.id, 1);
  } catch (error) {
    console.error(
      "Error fetching data from API from news route:",
      error.message
    );
    res.status(500).json({ error: "Unable to fetch news data" });
  }
});

router.get("/newsContent/:newsId", async (req, res) => {
  const storyId = req.params.newsId;
  const cachedNewsKey = `NewsContentKey${storyId}`;

  // Check if data is in cache
  const cachedNewsContent = cache.get(cachedNewsKey);
  if (cachedNewsContent) {
    console.log("Serving from cache");
    return res.json(cachedNewsContent);
  }

  try {
    // Fetch available API keys for both APIs
    const unofficialCricbuzzKeyData = await getAvailableApiKey(
      "unofficial_cricbuzz"
    );

    if (!unofficialCricbuzzKeyData) {
      console.warn("⚠️ No available API keys for news sources.");
      return res.status(429).json({
        error: "All API keys for news sources are exhausted. Try again later.",
      });
    }

    console.log("unofficial Cricbuzz:", unofficialCricbuzzKeyData.api_key_id);

    let unofficialCricbuzzHeaders = {
      "x-rapidapi-key": unofficialCricbuzzKeyData.value,
      "x-rapidapi-host": "unofficial-cricbuzz.p.rapidapi.com",
    };

    // Fetch News Data
    const [cricbuzzNewsResponse] = await Promise.all([
      axios.get(`${UnofficialCricbuzz_API_URL}/news/detail`, {
        headers: unofficialCricbuzzHeaders,
        params: { storyId: storyId },
      }),
    ]);

    // const cricbuzzNewsList = cricbuzzNewsResponse?.data?.newsList || [];

    // // Filter out ads
    // const filteredNews = cricbuzzNewsList.filter((item) => item.story);

    // // Extract imageIds
    // const newsWithImageIds = filteredNews
    //   .map((item) => item.story)
    //   .filter((story) => story && story.coverImage?.id);

    // // Fetch images in parallel with delay
    // const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    // const imagePromises = newsWithImageIds.map((story, index) =>
    //   delay(index * 300) // Delay each request by 300ms
    //     .then(() =>
    //       axios.get(`${UnofficialCricbuzz_API_URL}/get-image`, {
    //         headers: unofficialCricbuzzHeaders,
    //         params: { id: story.coverImage.id, p: "de" },
    //         responseType: "arraybuffer",
    //       })
    //     )
    //     .then((imgRes) => ({
    //       id: story.coverImage.id,
    //       url: convertImageToBase64(imgRes.data),
    //     }))
    //     .catch((error) => {
    //       console.error(
    //         `Error fetching image ${story.coverImage.id}:`,
    //         error.message
    //       );
    //       return { id: story.coverImage.id, url: null };
    //     })
    // );

    // const imageResults = await Promise.all(imagePromises);
    const data = cricbuzzNewsResponse?.data;

    // console.log(data.content);

    function escapeRegExp(string) {
      return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // Escape special regex characters
    }

    let updatedContentArray = []; // Store updated content separately

    // console.log(data);

    // Loop through each content entry in `data.content`
    data.content.forEach((block) => {
      console.log(block);
      if (block.content && block.content.contentType === "text") {
        let contentString = block.content.contentValue; // Get the text content

        // Apply formatting
        data?.format?.forEach((format) => {
          format.value.forEach((item) => {
            const regex = new RegExp(escapeRegExp(item.key), "g"); // Safe regex

            if (format.key === "bold") {
              contentString = contentString.replace(regex, `**${item.value}**`); // Bold
            } else if (format.key === "italic") {
              contentString = contentString.replace(regex, `*${item.value}*`); // Italic
            } else if (format.key === "links") {
              contentString = contentString.replace(regex, `${item.value}`); // Italic
            }
          });
        });

        // Push updated content into the array
        updatedContentArray.push({
          contentType: block.content.contentType,
          contentValue: contentString,
        });
      }
    });

    // console.log(updatedContentArray);

    // Map images to news articles
    const cricbuzzFinalNewsData = {
      id: cricbuzzNewsResponse?.data?.id,
      content: updatedContentArray,
      format: cricbuzzNewsResponse?.data?.format,
    };

    // Cache the result
    cache.set(cachedNewsKey, cricbuzzFinalNewsData);

    console.log("Serving from API and caching the data");
    res.json(cricbuzzFinalNewsData);

    // const unofficialCricbuzzCalls = 1 + imagePromises.length;

    // Update API key usage count (1 call per API)
    await updateApiKeyUsage(unofficialCricbuzzKeyData.id, 1);
  } catch (error) {
    console.error(
      "Error fetching data from API from news content route:",
      error.message
    );
    res.status(500).json({ error: "Unable to fetch news content data" });
  }
});

router.get("/series", async (req, res) => {
  const seriesId = req.query.seriesId;
  const seriesName = req.query.seriesName;

  let combinedData;

  // console.log(seriesId, seriesName, seriesType);

  let seriesCacheKey = seriesId;

  // Check cache before making API calls
  const cachedSeriesData = cache.get(seriesCacheKey);
  if (cachedSeriesData) {
    console.log("Serving from cache");
    return res.json(cachedSeriesData);
  }

  try {
    // Get API keys for both Cricket Live Line and Cricbuzz
    const cricbuzzKeyData = await getAvailableApiKey("cricbuzz");

    if (!cricbuzzKeyData) {
      console.warn("⚠️ No available API keys for news sources.");
      return res.status(429).json({
        error: "All API keys for news sources are exhausted. Try again later.",
      });
    }

    const cricbuzzHeaders = {
      "x-rapidapi-key": cricbuzzKeyData.value,
      "x-rapidapi-host": "cricbuzz-cricket.p.rapidapi.com",
    };

    console.log(" Cricbuzz:", cricbuzzKeyData.api_key_id);

    const cricbuzzSeriesCallURL = `${Cricbuzz_API_URL}/series/v1/${seriesId}`;

    const [cricbuzzSeriesResponse] = await Promise.all([
      axios.get(cricbuzzSeriesCallURL, { headers: cricbuzzHeaders }),
    ]);

    console.log("All API calls completed");

    // console.log(seriesId);

    let seriesPointsTableResponse = null;
    let imageResults = null;

    if (!seriesName.toLowerCase().includes("tour")) {
      const seriesPointsTableCallURL = `${Cricbuzz_API_URL}/stats/v1/series/${seriesId}/points-table`;

      [seriesPointsTableResponse] = await Promise.all([
        axios.get(seriesPointsTableCallURL, {
          headers: cricbuzzHeaders,
        }),
      ]);

      // console.log(seriesPointsTableResponse?.data?.pointsTable);

      const teamImageIds =
        seriesPointsTableResponse?.data?.pointsTable[0]?.pointsTableInfo?.map(
          (team) => {
            return {
              team: team.teamName,
              teamId: team.teamId,
              imageId: team.teamImageId,
            };
          }
        );

      imageResults = await checkAndStoreTeamImages(teamImageIds);
    }

    combinedData = {
      api: "cricbuzz",
      id: seriesId,
      data: cricbuzzSeriesResponse?.data,
      pointsTable: seriesPointsTableResponse
        ? seriesPointsTableResponse?.data?.pointsTable
        : null,
      teamImages: imageResults ?? null,
    };
    // Cache the response
    cache.set(seriesCacheKey, combinedData);

    // Update API key usage count
    await updateApiKeyUsage(cricbuzzKeyData.id, 2); // 2 request for cricbuzz

    res.json(combinedData);
  } catch (error) {
    console.error("Error fetching data from API from series route:", {
      message: error.message,
    });

    res.status(500).json({ error: "Unable to fetch series data" });
  }
});

router.get("/series/stats", async (req, res) => {
  const seriesId = req.query.seriesId;
  const seriesName = req.query.seriesName;
  console.log("seriesID:", seriesId);
  let combinedData;

  // console.log(seriesId, seriesName, seriesType);

  if (!seriesName && !seriesType) {
    return res.status(400).json({ error: "Series Data is required" });
  }

  let seriesCacheKey = `${seriesName}stats`;

  // Check cache before making API calls
  const cachedSeriesData = cache.get(seriesCacheKey);
  if (cachedSeriesData) {
    console.log("Serving from cache");
    return res.json(cachedSeriesData);
  }

  try {
    // Get API keys for both Cricket Live Line and Cricbuzz
    const cricbuzzKeyData = await getAvailableApiKey("cricbuzz");

    if (!cricbuzzKeyData) {
      console.warn("⚠️ No available API keys for stats sources.");
      return res.status(429).json({
        error: "All API keys for news sources are exhausted. Try again later.",
      });
    }

    const cricbuzzHeaders = {
      "x-rapidapi-key": cricbuzzKeyData.value,
      "x-rapidapi-host": "cricbuzz-cricket.p.rapidapi.com",
    };

    console.log(" Cricbuzz:", cricbuzzKeyData.api_key_id);

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const statsTypes = [
      {
        category: "Batting",
        value: "mostRuns",
        header: "Most Runs",
      },
      {
        category: "Batting",
        value: "highestScore",
        header: "Highest Scores",
      },
      // {
      //   category: "Batting",
      //   value: "highestAvg",
      //   header: "Best Batting Average",
      // },
      // {
      //   category: "Batting",
      //   value: "highestSr",
      //   header: "Best Batting Strike Rate",
      // },
      // {
      //   category: "Batting",
      //   value: "mostHundreds",
      //   header: "Most Hundreds",
      // },
      // {
      //   category: "Batting",
      //   value: "mostFifties",
      //   header: "Most Fifties",
      // },
      // {
      //   category: "Batting",
      //   value: "mostFours",
      //   header: "Most Fours",
      // },
      // {
      //   category: "Batting",
      //   value: "mostSixes",
      //   header: "Most Sixes",
      // },
      // {
      //   category: "Batting",
      //   value: "mostNineties",
      //   header: "Most Nineties",
      // },
      // {
      //   category: "Bowling",
      //   value: "mostWickets",
      //   header: "Most Wickets",
      // },
      // {
      //   category: "Bowling",
      //   value: "lowestAvg",
      //   header: "Best Bowling Average",
      // },
      // {
      //   category: "Bowling",
      //   value: "bestBowlingInnings",
      //   header: "Best Bowling",
      // },
      // {
      //   category: "Bowling",
      //   value: "mostFiveWickets",
      //   header: "Most 5 Wickets Haul",
      // },
      // {
      //   category: "Bowling",
      //   value: "lowestEcon",
      //   header: "Best Economy",
      // },
      // {
      //   category: "Bowling",
      //   value: "lowestSr",
      //   header: "Best Bowling Strike Rate",
      // },
    ];
    console.log("seriesId", seriesId);
    const seriesStatsCallURL = `${Cricbuzz_API_URL}/stats/v1/series/${seriesId}`;

    const statsPromises = statsTypes.map((type, index) =>
      delay(index * 300) // Delay each request by 300ms
        .then(() =>
          axios.get(seriesStatsCallURL, {
            headers: cricbuzzHeaders,
            params: { statsType: type.value },
          })
        )
        .then((statsRes) => ({
          statsType: type.value,
          header: type.header,
          data: statsRes.data,
        }))
        .catch((error) => {
          console.error(`Error fetching image ${type.header}:`, error.message);
          return { statsType: type.value, header: type.header, data: null };
        })
    );
    // console.log(statsPromises);

    const statsResults = await Promise.all(statsPromises);
    console.log(statsResults);

    async function processStatsSequentially(statsResults, seriesId) {
      const results = [];
      for (const stat of statsResults) {
        try {
          const data = await processStatsData(stat, seriesId);
          results.push(data);
          await delay(200); // 1-second delay to avoid hitting API limits
        } catch (error) {
          console.error("Error processing stat:", error);
        }
      }
      return results;
    }

    // Usage:
    const statsData = await processStatsSequentially(statsResults, seriesId);

    console.log("All Stats API calls completed");

    console.log("statsData", statsData);
    // console.log("statsData", statsData[1].highestScore.t20StatsList.headers);
    // console.log("statsData", statsData[2].mostFifties.t20StatsList.headers);

    combinedData = {
      api: "cricbuzz",
      statsData: statsData,
    };
    // Cache the response
    cache.set(seriesCacheKey, combinedData);

    // Update API key usage count

    await updateApiKeyUsage(cricbuzzKeyData.id, statsPromises.length); // 2 request for cricbuzz

    res.json(combinedData);
  } catch (error) {
    console.error("Error fetching data from API from stats series route:", {
      message: error.message,
    });

    res.status(500).json({ error: "Unable to fetch stats series data" });
  }
});

// Add other cricket routes (commentary, overHistory, series, etc.) similarly...

export { router, setDependencies };
