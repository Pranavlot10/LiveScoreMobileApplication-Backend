import express from "express";
import axios from "axios";

const router = express.Router();

let cache,
  pool,
  NEWS_URL,
  BASKETAPI_URL,
  updateApiKeyUsage,
  getAvailableApiKey,
  fetchBasketTeamLogo,
  fetchBasketLeagueLogo;

function setDependencies(deps) {
  ({
    cache,
    pool,
    NEWS_URL,
    BASKETAPI_URL,
    updateApiKeyUsage,
    getAvailableApiKey,
    fetchBasketTeamLogo,
    fetchBasketLeagueLogo,
  } = deps);
}

// Today's matches
router.get("/todays-matches", async (req, res) => {
  const { date, month, year } = req.query;
  console.log(date, month, year);

  try {
    const cachedMatchesKey = `${date}/${month}/${year}basketballMatchesKey`;
    const cachedMatches = cache.get(cachedMatchesKey);
    if (cachedMatches) {
      console.log("Serving from cache");
      return res.json(cachedMatches);
    }

    const basketApiKeyData = await getAvailableApiKey("basketApi");
    console.log(`Using API Key: ${basketApiKeyData.api_key_id}`);

    let headers = {
      "x-rapidapi-key": basketApiKeyData.value,
      "x-rapidapi-host": "basketapi1.p.rapidapi.com",
    };

    const matchesResponse = await axios.get(
      `${BASKETAPI_URL}/api/basketball/matches/${date}/${month}/${year}`,
      { headers }
    );

    console.log("API call completed");
    const matchesData = matchesResponse?.data.events || [];

    const missingTeams = new Set();
    const missingLeagues = new Set();

    for (const match of matchesData) {
      for (const teamKey of ["homeTeam", "awayTeam"]) {
        const team = match[teamKey];
        if (team && team.id) {
          const teamLogo = await fetchBasketTeamLogo(team.id, team.name);
          if (teamLogo) team.logo = teamLogo;
          else missingTeams.add(team.name);
        }
      }

      if (
        match.tournament.uniqueTournament &&
        match.tournament.uniqueTournament.id
      ) {
        const { id, name } = match.tournament.uniqueTournament;
        const country = match.tournament.uniqueTournament.category.name;
        const leagueLogo = await fetchBasketLeagueLogo(id, name, country);
        if (leagueLogo) match.tournament.uniqueTournament.logo = leagueLogo;
        else missingLeagues.add(`${name} (${country})`);
      }
    }

    cache.set(cachedMatchesKey, matchesData);
    console.log("Serving from API and caching the data");
    res.json(matchesData);

    await updateApiKeyUsage(basketApiKeyData.id, 1);
  } catch (error) {
    console.error(
      "Error fetching data from API from basketball matches route:",
      error.message
    );
    res.status(500).json({ error: "Unable to fetch basketball match data" });
  }
});

router.get("/details/:matchId", async (req, res) => {
  const matchId = req.params.matchId;
  console.log("matchId", matchId);

  try {
    const cachedMatchKey = `${matchId}MatchKey`;

    // Check if data is in cache
    const cachedMatches = cache.get(cachedMatchKey);
    if (cachedMatches) {
      console.log("Serving from cache");
      return res.json(cachedMatches);
    }

    // Fetch an available API key
    const basketApiKeyData = await getAvailableApiKey("basketApi");
    console.log(`Using API Key: ${basketApiKeyData.api_key_id}`);

    let headers = {
      "x-rapidapi-key": basketApiKeyData.value,
      "x-rapidapi-host": "basketapi1.p.rapidapi.com",
    };

    // Fetch data from API
    const [incidentsResponse, lineupsResponse, matchInfoDataResponse] =
      await Promise.all([
        axios.get(
          `${BASKETAPI_URL}/api/basketball/match/${matchId}/incidents`,
          {
            headers,
          }
        ),
        axios.get(`${BASKETAPI_URL}/api/basketball/match/${matchId}/lineups`, {
          headers,
        }),
        axios.get(`${BASKETAPI_URL}/api/basketball/match/${matchId}`, {
          headers,
        }),
      ]);

    console.log("API call completed");
    const matchesData = {
      lineupsData: lineupsResponse?.data || {},
      incidentsData: incidentsResponse.data || {},
      matchInfoData: matchInfoDataResponse.data || {},
    };

    // Cache and send response
    cache.set(cachedMatchKey, matchesData);
    console.log("Serving from API and caching the data");
    res.json(matchesData);

    // Update API key usage count
    await updateApiKeyUsage(basketApiKeyData.id, 3);
  } catch (error) {
    console.error(
      "Error fetching data from API from details route:",
      error.message
    );
    res.status(500).json({ error: "Unable to fetch match data" });
  }
});

