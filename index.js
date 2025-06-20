import express from "express";
import fs from "fs";
import NodeCache from "node-cache";
import axios from "axios";
import schedule from "node-schedule";
import pool from "./db.js"; // Ensure file extension is added
import he from "he";
import moment from "moment-timezone";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import leven from "leven";
import Parser from "rss-parser";
import puppeteer from "puppeteer";
import { franc } from "franc-min";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

import {
  router as cricketRouter,
  setDependencies as setCricketDeps,
} from "./routes/cricket.js";
import {
  router as footballRouter,
  setDependencies as setFootballDeps,
} from "./routes/football.js";
import {
  router as basketballRouter,
  setDependencies as setBasketballDeps,
} from "./routes/basketball.js";

const app = express();
app.use(express.json());

// Register routes

// Function to fetch API keys from PostgreSQL
async function getAvailableApiKey(apiName) {
  const now = new Date();
  const result = await pool.query(
    `
      SELECT aku.id, aku.api_key_id, ak.value, aku.accessed_count, aku.limit_count, aku.reset_time 
      FROM api_key_usage aku 
      JOIN api_keys ak ON aku.api_key_id = ak.id 
      WHERE aku.api_name = $1 
      ORDER BY aku.accessed_count ASC
  `,
    [apiName]
  );

  for (let row of result.rows) {
    const resetTime = new Date(row.reset_time);

    if (row.accessed_count < row.limit_count) {
      return row;
    } else if (now >= resetTime) {
      await pool.query(
        `UPDATE api_key_usage SET accessed_count = 0 WHERE id = $1`,
        [row.id]
      );
      return { ...row, accessed_count: 0 };
    }
  }

  throw new Error(
    `API limit reached for ${apiName}. Try again after reset time.`
  );
}

async function updateApiKeyUsage(apiKeyUsageId) {
  await pool.query(
    `UPDATE api_key_usage SET accessed_count = accessed_count + 1 WHERE id = $1`,
    [apiKeyUsageId]
  );
}

const convertImageToBase64 = (arrayBuffer) => {
  // Convert the ArrayBuffer to a Buffer (for Node.js)
  const buffer = Buffer.from(arrayBuffer);

  // Convert the Buffer to a Base64 string and prepend the appropriate data URI prefix
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
};

const checkAndStoreTeamImages = async (teamImageIds) => {
  try {
    // const cricketLiveKeyData = await getAvailableApiKey("cricket_live_line");
    const cricbuzzKeyData = await getAvailableApiKey("cricbuzz");

    if (!cricbuzzKeyData) {
      console.warn("⚠️ No available API keys for news sources.");
      return {
        error: "All API keys for news sources are exhausted. Try again later.",
      };
    }

    const cricbuzzHeaders = {
      "x-rapidapi-key": cricbuzzKeyData.value,
      "x-rapidapi-host": "cricbuzz-cricket.p.rapidapi.com",
    };

    console.log("Cricbuzz API Key ID:", cricbuzzKeyData.api_key_id);

    const existingImagesQuery = `
      SELECT team_id, team_name, image_id, image_url FROM team_images 
      WHERE image_id = ANY($1)
    `;
    const { rows: existingImages } = await pool.query(existingImagesQuery, [
      teamImageIds.map((team) => team.imageId),
    ]);

    const existingImageMap = new Map(
      existingImages.map((img) => [img.image_id, img])
    );

    const newImageRequests = teamImageIds.filter(
      (team) => !existingImageMap.has(team.imageId)
    );

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const newImages = [];
    for (const [index, team] of newImageRequests.entries()) {
      await delay(index * 300);
      try {
        const imgRes = await axios.get(
          `${Cricbuzz_API_URL}/img/v1/i1/c${team.imageId}/i.jpg`,
          {
            headers: cricbuzzHeaders,
            params: { p: "de", d: "high" },
            responseType: "arraybuffer",
          }
        );
        console.log("New Image Fetched");

        newImages.push({
          teamId: team.teamId,
          teamName: team.team,
          imageId: team.imageId,
          imageUrl: convertImageToBase64(imgRes.data),
        });
      } catch (error) {
        console.error(`Error fetching image ${team.imageId}:`, error.message);
      }
    }

    if (newImages.length > 0) {
      const insertQuery = `
      INSERT INTO team_images (team_id, team_name, image_id, image_url) 
       VALUES ${newImages
         .map(
           (_, i) =>
             `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`
         )
         .join(", ")}
       ON CONFLICT (team_id) DO UPDATE 
       SET image_id = EXCLUDED.image_id, image_url = EXCLUDED.image_url;
`;

      const insertValues = newImages.flatMap(
        ({ teamId, teamName, imageId, imageUrl }) => [
          teamId,
          teamName,
          imageId,
          imageUrl,
        ]
      );
      await pool.query(insertQuery, insertValues);
    }

    await updateApiKeyUsage(cricbuzzKeyData.id, newImages.length);

    console.log(newImages);

    const imagesData = [
      ...existingImages.map((img) => ({
        id: img.image_id,
        teamId: img.team_id,
        teamName: img.team_name,
        url: img.image_url,
      })),
      ...newImages.map(({ imageId, teamId, teamName, imageUrl }) => ({
        id: imageId,
        teamId: teamId,
        teamName: teamName,
        url: imageUrl,
      })),
    ];

    console.log("Images Fetched Successfully");
    console.log("Existing Images:", existingImages.length);
    console.log("New Images:", newImages.length);

    return imagesData;
  } catch (error) {
    console.error("Error handling team images:", error.message);
    return [];
  }
};

