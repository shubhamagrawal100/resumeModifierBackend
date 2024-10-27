const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const fileType = require("file-type");
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db.sqlite');
const mammoth = require("mammoth");
const { Document, Packer, Paragraph, TextRun } = require("docx");
const officegen = require("officegen");
const cors = require("cors");


const app = express();
app.use(express.json());

// Configure Multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Initialize SQLite Database and create tables
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, password TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS resumes (username TEXT PRIMARY KEY, resume BLOB)");
});


// Enable CORS for all routes
app.use(cors({
    origin: "http://localhost:3000" // Allow requests from this specific origin
}));


async function createWordDocument(content, filename) {
  return new Promise((resolve, reject) => {
    // Initialize a new Word document
    const doc = officegen("docx");

    // Add a paragraph with the provided content
    const paragraph = doc.createP();
    paragraph.addText(content);

    // Create a writable stream to save the document
    const out = fs.createWriteStream(filename);

    out.on("error", (err) => {
      console.error("Error writing to file:", err);
      reject(err);
    });

    // Generate the Word document and write to file
    doc.generate(out, {
      finalize: () => {
        console.log("Word document created successfully at", filename);
        resolve();
      },
      error: (err) => {
        console.error("Error creating Word document:", err);
        reject(err);
      },
    });
  });
}

// Helper function to read Word document content
async function readWordFile(filepath) {
    const result = await mammoth.extractRawText({ path: filepath });
    return result.value;
  }


// User Registration Endpoint
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    bcrypt.hash(password, 10, (err, hash) => {
        if (err) return res.status(500).json({ error: "Error processing password." });
        db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, hash], (err) => {
            if (err) return res.status(400).json({ error: "User already exists." });
            res.status(201).json({ message: "User registered successfully." });
        });
    });
});

// User Login Endpoint
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT password FROM users WHERE username = ?", [username], (err, row) => {
        if (err) return res.status(500).json({ error: "Database error." });
        if (!row) return res.status(401).json({ error: "Invalid credentials." });
        bcrypt.compare(password, row.password, (err, result) => {
            if (err || !result) return res.status(401).json({ error: "Invalid credentials." });
            res.json({ message: "Login successful." });
        });
    });
});


// Function to validate if file is a Word document
const isWordDocument = async (filePath) => {
    const fileBuffer = fs.readFileSync(filePath); // Read the file from the disk
    const type = await fileType.fromBuffer(fileBuffer);
    return type && type.ext === 'docx' && type.mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
};

// Resume Upload Endpoint
app.post('/upload', upload.single('resume'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded." });
    }

    // Validate if the uploaded file is a Word document
    const isValidWordDoc = await isWordDocument(req.file.path);
    if (!isValidWordDoc) {
        return res.status(400).json({ error: "Uploaded file is not a valid Word document." });
    }

    var resumeText = await readWordFile(req.file.path);

    try{
        const prompt = `Reply with a YES if the following text is of a resume and contains relavent sections like contact details, name, work history etc: ${resumeText}. Reply with a NO if its not a resume and YES if it is a resume and nothing else.`;
        console.log(prompt);
        // Sending request to Ollama for resume modification using Llama 3.1
        const response = await axios.post("http://localhost:11434/api/generate", {
            prompt: prompt,
            model: "llama3.1:8b",
            "stream": false
        });
    
        if (response.status === 200) {
            const reponse = response.data.response;
            if(response=="NO"){
                return res.status(400).json({ error: "Uploaded file is not a valid Resume." });
            }
        }
    }catch(err){
        return res.status(500).json({ error: "Something went wrong while contacting Ollama" });
    }
   

    const username = req.body.username;

    db.run("INSERT OR REPLACE INTO resumes (username, resume) VALUES (?, ?)", [username, resumeText], (err) => {
        if (err) return res.status(500).json({ error: "Failed to save resume." });
        res.json({ message: "Resume uploaded successfully." });
    });
});



// Modify Resume with Llama Endpoint
app.post('/modify', async (req, res) => {
    const { username, jobdescriptionURL } = req.body;

    db.get("SELECT resume FROM resumes WHERE username = ?", [username], async (err, row) => {
        if (err || !row) return res.status(404).json({ error: "Resume not found." });

        const resumeText = row.resume;
        console.log(resumeText);
        try {

            // const jobDescription = await scrapeJobDescription(jobDescriptionURL);

            console.log(jobdescriptionURL);


            const prompt = `Rewrite the following resume to better match this job description:\n\nJob Description URL : ${jobdescriptionURL}\n\nResume:\n${resumeText}. Return two  objects in response, one containing the complete resume (keep the original formatting. Call it **Resume**. ) and another containing the commentary on the resume , what you have changed and how you have aligned the resume to the job description in the commentary section. (Call it **Commentary**). Return just these two objects and nothing else.`;
            console.log(prompt);
            // Sending request to Ollama for resume modification using Llama 3.1
            const response = await axios.post("http://localhost:11434/api/generate", {
                prompt: prompt,
                model: "llama3.1:8b",
                "stream": false
            });

            if (response.status === 200) {

                const modifiedContent = response.data.response;

                // Parse the response into Resume and Commentary sections
                const resumeMarker = "**Resume**";
                const commentaryMarker = "**Commentary**";
                const resumeIndex = modifiedContent.indexOf(resumeMarker);
                const commentaryIndex = modifiedContent.indexOf(commentaryMarker);
          
                let resumeText = "";
                let commentaryText = "";
          
                if (resumeIndex !== -1 && commentaryIndex !== -1) {
                  resumeText = modifiedContent
                    .substring(resumeIndex + resumeMarker.length, commentaryIndex)
                    .trim();
                  commentaryText = modifiedContent
                    .substring(commentaryIndex + commentaryMarker.length)
                    .trim();
                } else {
                  return res.status(500).json({ error: "Failed to parse response from LLM." });
                }
          
                // Save modified resume as Word document
                const modifiedResumePath = path.join(".", `modified_${username}.docx`);
                await createWordDocument(resumeText, modifiedResumePath);
          
                res.status(200).json({
                  message: "Resume modified successfully.",
                  resumeDownloadPath: modifiedResumePath,
                  commentary: commentaryText,
                });

            } else {
                res.status(500).json({ error: "Failed to modify resume." });
            }
        } catch (error) {
            res.status(500).json({ error: "Error connecting to Ollama." });
        }
    });
});

// Download Modified Resume Endpoint
app.get('/download/:filename', (req, res) => {
    const filePath = path.join(__dirname, req.params.filename);
    res.download(filePath, (err) => {
        if (err) {
            res.status(404).json({ error: "File not found." });
        }
    });
});

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