router.get("/statistics/:matchId", async (req, res) => {
  const matchId = req.params.matchId;
  console.log(matchId);

  try {
    const cachedMatchKey = `${matchId}stats`;

    // Check if data is in cache
    const cachedMatches = cache.get(cachedMatchKey);
    if (cachedMatches) {
      console.log("Serving from cache");
      return res.json(cachedMatches);
    }

    // Fetch an available API key
    const basketApiKeyData = await getAvailableApiKey("basketApi");
    console.log(`Using API Key: ${basketApiKeyData.api_key_id}`);

    let headers = {
      "x-rapidapi-key": basketApiKeyData.value,
      "x-rapidapi-host": "basketapi1.p.rapidapi.com",
    };

    // Fetch data from API
    const [statsResponse] = await Promise.all([
      axios.get(`${BASKETAPI_URL}/api/basketball/match/${matchId}/statistics`, {
        headers,
      }),
    ]);

    console.log("API call completed");
    const matchesData = {
      statsData: statsResponse?.data || {},
    };

    // Cache and send response
    cache.set(cachedMatchKey, matchesData);
    console.log("Serving from API and caching the data");
    res.json(matchesData);

    // Update API key usage count
    await updateApiKeyUsage(basketApiKeyData.id, 1);
  } catch (error) {
    console.error(
      "Error fetching data from API from basketball match stats route:",
      error.message
    );
    res
      .status(500)
      .json({ error: "Unable to fetch basketball team stats data" });
  }
});

router.get("/h2h/:matchId", async (req, res) => {
  const matchId = req.params.matchId;
  // console.log(matchId);

  try {
    const cachedMatchKey = `${matchId}h2h`;

    // Check if data is in cache
    const cachedMatches = cache.get(cachedMatchKey);
    if (cachedMatches) {
      console.log("Serving from cache");
      return res.json(cachedMatches);
    }

    // Fetch an available API key
    const basketApiKeyData = await getAvailableApiKey("basketApi");
    console.log(`Using API Key: ${basketApiKeyData.api_key_id}`);

    let headers = {
      "x-rapidapi-key": basketApiKeyData.value,
      "x-rapidapi-host": "basketapi1.p.rapidapi.com",
    };

    // Fetch data from API
    const [h2hResponse] = await Promise.all([
      axios.get(`${BASKETAPI_URL}/api/basketball/match/${matchId}/h2h`, {
        headers,
      }),
    ]);

    console.log("API call completed");

    const matchesData = h2hResponse?.data.events || [];

    for (const match of matchesData) {
      // console.log("match", match, typeof match);
      if (
        match.tournament.uniqueTournament &&
        match.tournament.uniqueTournament.id
      ) {
        const { id, name } = match.tournament.uniqueTournament;
        const country = match.tournament.uniqueTournament.category.name;
        // console.log(id, name, country);

        const leagueLogo = await fetchBasketLeagueLogo(id, name, country);
        if (leagueLogo) {
          match.tournament.uniqueTournament.logo = leagueLogo;
        } else {
          console.log(name);
        }
      }
    }

    // Cache and send response
    cache.set(cachedMatchKey, matchesData);
    // console.log(matchesData);
    console.log("Serving from API and caching the data");
    res.json(matchesData);

    // Update API key usage count
    await updateApiKeyUsage(basketApiKeyData.id, 1);
  } catch (error) {
    console.error(
      "Error fetching data from API from basketball team h2h route:",
      error.message
    );
    res.status(500).json({ error: "Unable to fetch basketball team h2h data" });
  }
});