// Function to fetch player image
async function fetchPlayerImage(imageId) {
  try {
    const cricbuzzKeyData = await getAvailableApiKey("cricbuzz");

    if (!cricbuzzKeyData) {
      console.warn("⚠️ No available API keys for news sources.");
      return {
        error: "All API keys for news sources are exhausted. Try again later.",
      };
    }

    const cricbuzzHeaders = {
      "x-rapidapi-key": cricbuzzKeyData.value,
      "x-rapidapi-host": "cricbuzz-cricket.p.rapidapi.com",
    };

    console.log("Cricbuzz API Key ID:", cricbuzzKeyData.api_key_id);

    const response = await axios.get(
      `${Cricbuzz_API_URL}/img/v1/i1/c${imageId}/i.jpg`,
      {
        headers: cricbuzzHeaders,
        params: { p: "de", d: "high" },
        responseType: "arraybuffer",
      }
    );
    await updateApiKeyUsage(cricbuzzKeyData.id, 1); // 1 request for cricbuzz
    return convertImageToBase64(response.data); // Assuming response contains the correct image URL
  } catch (error) {
    console.error(
      `Error fetching image for imageId ${imageId}:`,
      error.message
    );
    return null; // If the image fetch fails, return null
  }
}

// Function to fetch and store player data
async function fetchOrStorePlayerData(playerId) {
  try {
    // Step 1: Check if player already exists in the database
    const existingPlayer = await pool.query(
      "SELECT * FROM players WHERE player_id = $1",
      [playerId]
    );

    // If player exists, return the existing data
    if (existingPlayer.rows.length > 0) {
      console.log(`Player with ID ${playerId} already exists.`);
      return existingPlayer.rows[0]; // Return the existing player data
    }

    // Step 2: If player does not exist, fetch data from the API
    const cricbuzzKeyData = await getAvailableApiKey("cricbuzz");

    if (!cricbuzzKeyData) {
      console.warn("⚠️ No available API keys for news sources.");
      return {
        error: "All API keys for news sources are exhausted. Try again later.",
      };
    }

    const cricbuzzHeaders = {
      "x-rapidapi-key": cricbuzzKeyData.value,
      "x-rapidapi-host": "cricbuzz-cricket.p.rapidapi.com",
    };

    console.log("Cricbuzz API Key ID:", cricbuzzKeyData.api_key_id);

    // Step 3: Fetch data from the Player Info API endpoint
    const response = await axios.get(
      `${Cricbuzz_API_URL}/stats/v1/player/${playerId}`,
      { headers: cricbuzzHeaders }
    );
    const playerData = response.data;

    // Step 4: Extract relevant data
    const player = {
      player_id: playerData.id,
      name: playerData.name,
      height: playerData.height || "Unknown",
      dob: playerData.DoBFormat,
      batting_style: playerData.bat,
      bowling_style: playerData.bowl,
      role: playerData.role,
      birth_place: playerData.birthPlace,
      intl_team: playerData.intlTeam.split(",").map((team) => team.trim()),
      teams: playerData.teams.split(",").map((team) => team.trim()),
      bio: playerData.bio || "No biography available", // Default if bio is missing
      image_id: playerData.faceImageId,
      image_url: await fetchPlayerImage(playerData.faceImageId), // Fetch image URL
      curr_rank: playerData.rankings || null, // Ensure curr_rank is handled if undefined
    };

    // Step 5: Insert new player data into the database
    await pool.query(
      `INSERT INTO players (player_id, name, height, dob, batting_style, bowling_style, role, birth_place, intl_team, teams, bio, image_id, image_url, curr_rank)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        player.player_id,
        player.name,
        player.height,
        player.dob,
        player.batting_style,
        player.bowling_style,
        player.role,
        player.birth_place,
        player.intl_team,
        player.teams,
        player.bio,
        player.image_id,
        player.image_url,
        player.curr_rank,
      ]
    );

    console.log(`Player ${player.name} inserted successfully.`);
    return player; // Return the newly fetched and inserted player data
  } catch (error) {
    console.error(
      `Error fetching or storing data for player ID ${playerId}:`,
      error.message
    );
    return {
      error: `Failed to fetch or store player data for ID ${playerId}. Please try again later.`,
    };
  }
}

// Function to execute a query in the database using the pool
async function executeDatabaseQuery(query, params = []) {
  try {
    const res = await pool.query(query, params); // Use pool.query() to execute the query
    return res; // Return the result from the query
  } catch (error) {
    console.error("Error executing query:", error);
    throw error; // Rethrow the error to be handled further up
  }
}

// Function to fetch data from the first endpoint (squads)
async function fetchSquadsData(seriesId) {
  try {
    const cricbuzzKeyData = await getAvailableApiKey("cricbuzz");

    if (!cricbuzzKeyData) {
      console.warn("⚠️ No available API keys for news sources.");
      return {
        error: "All API keys for news sources are exhausted. Try again later.",
      };
    }

    const cricbuzzHeaders = {
      "x-rapidapi-key": cricbuzzKeyData.value,
      "x-rapidapi-host": "cricbuzz-cricket.p.rapidapi.com",
    };

    console.log("Cricbuzz API Key ID:", cricbuzzKeyData.api_key_id);

    const response = await axios.get(
      `${Cricbuzz_API_URL}/series/v1/${seriesId}/squads`,
      { headers: cricbuzzHeaders }
    );

    // console.log(response.data);

    return response.data;
  } catch (error) {
    console.error("Error fetching squad data:", error.message);
    throw error;
  }
}

// Function to fetch data from the second endpoint (squad details)
async function fetchSquadDetails(seriesId, squadId) {
  try {
    const cricbuzzKeyData = await getAvailableApiKey("cricbuzz");

    if (!cricbuzzKeyData) {
      console.warn("⚠️ No available API keys for news sources.");
      return {
        error: "All API keys for news sources are exhausted. Try again later.",
      };
    }

    const cricbuzzHeaders = {
      "x-rapidapi-key": cricbuzzKeyData.value,
      "x-rapidapi-host": "cricbuzz-cricket.p.rapidapi.com",
    };

    console.log("Cricbuzz API Key ID:", cricbuzzKeyData.api_key_id);

    const response = await axios.get(
      `${Cricbuzz_API_URL}/series/v1/${seriesId}/squads/${squadId}`,
      { headers: cricbuzzHeaders }
    );
    updateApiKeyUsage(cricbuzzKeyData.api_key_id);
    return response.data;
  } catch (error) {
    console.error("Error fetching squad details:", error.message);
    throw error;
  }
}

// Function to get team details (shortname, image_url) from the team_images table
async function getTeamDetails(teamId) {
  const query =
    "SELECT team_name, image_url FROM team_images WHERE team_id = $1";
  const result = await executeDatabaseQuery(query, [teamId]);
  if (result.rows.length > 0) {
    return result.rows[0]; // Return team details (shortname, image_url)
  } else {
    console.error("No team data found for team_id:", teamId);
    return null;
  }
}

// Function to check if squadId data is already available in the database
async function checkSquadDataExists(squadId) {
  const query = "SELECT * FROM teams WHERE team_squad_id = $1";
  const result = await executeDatabaseQuery(query, [squadId]);
  return result.rows.length > 0;
}

// Function to insert or update the team data in the database
async function insertTeamData(teamData) {
  const query = `
    INSERT INTO teams (
      team_id,
      team_name,
      team_shortname,
      series_id,
      team_squad_id,
      team_players,
      last_updated
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (team_squad_id) DO UPDATE 
    SET 
      team_name = EXCLUDED.team_name,
      team_shortname = EXCLUDED.team_shortname,
      series_id = EXCLUDED.series_id,
      team_id = EXCLUDED.team_id,
      team_players = EXCLUDED.team_players,
      last_updated = EXCLUDED.last_updated
  `;

  const values = [
    teamData.team_id,
    teamData.team_name,
    teamData.team_shortname,
    teamData.series_id,
    teamData.team_squad_id,
    teamData.team_players,
    teamData.last_updated,
  ];

  try {
    const result = await executeDatabaseQuery(query, values);
    console.log("Team data inserted/updated successfully");
    return result;
  } catch (error) {
    console.error("Error inserting/updating team data:", error.message);
  }
}

// Main function to process squad data and insert into the database
async function processAndStoreSquadData(seriesId) {
  let returnedData = []; // Array to store the fetched data

  try {
    const squadsData = await fetchSquadsData(seriesId);

    for (const squad of squadsData.squads) {
      if (!squad.isHeader) {
        const squadId = squad.squadId;

        // Fetch team details (shortname and image_url) for each squad
        const teamDetails = await getTeamDetails(squad.teamId);

        if (!teamDetails) {
          console.log(`No team details found for squadId: ${squadId}`);
          continue; // Skip if no team details found
        }

        // console.log(teamDetails);
        const { team_name, image_url } = teamDetails;

        // Check if squad already exists in the database
        const squadExists = await checkSquadDataExists(squadId);

        if (!squadExists) {
          console.log(`Fetching details for squadId: ${squadId}`);

          const squadDetails = await fetchSquadDetails(seriesId, squadId);
          const teamSquads = squadDetails.player.filter(
            (player) => !player.isHeader
          );
          // console.log(squadDetails);

          const teamData = {
            team_id: squad.teamId,
            team_name: squad.squadType,
            team_shortname: team_name, // Use fetched shortname
            series_id: seriesId,
            team_squad_id: squadId,
            team_players: teamSquads,
            last_updated: moment().toISOString(), // Store the current timestamp
          };

          // Insert squad data into the database
          await insertTeamData(teamData);

          // Push the fetched squad details to the returnedData array
          returnedData.push({
            ...teamData, // Include team data with shortname and image_url
            team_image_url: image_url,
          });
        } else {
          console.log(
            `Squad with squadId: ${squadId} already exists in the database.`
          );

          // Fetch the existing squad data from the database
          const query = "SELECT * FROM teams WHERE team_squad_id = $1";
          const result = await executeDatabaseQuery(query, [squadId]);
          // console.log(result.rows[0]);

          // Push the existing squad data into the returnedData array
          returnedData.push({
            team_id: result.rows[0].team_id,
            team_name: result.rows[0].team_name,
            team_shortname: result.rows[0].team_shortname, // Use fetched shortname
            series_id: result.rows[0].series_id,
            team_squad_id: result.rows[0].team_squad_id,
            team_players: result.rows[0].team_players,
            last_updated: result.rows[0].last_updated, // Store the current timestamp
            team_image_url: image_url,
          });
        }
      }
    }

    return returnedData; // Return all relevant squad and team data
  } catch (error) {
    console.error("Error processing and storing squad data:", error.message);
  }
}

const processStatsData = async (statsData, seriesId) => {
  const updatedStats = {};

  // Fetch the team data for the given seriesId
  const newSquads = await processAndStoreSquadData(seriesId);

  // Create a map of playerId to team details
  const playerToTeamMap = {};
  newSquads.forEach((squad) => {
    squad.team_players.forEach((player) => {
      if (!player.isHeader) {
        playerToTeamMap[player.id] = {
          teamId: squad.team_id,
          teamName: squad.team_name,
          teamImageUrl: squad.team_image_url || "",
        };
      }
    });
  });

  // Process all available stats lists (odiStatsList, t20StatsList, testStatsList)
  for (const statsKey of Object.keys(statsData.data)) {
    const statsList = statsData.data[statsKey];

    // Ensure the stats list has the required structure
    if (!statsList || !statsList.headers || !statsList.values) continue;

    const { headers, values } = statsList;
    const updatedValues = [];

    const requestsPerSecond = 5;
    const delayTime = 1000 / requestsPerSecond;

    for (let i = 0; i < values.length; i++) {
      const player = values[i];
      const playerId = Number(player.values[0]);

      // Fetch player data
      const playerData = await fetchOrStorePlayerData(playerId);

      // Fetch the team data for the player
      const teamData = playerToTeamMap[playerId] || {
        teamName: "Unknown",
        teamImageUrl: "",
      };

      // Dynamically create player stats based on headers
      const playerStats = {
        playerId: playerId,
        playerName: playerData.name,
        imageURL: playerData.image_url,
        ...teamData,
      };

      headers.forEach((header, index) => {
        playerStats[header] = player.values[index + 1] || null;
      });

      updatedValues.push(playerStats);

      // Delay to respect API rate limits
      if (i < values.length - 1) {
        await delay(delayTime);
      }
    }

    updatedStats[statsKey] = {
      title: statsData.header,
      headers: [...headers],
      values: updatedValues,
    };
  }

  return {
    [statsData.statsType]: updatedStats,
  };
};

function shuffleArray(array) {
  const shuffled = [...array]; // Create a copy to avoid mutating the original array
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1)); // Random index
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; // Swap
  }
  return shuffled;
}

const getTimeAgo = (timestamp) => {
  const currentTime = Date.now();

  // Convert to milliseconds if the timestamp is in seconds
  if (timestamp < 10000000000) {
    timestamp *= 1000;
  }

  const timestampDate = new Date(timestamp);
  const timeDifferenceMs = currentTime - timestampDate;
  const timeDifferenceSec = timeDifferenceMs / 1000;
  const timeDifferenceMin = timeDifferenceSec / 60;
  const timeDifferenceHours = timeDifferenceMin / 60;
  const timeDifferenceDays = timeDifferenceHours / 24;

  if (timeDifferenceMin < 1) {
    return `Just now`;
  } else if (timeDifferenceMin < 60) {
    return `${Math.floor(timeDifferenceMin)}m`; // Minutes ago
  } else if (timeDifferenceHours < 24) {
    return `${Math.floor(timeDifferenceHours)}h`; // Hours ago
  } else {
    return `${Math.floor(timeDifferenceDays)}d`; // Days ago
  }
};

const formatDateTime = (timestamp) => {
  if (timestamp < 10000000000) {
    timestamp *= 1000;
  }
  const date = new Date(timestamp); // Convert Unix timestamp (seconds) to milliseconds
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/ö/g, "oe") // Convert "ö" → "oe"
    .replace(/ü/g, "ue") // Convert "ü" → "ue"
    .replace(/ä/g, "ae") // Convert "ä" → "ae"
    .replace(/ß/g, "ss") // Convert "ß" → "ss"
    .replace(/[^\w\s]/g, "") // Remove special characters
    .replace(/\bgladbach\b/g, "moenchengladbach"); // Convert short forms
}

async function fetchTeamLogo(teamId, teamName) {
  // console.log(teamId, teamName);
  try {
    // Normalize input team name
    const normalizedInputName = normalizeName(teamName);

    // 1️⃣ Check in teams_logo (already mapped with FootAPI ID)
    const storedTeam = await pool.query(
      "SELECT logo_url FROM football_teams_logo WHERE footapi_id = $1",
      [teamId]
    );

    if (storedTeam.rows.length > 0) {
      // console.log(storedTeam.rows[0].logo_url);
      return storedTeam.rows[0].logo_url; // ✅ Found, return logo
    }

    // 2️⃣ Fetch all teams from teams_csv
    const allTeams = await pool.query(
      "SELECT csv_id, team_name, logo_url FROM football_teams_csv"
    );
    const teamList = allTeams.rows.map((team) => ({
      id: team.csv_id,
      name: team.team_name, // Normalize stored team name
      logo_url: team.logo_url,
    }));

    if (teamList.length === 0) {
      return null; // ❌ No stored teams
    }

    // 3️⃣ Find the closest match using Levenshtein distance
    let bestMatch = null;
    let lowestDistance = Infinity;

    for (const team of teamList) {
      const distance = leven(normalizedInputName, team.name);

      if (distance < lowestDistance) {
        lowestDistance = distance;
        bestMatch = team;
      }
    }

    // 4️⃣ Apply a threshold (allowing small differences)
    if (bestMatch && lowestDistance <= 3) {
      // Store in teams_logo for future use
      await pool.query(
        "INSERT INTO football_teams_logo (footapi_id, team_name, logo_url) VALUES ($1, $2, $3)",
        [teamId, teamName, bestMatch.logo_url]
      );
      // console.log(bestMatch.logo_url);
      return bestMatch.logo_url;
    }

    // 5️⃣ No match found → Add to missingTeams for logging
    return null;
  } catch (error) {
    console.error("Error fetching team logo:", error.message);
    return null;
  }
}

async function fetchBasketTeamLogo(teamId, teamName) {
  // console.log(teamId, teamName);
  try {
    // Normalize input team name
    const normalizedInputName = normalizeName(teamName);

    // 1️⃣ Check in teams_logo (already mapped with FootAPI ID)
    const storedTeam = await pool.query(
      "SELECT logo_url FROM basketball_teams_logo WHERE basketapi_id = $1",
      [teamId]
    );

    // console.log(storedTeam.rows);

    if (storedTeam.rows.length > 0) {
      // console.log(storedTeam.rows[0].logo_url);
      return storedTeam.rows[0].logo_url; // ✅ Found, return logo
    }

    // 2️⃣ Fetch all teams from teams_csv
    const allTeams = await pool.query(
      "SELECT csv_id, team_name, logo_url FROM basketball_teams_csv"
    );
    const teamList = allTeams.rows.map((team) => ({
      id: team.csv_id,
      name: team.team_name, // Normalize stored team name
      logo_url: team.logo_url,
    }));

    // console.log("teamlist", teamList);

    if (teamList.length === 0) {
      return null; // ❌ No stored teams
    }

    // 3️⃣ Find the closest match using Levenshtein distance
    let bestMatch = null;
    let lowestDistance = Infinity;

    for (const team of teamList) {
      const distance = leven(normalizedInputName, team.name);

      if (distance < lowestDistance) {
        lowestDistance = distance;
        bestMatch = team;
      }
    }

    // 4️⃣ Apply a threshold (allowing small differences)
    if (bestMatch && lowestDistance <= 3) {
      // Store in teams_logo for future use
      await pool.query(
        "INSERT INTO basketball_teams_logo (basketapi_id, team_name, logo_url) VALUES ($1, $2, $3)",
        [teamId, teamName, bestMatch.logo_url]
      );
      // console.log(bestMatch.logo_url);
      return bestMatch.logo_url;
    }

    // 5️⃣ No match found → Add to missingTeams for logging
    return null;
  } catch (error) {
    console.error("Error fetching team logo:", error.message);
    return null;
  }
}

// Fetch all stored leagues from DB
async function fetchLeagueLogo(leagueId, leagueName, leagueCountry) {
  try {
    // 1️⃣ Check in football_leagues_logo (already mapped with footAPI ID)
    const storedLeague = await pool.query(
      "SELECT logo_url FROM football_leagues_logo WHERE api_id = $1",
      [leagueId]
    );

    if (storedLeague.rows.length > 0) {
      return storedLeague.rows[0].logo_url; // ✅ Found, return logo
    }

    // 2️⃣ Check in football_leagues_csv (match by name + country)
    const closestLeague = await pool.query(
      "SELECT id, logo_url FROM football_leagues_csv WHERE name = $1 AND country = $2",
      [leagueName, leagueCountry]
    );

    if (closestLeague.rows.length > 0) {
      const { id, logo_url } = closestLeague.rows[0];

      // Store in football_leagues_logo for future use
      await pool.query(
        "INSERT INTO football_leagues_logo (api_id, name, country, logo_url) VALUES ($1, $2, $3, $4 )",
        [leagueId, leagueName, leagueCountry, logo_url]
      );

      return logo_url; // ✅ Return the found logo
    }

    // 3️⃣ League is missing from both tables → Add to missingLeagues for logging
    return null; // ❌ League not found, handle it in the route function
  } catch (error) {
    console.error("Error fetching league logo:", error.message);
    return null;
  }
}

async function fetchBasketLeagueLogo(leagueId, leagueName, leagueCountry) {
  try {
    // 1️⃣ Check in football_leagues_logo (already mapped with footAPI ID)
    const storedLeague = await pool.query(
      "SELECT logo_url FROM basketball_leagues_logo WHERE api_id = $1",
      [leagueId]
    );

    if (storedLeague.rows.length > 0) {
      return storedLeague.rows[0].logo_url; // ✅ Found, return logo
    }

    // 2️⃣ Check in football_leagues_csv (match by name + country)
    const closestLeague = await pool.query(
      "SELECT id, logo_url FROM basketball_leagues_csv WHERE name = $1 AND country = $2",
      [leagueName, leagueCountry]
    );

    if (closestLeague.rows.length > 0) {
      const { id, logo_url } = closestLeague.rows[0];

      // Store in football_leagues_logo for future use
      await pool.query(
        "INSERT INTO basketball_leagues_logo (api_id, name, country, logo_url) VALUES ($1, $2, $3, $4 )",
        [leagueId, leagueName, leagueCountry, logo_url]
      );

      return logo_url; // ✅ Return the found logo
    }

    // 3️⃣ League is missing from both tables → Add to missingLeagues for logging
    return null; // ❌ League not found, handle it in the route function
  } catch (error) {
    console.error("Error fetching league logo:", error.message);
    return null;
  }
}

const extractMatches = (data) => {
  if (!data) return [];
  // console.log(data);
  return data.typeMatches.flatMap(
    (typeMatch) =>
      typeMatch.seriesMatches?.flatMap(
        (seriesMatch) => seriesMatch.seriesAdWrapper?.matches || []
      ) || []
  );
};

const scheduleDailyReset = async () => {
  try {
    schedule.scheduleJob("*/5 * * * *", async () => {
      try {
        // Get current time in IST using moment-timezone
        const currentISTTime = moment.tz("Asia/Kolkata");

        console.log("🔍 Checking reset condition for API keys:");

        // Query the database to check the reset condition
        const conditionQuery = `
          SELECT id, api_name, reset_time
          FROM api_key_usage 
          WHERE accessed_count > 0;
        `;

        const conditionResult = await pool.query(conditionQuery);

        // Log the keys to be reset
        conditionResult.rows.forEach((row) => {
          // Convert reset_time to a moment object (in IST)
          const resetTime = moment(row.reset_time).tz("Asia/Kolkata");
          // console.log(resetTime);

          // console.log(
          //   `➡️ API: ${row.api_name} | ID: ${
          //     row.id
          //   } | Reset Time (IST): ${resetTime.format()} | Current IST: ${currentISTTime.format()}`
          // );

          // Now compare the reset time with the current IST time
          if (resetTime.isBefore(currentISTTime)) {
            console.log(`✅ Resetting API key with ID: ${row.id}`);
          }
        });

        // Perform the actual reset operation
        const result = await pool.query(
          `
          UPDATE api_key_usage 
          SET accessed_count = 0, 
              reset_time = CASE 
                WHEN api_name = 'unofficial_cricbuzz' 
                THEN reset_time + INTERVAL '1 month' 
                ELSE reset_time + INTERVAL '1 day' 
              END
          WHERE reset_time <= $1 AND accessed_count > 0
          RETURNING id;
        `,
          [currentISTTime.toDate()]
        ); // Use JavaScript Date for the query

        if (result.rowCount > 0) {
          console.log(
            `✅ Reset ${result.rowCount} API keys that reached reset time.`
          );
        }
      } catch (error) {
        console.error("❌ Error resetting API keys:", error.message);
      }
    });

    console.log("🔄 API key reset job scheduled to run every 5 minutes.");
  } catch (err) {
    console.error("❌ Error scheduling daily reset:", err);
  }
};

