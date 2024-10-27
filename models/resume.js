const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db.sqlite');

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS resumes (username TEXT, resume BLOB)");
});

module.exports = {
    saveResume: (username, resumeData, callback) => {
        db.run("INSERT OR REPLACE INTO resumes (username, resume) VALUES (?, ?)", [username, resumeData], callback);
    },
    getResume: (username, callback) => {
        db.get("SELECT resume FROM resumes WHERE username = ?", [username], callback);
    }
};