router.get("/table/:leagueId/:seasonId", async (req, res) => {
  const { leagueId, seasonId } = req.params;
  // console.log(matchId);

  try {
    const cachedTableKey = `${leagueId}/${seasonId}table`;

    // Check if data is in cache
    const cachedMatches = cache.get(cachedTableKey);
    if (cachedMatches) {
      console.log("Serving from cache");
      return res.json(cachedMatches);
    }

    // Fetch an available API key
    const basketApiKeyData = await getAvailableApiKey("basketApi");
    console.log(`Using API Key: ${basketApiKeyData.api_key_id}`);

    let headers = {
      "x-rapidapi-key": basketApiKeyData.value,
      "x-rapidapi-host": "basketapi1.p.rapidapi.com",
    };

    // Fetch data from API
    const [tableResponse] = await Promise.all([
      axios.get(
        `${BASKETAPI_URL}/api/basketball/tournament/${leagueId}/season/${seasonId}/standings/total`,
        { headers }
      ),
    ]);

    console.log("API call completed");

    const tableData = tableResponse?.data.standings || [];

    if (tableData.length > 0) {
      for (const team of tableData[0].rows) {
        // console.log("match", match, typeof match);
        const teamId = team.team.id;
        const teamName = team.team.name;
        if (teamName && teamId) {
          const teamLogo = await fetchBasketTeamLogo(teamId, teamName);

          if (teamLogo) {
            team.team.logo = teamLogo;
          } else {
            console.log(teamName);
          }
        }
      }
    }

    // Cache and send response
    cache.set(cachedTableKey, tableData);
    console.log("Serving from API and caching the data");
    res.json(tableData);

    // Update API key usage count
    await updateApiKeyUsage(basketApiKeyData.id, 1);
  } catch (error) {
    console.error(
      "Error fetching data from API from details route:",
      error.message
    );
    res.status(500).json({ error: "Unable to fetch basketball table data" });
  }
});

router.get("/league/fixtures/:leagueId/:seasonId", async (req, res) => {
  const { leagueId, seasonId } = req.params;
  const { page } = req.query;
  // console.log(matchId);

  try {
    const cachedMatchKey = `${leagueId}/${seasonId}fixtures`;

    // Check if data is in cache
    const cachedMatches = cache.get(cachedMatchKey);
    if (cachedMatches) {
      console.log("Serving from cache");
      return res.json(cachedMatches);
    }

    // Fetch an available API key
    const basketApiKeyData = await getAvailableApiKey("basketApi");
    console.log(`Using API Key: ${basketApiKeyData.api_key_id}`);

    let headers = {
      "x-rapidapi-key": basketApiKeyData.value,
      "x-rapidapi-host": "basketapi1.p.rapidapi.com",
    };

    // Fetch data from API
    const [fixturesResponse] = await Promise.all([
      axios.get(
        `${BASKETAPI_URL}/api/tournament/${leagueId}/season/${seasonId}/matches/next/${page}`,
        { headers }
      ),
    ]);

    console.log("API call completed");

    const matchesData = fixturesResponse?.data.events || [];

    for (const match of matchesData) {
      for (const teamKey of ["homeTeam", "awayTeam"]) {
        const team = match[teamKey];

        if (team && team.id) {
          const teamLogo = await fetchBasketTeamLogo(team.id, team.name);

          if (teamLogo) {
            team.logo = teamLogo;
          } else {
            console.log(team.name);
          }
        }
      }
    }

    // Cache and send response
    cache.set(cachedMatchKey, matchesData);
    console.log("Serving from API and caching the data");
    res.json(matchesData);

    // Update API key usage count
    await updateApiKeyUsage(basketApiKeyData.id, 1);
  } catch (error) {
    console.error(
      "Error fetching data from API from league fixtures route:",
      error.message
    );
    res
      .status(500)
      .json({ error: "Unable to fetch football league fixtures data" });
  }
});