scheduleDailyReset();

const parser = new Parser();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET;

const cache = new NodeCache({ stdTTL: 900, checkperiod: 320 }); // Cache expires in 5 minutes
const newsCache = new NodeCache({ stdTTL: 600 }); // Cache for 10 mins

const CRIC_LIVE_LINE_API_URL = "https://cricket-live-line1.p.rapidapi.com";
const Cricbuzz_API_URL = "https://cricbuzz-cricket.p.rapidapi.com";
const Cricbuzz_APIProvider_URL = "https://cricbuzz-cricket2.p.rapidapi.com";
const UnofficialCricbuzz_API_URL = "https://unofficial-cricbuzz.p.rapidapi.com";
const FOOTAPI_URL = "https://footapi7.p.rapidapi.com";
const BASKETAPI_URL = "https://basketapi1.p.rapidapi.com";
const NEWS_URL = "https://google-news22.p.rapidapi.com";

// Set dependencies for route modules
setCricketDeps({
  cache,
  pool,
  Cricbuzz_APIProvider_URL,
  Cricbuzz_API_URL,
  updateApiKeyUsage,
  getAvailableApiKey,
  checkAndStoreTeamImages,
});

setFootballDeps({
  cache,
  pool,
  FOOTAPI_URL,
  NEWS_URL,
  updateApiKeyUsage,
  getAvailableApiKey,
  fetchTeamLogo,
  fetchLeagueLogo,
});

