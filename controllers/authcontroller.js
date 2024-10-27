const userModel = require('../models/user');

exports.register = (req, res) => {
    const { username, password } = req.body;
    userModel.registerUser(username, password, (err) => {
        if (err) return res.status(500).json({ error: "User already exists." });
        res.status(201).json({ message: "User registered successfully." });
    });
};

exports.login = (req, res) => {
    const { username, password } = req.body;
    userModel.loginUser(username, password, (err, valid) => {
        if (err) return res.status(500).json({ error: "Internal server error." });
        if (!valid) return res.status(401).json({ error: "Invalid credentials." });
        res.json({ message: "Login successful." });
    });
};