router.get("/league/results/:leagueId/:seasonId", async (req, res) => {
  const { leagueId, seasonId } = req.params;
  const { page } = req.query;
  // console.log(matchId);

  try {
    const cachedMatchKey = `${leagueId}/${seasonId}results`;

    // Check if data is in cache
    const cachedMatches = cache.get(cachedMatchKey);
    if (cachedMatches) {
      console.log("Serving from cache");
      return res.json(cachedMatches);
    }

    // Fetch an available API key
    const basketApiKeyData = await getAvailableApiKey("basketApi");
    console.log(`Using API Key: ${basketApiKeyData.api_key_id}`);

    let headers = {
      "x-rapidapi-key": basketApiKeyData.value,
      "x-rapidapi-host": "basketapi1.p.rapidapi.com",
    };

    // Fetch data from API
    const [resultsResponse] = await Promise.all([
      axios.get(
        `${BASKETAPI_URL}/api/tournament/${leagueId}/season/${seasonId}/matches/last/${page}`,
        { headers }
      ),
    ]);

    console.log("API call completed");

    const matchesData = resultsResponse?.data.events || [];

    for (const match of matchesData) {
      for (const teamKey of ["homeTeam", "awayTeam"]) {
        const team = match[teamKey];

        if (team && team.id) {
          const teamLogo = await fetchBasketTeamLogo(team.id, team.name);

          if (teamLogo) {
            team.logo = teamLogo;
          } else {
            console.log(team.name);
          }
        }
      }
    }

    // Cache and send response
    cache.set(cachedMatchKey, matchesData);
    console.log("Serving from API and caching the data");
    res.json(matchesData);

    // Update API key usage count
    await updateApiKeyUsage(basketApiKeyData.id, 1);
  } catch (error) {
    console.error(
      "Error fetching data from API from league results route:",
      error.message
    );
    res
      .status(500)
      .json({ error: "Unable to fetch football league results data" });
  }
});

router.get("/team/fixtures/:teamId", async (req, res) => {
  const { teamId } = req.params;
  const { page } = req.query;
  // console.log(matchId);

  try {
    const cachedMatchKey = `${teamId}fixtures`;

    // Check if data is in cache
    const cachedMatches = cache.get(cachedMatchKey);
    if (cachedMatches) {
      console.log("Serving from cache");
      return res.json(cachedMatches);
    }

    // Fetch an available API key
    const basketApiKeyData = await getAvailableApiKey("basketApi");
    console.log(`Using API Key: ${basketApiKeyData.api_key_id}`);

    let headers = {
      "x-rapidapi-key": basketApiKeyData.value,
      "x-rapidapi-host": "basketapi1.p.rapidapi.com",
    };

    // Fetch data from API
    const [fixturesResponse] = await Promise.all([
      axios.get(
        `${BASKETAPI_URL}/api/basketball/team/${teamId}/matches/next/${page}`,
        {
          headers,
        }
      ),
    ]);

    console.log("API call completed");

    const matchesData = fixturesResponse?.data.events || [];

    for (const match of matchesData) {
      for (const teamKey of ["homeTeam", "awayTeam"]) {
        const team = match[teamKey];

        if (team && team.id) {
          const teamLogo = await fetchBasketTeamLogo(team.id, team.name);

          if (teamLogo) {
            team.logo = teamLogo;
          } else {
            console.log(team.name);
          }
        }
      }
    }

    // Cache and send response
    cache.set(cachedMatchKey, matchesData);
    console.log("Serving from API and caching the data");
    res.json(matchesData);

    // Update API key usage count
    await updateApiKeyUsage(basketApiKeyData.id, 1);
  } catch (error) {
    console.error(
      "Error fetching data from API from team fixtures route:",
      error.message
    );
    res
      .status(500)
      .json({ error: "Unable to fetch football team fixtures data" });
  }
});

