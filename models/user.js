const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const db = new sqlite3.Database('./db.sqlite');

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, password TEXT)");
});

module.exports = {
    registerUser: (username, password, callback) => {
        bcrypt.hash(password, 10, (err, hash) => {
            if (err) return callback(err);
            db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, hash], callback);
        });
    },
    loginUser: (username, password, callback) => {
        db.get("SELECT password FROM users WHERE username = ?", [username], (err, row) => {
            if (err) return callback(err);
            if (!row) return callback(null, false);
            bcrypt.compare(password, row.password, (err, result) => callback(err, result));
        });
    }
};