setBasketballDeps({
  cache,
  pool,
  NEWS_URL,
  BASKETAPI_URL,
  updateApiKeyUsage,
  getAvailableApiKey,
  fetchBasketTeamLogo,
  fetchBasketLeagueLogo,
});

app.use("/cricket", cricketRouter);
app.use("/football", footballRouter);
app.use("/basketball", basketballRouter);

// Middleware to parse JSON requests
app.use(express.json());

app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;

  console.log(name, email, password);

  try {
    // Check if user already exists
    const existingUser = await pool.query(
      "SELECT * FROM users WHERE email = $1 OR username = $2",
      [email, name]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Insert new user
    const result = await pool.query(
      "INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email, created_at",
      [name, email, password_hash]
    );

    const user = result.rows[0];

    // Create JWT
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({ user, token });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  // console.log(req.body);
  try {
    // Find user by email or username
    const userQuery = await pool.query(
      "SELECT * FROM users WHERE email = $1 OR username = $1",
      [email]
    );

    if (userQuery.rows.length === 0) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const user = userQuery.rows[0];

    // Compare password with hashed one
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    // Generate JWT
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // Return user (excluding password_hash) and token
    const { password_hash, ...safeUser } = user;
    res.json({ user: safeUser, token });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];

  // Format: "Bearer tokenvalue"
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: "Invalid token" });

    req.userId = decoded.userId;
    next();
  });
};

