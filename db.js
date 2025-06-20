import "dotenv/config"; // ✅ Use import for dotenv
import pg from "pg"; // ✅ Import pg package

const { Pool } = pg; // Extract Pool from pg module

// Create a connection pool using environment variables
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  max: 10, // Max connections in the pool
  idleTimeoutMillis: 30000, // Closes idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Timeout for connecting to a new client
});

// Error handling for PostgreSQL connection
pool.on("connect", () => {
  console.log("Connected to the PostgreSQL database");
});

pool.on("error", (err) => {
  console.error("Error in PostgreSQL connection:", err);
});

export default pool;
