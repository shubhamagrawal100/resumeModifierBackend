const resumeModel = require('../models/resume');
const fs = require('fs');

exports.upload = (req, res) => {
    const username = req.body.username;
    const resumeData = fs.readFileSync(req.file.path, 'utf8');
    resumeModel.saveResume(username, resumeData, (err) => {
        if (err) return res.status(500).json({ error: "Failed to save resume." });
        res.json({ message: "Resume uploaded successfully." });
    });
};

exports.getResume = (username, callback) => {
    resumeModel.getResume(username, (err, result) => {
        if (err || !result) return callback(null);
        callback(result.resume);
    });
};