router.get("/team/results/:teamId", async (req, res) => {
  const { teamId } = req.params;
  const { page } = req.query;

  // console.log(matchId);

  try {
    const cachedMatchKey = `${teamId}results`;

    // Check if data is in cache
    const cachedMatches = cache.get(cachedMatchKey);
    if (cachedMatches) {
      console.log("Serving from cache");
      return res.json(cachedMatches);
    }

    // Fetch an available API key
    const basketApiKeyData = await getAvailableApiKey("basketApi");
    console.log(`Using API Key: ${basketApiKeyData.api_key_id}`);

    let headers = {
      "x-rapidapi-key": basketApiKeyData.value,
      "x-rapidapi-host": "basketapi1.p.rapidapi.com",
    };

    // Fetch data from API
    const [resultsResponse] = await Promise.all([
      axios.get(
        `${BASKETAPI_URL}/api/basketball/team/${teamId}/matches/previous/${page}`,
        {
          headers,
        }
      ),
    ]);

    console.log("API call completed");

    const matchesData = resultsResponse?.data.events || [];

    for (const match of matchesData) {
      for (const teamKey of ["homeTeam", "awayTeam"]) {
        const team = match[teamKey];

        if (team && team.id) {
          const teamLogo = await fetchBasketTeamLogo(team.id, team.name);

          if (teamLogo) {
            team.logo = teamLogo;
          } else {
            console.log(team.name);
          }
        }
      }
    }

    // Cache and send response
    cache.set(cachedMatchKey, matchesData);
    console.log("Serving from API and caching the data");
    res.json(matchesData);

    // Update API key usage count
    await updateApiKeyUsage(basketApiKeyData.id, 1);
  } catch (error) {
    console.error(
      "Error fetching data from API from league results route:",
      error.message
    );
    res
      .status(500)
      .json({ error: "Unable to fetch football league results data" });
  }
});

router.get("/league/teamStats/:leagueId/:seasonId", async (req, res) => {
  const { leagueId, seasonId } = req.params;
  const { page } = req.query;
  // console.log(matchId);

  try {
    const cachedMatchKey = `${leagueId}/${seasonId}best-teams`;

    // Check if data is in cache
    const cachedMatches = cache.get(cachedMatchKey);
    if (cachedMatches) {
      console.log("Serving from cache");
      return res.json(cachedMatches);
    }

    // Fetch an available API key
    const basketApiKeyData = await getAvailableApiKey("basketApi");
    console.log(`Using API Key: ${basketApiKeyData.api_key_id}`);

    let headers = {
      "x-rapidapi-key": basketApiKeyData.value,
      "x-rapidapi-host": "basketapi1.p.rapidapi.com",
    };

    // Fetch data from API
    const [resultsResponse] = await Promise.all([
      axios.get(
        `${BASKETAPI_URL}/api/basketball/tournament/${leagueId}/season/${seasonId}/best-teams/overall`,
        { headers }
      ),
    ]);

    console.log("API call completed");

    const statsType = [
      "points",
      "pointsAgainst",
      "fieldGoalsPercentage",
      "freeThrowsPercentage",
      "threePointsPercentage",
      "turnovers",
      "blocks",
      "steals",
      "rebounds",
    ];

    console.key(resultsResponse.data.topTeams);

    const teamStatsData =
      statsType.map((stat) => {
        return { [stat]: resultsResponse?.data.topTeams[stat] };
      }) || [];

    // console.log("check");
    // console.log("teamStatsData", teamStatsData);

    for (const type of teamStatsData) {
      // console.log("type", type);
      const statTypeKey = Object.keys(type)[0]; // Extract key name
      // console.log("stattype", statTypeKey);

      for (const stat of type[statTypeKey]) {
        const team = stat.team;

        if (team && team.id) {
          const teamLogo = await fetchBasketTeamLogo(team.id, team.name);

          if (teamLogo) {
            team.logo = teamLogo;
          } else {
            console.log(team.name);
          }
        }
      }
    }

    // Cache and send response
    cache.set(cachedMatchKey, teamStatsData);
    console.log("Serving from API and caching the data");
    res.json(teamStatsData);

    // Update API key usage count
    await updateApiKeyUsage(basketApiKeyData.id, 1);
  } catch (error) {
    console.error(
      "Error fetching data from API from league teamStats route:",
      error.message
    );
    res
      .status(500)
      .json({ error: "Unable to fetch football league teamStats data" });
  }
});

