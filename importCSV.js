const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const pool = require("./db");

// Path to the CSV file
const csvFilePath = path.join(__dirname, "output.csv");

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
            `INSERT INTO football_leagues_csv (id, name, country, logo_url) 
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (name, country) DO UPDATE 
             SET logo_url = EXCLUDED.logo_url`, // Update logo if league already exists
            [record.id, record.name, record.country, record.logo_url]
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