app.get("/profile", authenticateToken, async (req, res) => {
  try {
    const userQuery = await pool.query(
      "SELECT id, username, email, created_at FROM users WHERE id = $1",
      [req.userId]
    );

    const user = userQuery.rows[0];
    res.json({ user });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

app.get("/tweets", async (req, res) => {
  const query = req.query.q;
  const langFilter = req.query.lang; // Optional language filter (e.g., "en")

  console.log(query);

  if (!query) return res.status(400).json({ error: "Missing query" });

  // Check cache first
  const cached = cache.get(query);
  if (cached) {
    console.log("✅ Serving from cache");
    const filtered = langFilter
      ? cached.filter((t) => t.lang === langFilter)
      : cached;
    return res.json({ tweets: filtered });
  }

  try {
    // In your endpoint
    const tweets = await getTweetsWithPuppeteer(query, langFilter || "en", 25); // Request 25 tweets

    // Detect language for each tweet
    const tweetsWithLang = tweets.map((tweet) => {
      const lang = franc(tweet.text || "");
      return {
        ...tweet,
        lang: lang === "und" ? null : lang, // Assign null if language is undetectable
      };
    });

    // Store in cache
    cache.set(query, tweetsWithLang);

    // Apply optional language filtering
    const filtered = langFilter
      ? tweetsWithLang.filter((t) => t.lang === langFilter)
      : tweetsWithLang;
    console.log(`📦 Returning ${filtered.length} tweets to client`);

    res.json({ tweets: filtered });
  } catch (err) {
    console.error("❌ Error fetching tweets", err.message);
    res.status(500).json({ error: "Failed to fetch tweets" });
  }
});

// Puppeteer Function for Scraping Tweets

async function getTweetsWithPuppeteer(query, lang = "en", maxCount = 50) {
  const url = `https://twitter.com/search?q=${encodeURIComponent(
    query
  )}%20lang%3A${lang}&src=typed_query&f=top`;

  const browser = await puppeteer.launch({
    headless: true, // Keep visible for debugging
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );
  await page.setViewport({ width: 1280, height: 800 });

  // Load cookies
  let cookies = [];
  try {
    if (fs.existsSync("twitter-cookies.json")) {
      cookies = JSON.parse(fs.readFileSync("twitter-cookies.json", "utf-8"));
      console.log(
        `Loaded ${cookies.length} cookies:`,
        cookies.map((c) => c.name).join(", ")
      );
    } else {
      console.log("⚠️ No twitter-cookies.json found");
    }
  } catch (e) {
    console.log("⚠️ Cookie loading failed:", e.message);
  }
  await page.setCookie(...cookies);

  try {
    console.log(`Navigating to: ${url}`);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise((r) => setTimeout(r, 5000));

    // Check for error page or login prompt
    const errorElement = await page.$("div[role='alert']");
    if (errorElement) {
      const errorText = await page.evaluate((el) => el.innerText, errorElement);
      if (errorText.includes("Something went wrong")) {
        console.log("⚠️ Error page detected. Attempting reload...");
        await page.reload({ waitUntil: "networkidle2" });
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
    const loginPrompt = await page.$("input[name='text'], a[href*='login']");
    if (loginPrompt) {
      console.log("⚠️ Login required! Please log in manually.");
      await new Promise((r) => setTimeout(r, 30000));
      const newCookies = await page.cookies();
      fs.writeFileSync(
        "twitter-cookies.json",
        JSON.stringify(newCookies, null, 2)
      );
      console.log("🔄 Cookies updated after manual login");
    } else {
      console.log("✅ Successfully loaded page");
    }

    // Collect tweets incrementally during scrolling
    const tweets = await collectTweetsDuringScroll(page, maxCount);

    await browser.close();

    const validTweets = tweets.filter((t) => t.text || t.user);
    console.log(
      `Total tweets: ${tweets.length}, Valid tweets: ${validTweets.length}`
    );
    return validTweets.slice(0, maxCount);
  } catch (err) {
    await browser.close();
    console.error("❌ Error:", err.message);
    throw err;
  }
}

async function collectTweetsDuringScroll(page, maxCount) {
  let allTweets = new Map(); // Use Map to deduplicate by tweetLink
  let scrollCount = 0;
  const maxScrolls = 75; // Increased to allow more attempts
  const delay = 4000; // Increased to ensure tweets load

  while (scrollCount < maxScrolls && allTweets.size < maxCount) {
    // Scrape current tweets with media support
    const newTweets = await page.evaluate(() => {
      const articles = document.querySelectorAll("article");
      const tweetData = [];
      articles.forEach((article) => {
        // Text and user
        const textElements = article.querySelectorAll(
          "div[lang], div.css-1dbjc4n"
        );
        const text =
          Array.from(textElements)
            .map((el) => el.innerText.trim())
            .find((t) => t) || "";
        const userElements = article.querySelectorAll("span.css-901oao, span");
        const user =
          Array.from(userElements)
            .map((el) => el.innerText.trim())
            .find((u) => u) || "";
        const time =
          article.querySelector("time")?.getAttribute("datetime") || null;
        const tweetLink =
          article.querySelector("a[href*='/status/']")?.href || "";
        const userLink = tweetLink.split("/status/")[0] || "";
        const profilePic =
          article.querySelector("img[src*='profile_images']")?.src || "";

        // Images
        const imageElements = article.querySelectorAll("img");
        const images = Array.from(imageElements)
          .map((img) => img.src)
          .filter(
            (src) => !src.includes("profile_images") && src.includes("media/")
          );

        // Videos (look for video thumbnail or player)
        const videoThumbnail =
          article.querySelector("div[aria-label='Embedded video'] img")?.src ||
          article.querySelector("video")?.src ||
          null;

        if (tweetLink && (text || user)) {
          tweetData.push({
            user,
            text,
            userLink,
            tweetLink,
            timestamp: time,
            profilePic,
            images,
            videoThumbnail,
          });
        }
      });
      return tweetData;
    });

    // Add new tweets to the collection
    newTweets.forEach((tweet) => {
      if (!allTweets.has(tweet.tweetLink)) {
        allTweets.set(tweet.tweetLink, tweet);
        console.log(
          `Tweet ${allTweets.size}: ${tweet.text.slice(0, 50)}... (Images: ${
            tweet.images.length
          }, Video: ${tweet.videoThumbnail ? "Yes" : "No"})`
        );
      }
    });

    // Stop if we have enough tweets
    if (allTweets.size >= maxCount) {
      console.log(`Reached target of ${maxCount} tweets, stopping.`);
      break;
    }

    // Scroll down
    const previousHeight = await page.evaluate("document.body.scrollHeight");
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await new Promise((resolve) => setTimeout(resolve, delay));

    const newHeight = await page.evaluate("document.body.scrollHeight");
    const currentTweetCount = allTweets.size;
    console.log(
      `Scroll ${
        scrollCount + 1
      } - Height: ${newHeight}, Total Tweets: ${currentTweetCount}`
    );

    if (newHeight === previousHeight && scrollCount > 5) {
      console.log(
        "No significant new content loaded after 5 scrolls, stopping."
      );
      break;
    }

    scrollCount++;
  }

  await new Promise((resolve) => setTimeout(resolve, 5000));
  console.log(`Finished scrolling with ${allTweets.size} unique tweets.`);
  return Array.from(allTweets.values());
}

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