router.get("/league/playerStats/:leagueId/:seasonId", async (req, res) => {
  const { leagueId, seasonId } = req.params;
  const { page } = req.query;
  // console.log(matchId);

  try {
    const cachedMatchKey = `${leagueId}/${seasonId}playerStats`;

    // Check if data is in cache
    const cachedMatches = cache.get(cachedMatchKey);
    if (cachedMatches) {
      console.log("Serving from cache");
      return res.json(cachedMatches);
    }

    // Fetch an available API key
    const basketApiKeyData = await getAvailableApiKey("basketApi");
    console.log(`Using API Key: ${basketApiKeyData.api_key_id}`);

    let headers = {
      "x-rapidapi-key": basketApiKeyData.value,
      "x-rapidapi-host": "basketapi1.p.rapidapi.com",
    };

    // Fetch data from API
    const [resultsResponse] = await Promise.all([
      axios.get(
        `${BASKETAPI_URL}/api/basketball/tournament/${leagueId}/season/${seasonId}/best-players/overall`,
        { headers }
      ),
    ]);

    console.log("API call completed");

    const statsType = [
      "points",
      "assists",
      "fieldGoalsPercentage",
      "freeThrowsPercentage",
      "threePointsPercentage",
      "turnovers",
      "blocks",
      "steals",
      "rebounds",
      "doubleDoubles",
    ];

    const playerStatsData =
      statsType.map((stat) => {
        return { [stat]: resultsResponse?.data.topPlayers[stat] };
      }) || [];

    for (const type of playerStatsData) {
      // console.log(type);
      const statTypeKey = Object.keys(type)[0]; // Extract key name

      for (const player of type[statTypeKey]) {
        const team = player.team;

        if (team && team.id) {
          const teamLogo = await fetchBasketTeamLogo(team.id, team.name);
          if (teamLogo) {
            team.logo = teamLogo;
          } else {
            console.log(team.name);
          }
          // console.log(team.logo);
        }
      }
    }

    // Cache and send response
    cache.set(cachedMatchKey, playerStatsData);
    console.log("Serving from API and caching the data");
    res.json(playerStatsData);

    // Update API key usage count
    await updateApiKeyUsage(basketApiKeyData.id, 1);
  } catch (error) {
    console.error(
      "Error fetching data from API from basket league playerStats route:",
      error.message
    );
    res
      .status(500)
      .json({ error: "Unable to fetch football league playerStats data" });
  }
});

router.get(
  "/team/playerStats/:teamId/:leagueId/:seasonId",
  async (req, res) => {
    const { teamId, leagueId, seasonId } = req.params;
    const { page } = req.query;
    // console.log(matchId);

    try {
      const cachedMatchKey = `${teamId}/${leagueId}/${seasonId}playerStats`;

      // Check if data is in cache
      const cachedMatches = cache.get(cachedMatchKey);
      if (cachedMatches) {
        console.log("Serving from cache");
        return res.json(cachedMatches);
      }

      // Fetch an available API key
      const basketApiKeyData = await getAvailableApiKey("basketApi");
      console.log(`Using API Key: ${basketApiKeyData.api_key_id}`);

      let headers = {
        "x-rapidapi-key": basketApiKeyData.value,
        "x-rapidapi-host": "basketapi1.p.rapidapi.com",
      };

      // Fetch data from API
      const [resultsResponse] = await Promise.all([
        axios.get(
          `${BASKETAPI_URL}/api/basketball/team/${teamId}/tournament/${leagueId}/season/${seasonId}/best-players/regularseason`,
          { headers }
        ),
      ]);

      console.log("API call completed");

      const statsType = [
        "points",
        "assists",
        "fieldGoalsPercentage",
        "freeThrowsPercentage",
        "threePointsPercentage",
        "turnovers",
        "blocks",
        "steals",
        "rebounds",
        "doubleDoubles",
      ];

      const playerStatsData =
        statsType.map((stat) => {
          return { [stat]: resultsResponse?.data.topPlayers[stat] };
        }) || [];

      for (const type of playerStatsData) {
        // console.log(type);
        const statTypeKey = Object.keys(type)[0]; // Extract key name

        for (const player of type[statTypeKey]) {
          const team = player.team;

          if (team && team.id) {
            const teamLogo = await fetchBasketTeamLogo(team.id, team.name);
            if (teamLogo) {
              team.logo = teamLogo;
            } else {
              console.log(team.name);
            }
            // console.log(team.logo);
          }
        }
      }

      // Cache and send response
      cache.set(cachedMatchKey, playerStatsData);
      console.log("Serving from API and caching the data");
      res.json(playerStatsData);

      // Update API key usage count
      await updateApiKeyUsage(basketApiKeyData.id, 1);
    } catch (error) {
      console.error(
        "Error fetching data from API from basket team playerStats route:",
        error.message
      );
      res
        .status(500)
        .json({ error: "Unable to fetch football team playerStats data" });
    }
  }
);

