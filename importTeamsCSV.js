import fs from "fs";
import path from "path";
import csv from "csv-parser";
import pool from "./db.js";

import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the CSV file
const csvFilePath = path.join(__dirname, "TeamsData.csv");

// Function to import CSV data into the database
const importCsvData = async () => {
  const records = [];

  // Read the CSV file
  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on("data", (row) => {
      records.push(row);
    })
    .on("end", async () => {
      console.log("CSV file successfully processed");

      // Insert data into the database
      try {
        for (const record of records) {
          await pool.query(
            `INSERT INTO football_teams_csv (csv_id, team_name, logo_url) 
             VALUES ($1, $2, $3)
             ON CONFLICT (name) DO NOTHING`,
            [record.id, record.name, record.logo_url]
          );
        }

        console.log("Data inserted successfully!");
        pool.end(); // Close the database connection
      } catch (error) {
        console.error("Error inserting data:", error.message);
      }
    });
};

// Run the import function
importCsvData();
