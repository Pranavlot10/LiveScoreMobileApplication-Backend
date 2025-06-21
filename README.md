# 🏟️ LiveScore Backend Server

This is the **backend server** for the [LiveScore mobile application](https://github.com/Pranavlot10/LiveScoreMobileApplication).  
It fetches and serves live sports data (Football, Basketball, Cricket) from **RapidAPI** to the frontend React Native app.

---

## ⚙️ Tech Stack

- 🖥️ **Node.js** – JavaScript runtime
- 🚀 **Express.js** – Web framework
- 🌐 **RapidAPI** – External sports data API
- 🔑 **dotenv** – For environment variable management

---

## 📁 Project Structure
```
├── routes/   # API route files
│ ├── basketball.js
│ ├── cricket.js
│ └── football.js
├── db.js      # Database/file setup (if used)
├── index.js   # App entry point (main server)
├── importCSV.js    # Utility to import general CSV data
├── importTeamsCSV.js   # Imports team data from CSV
├── saveTwitterCookies.js    # Twitter data utility (optional)
├── Fixed_Football_Team_Data.csv
├── TeamsData.csv
├── output.csv / output.json     # Generated output data
├── twitter-cookies.json     # Cookie storage (optional use)
├── .gitignore       # Git ignore rules
├── package.json     # Project metadata
└── README.md        # You're here!
```
---

## 🔗 Related Repositories

- 📱 Frontend (React Native): [LiveScoreMobileApplication](https://github.com/Pranavlot10/LiveScoreMobileApplication)

---

## 📄 Data Notes

- Uses .csv files such as TeamsData.csv and Fixed_Football_Team_Data.csv to handle team and match data.

- Utility scripts like importTeamsCSV.js and saveTwitterCookies.js are used for data preparation and Twitter scraping (if applicable).

---

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/Pranavlot10/LiveScoreBackend.git
cd LiveScoreBackend