router.get("/team/squad/:teamId", async (req, res) => {
  const { teamId } = req.params;
  const { page } = req.query;
  // console.log(matchId);

  try {
    const cachedMatchKey = `${teamId}playerStats`;

    // Check if data is in cache
    const cachedMatches = cache.get(cachedMatchKey);
    if (cachedMatches) {
      console.log("Serving from cache");
      return res.json(cachedMatches);
    }

    // Fetch an available API key
    const basketApiKeyData = await getAvailableApiKey("basketApi");
    console.log(`Using API Key: ${basketApiKeyData.api_key_id}`);

    let headers = {
      "x-rapidapi-key": basketApiKeyData.value,
      "x-rapidapi-host": "basketapi1.p.rapidapi.com",
    };

    // Fetch data from API
    const [resultsResponse] = await Promise.all([
      axios.get(`${BASKETAPI_URL}/api/basketball/team/${teamId}/players`, {
        headers,
      }),
    ]);

    console.log("API call completed");

    console.log(resultsResponse.data.players);

    const centers = [];
    const guards = [];
    const forwards = [];

    resultsResponse?.data?.players?.map((player) => {
      if (player.player.position === "F") {
        forwards.push(player.player);
      }
      if (
        player.player.position === "G" ||
        player.player.position === "FG" ||
        player.player.position === "GF"
      ) {
        guards.push(player.player);
      }

      if (player.player.position === "CF" || player.player.position === "C") {
        centers.push(player.player);
      }
    });
    const playersData = {
      centers: centers,
      guards: guards,
      forwards: forwards,
    };

    // Cache and send response
    cache.set(cachedMatchKey, playersData);
    console.log("Serving from API and caching the data");
    res.json(playersData);

    // Update API key usage count
    await updateApiKeyUsage(basketApiKeyData.id, 1);
  } catch (error) {
    console.error(
      "Error fetching data from API from team squads route:",
      error.message
    );
    res.status(500).json({ error: "Unable to fetch basket team squads data" });
  }
});

// API Endpoint to fetch news
router.get("/news", async (req, res) => {
  // console.log(matchId);

  try {
    const cachedMatchKey = `basketballNews`;

    // Check if data is in cache
    const cachedMatches = cache.get(cachedMatchKey);
    if (cachedMatches) {
      console.log("Serving from cache");
      return res.json(cachedMatches);
    }

    // Fetch an available API key
    const googleNewsData = await getAvailableApiKey("google_news");
    console.log(`Using API Key: ${googleNewsData.api_key_id}`);
    // console.log(googleNewsData.api_name);

    let headers = {
      "x-rapidapi-key": googleNewsData.value,
      "x-rapidapi-host": "google-news22.p.rapidapi.com",
    };

    let params = {
      q: "basketball",
      country: "in",
      language: "en",
    };

    // Fetch data from API
    const [newsResponse] = await Promise.all([
      axios.get(`${NEWS_URL}/v1/search`, { headers, params: params }),
    ]);

    console.log("API call completed");

    const matchesData = newsResponse?.data?.data || [];

    // Cache and send response
    cache.set(cachedMatchKey, matchesData);
    console.log("Serving from API and caching the data");
    res.json(matchesData);

    // Update API key usage count
    await updateApiKeyUsage(googleNewsData.id, 1);
  } catch (error) {
    console.error(
      "Error fetching data from API from basketball news route:",
      error.message
    );
    res.status(500).json({ error: "Unable to fetch basketball news data" });
  }
});

export { router, setDependencies };
