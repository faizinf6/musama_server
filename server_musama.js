import express from 'express';
import { writeFile } from 'fs/promises'; // Use fs/promises for the promise-based API
import multer from 'multer';
import fs from 'fs-extra';
import path from 'path';
import bodyParser from 'body-parser';

const app = express();
app.use(express.json());
const port = 3100;

// Ensure db_temp directory exists
const dbTempPath = './db_temp';
const dbProdPath = './db_prod';

// Ensure db_temp and db_prod directories exist
fs.ensureDirSync(dbTempPath);
fs.ensureDirSync(dbProdPath);

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, dbTempPath); // Temporarily save files to db_temp
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname); // Keep original file name
    }
});

const upload = multer({ storage: storage });


let strings = []; // Array to manage the queue of strings sent to users
let history = []; // Array to store the complete history of all strings
let mesinStatus = false; // Standalone variable to control when to write to file
let clientStatus = false
// Endpoint to update the 'mesinStatus' status and immediately write to file if true
app.post('/update-status', async (req, res) => {
    const { interrupt,client_status } = req.body; // Expect a boolean value
    if (typeof interrupt === 'boolean') {
        mesinStatus = interrupt;
        clientStatus=client_status;

        console.log(mesinStatus)
        console.log(clientStatus)
        console.log("-")
        if (clientStatus) {
            try {
                // Save the complete history of strings to disk asynchronously
                await writeFile('strings_history.json', JSON.stringify(history, null, 2));
                res.send({ message: 'Selesai is true. History has been saved to disk. Clearing the memory.' });
                strings = []; // Clear the array after saving
                history = []; // Clear the history after saving
                mesinStatus = false; // Reset mesinStatus status after saving
            } catch (err) {
                console.error('Error saving history to disk:', err);
                res.status(500).send({ message: 'Failed to save history to disk.' });
            }
        }

        res.send({ message: 'Berhasil di update!' });






    } else {
        res.status(400).send({ message: 'Invalid format for mesinStatus, expecting a boolean.' });
    }
});

app.post('/post', (req, res) => {
    const { str } = req.body;
    if (str) {
        strings.push(str); // Add the string to the queue
        history.push(str); // Add the string to the history
        console.log(str);
        res.send({ message: 'String has been added to queue and history.' });
    } else {
        res.status(400).send({ message: 'No string provided or invalid format.' });
    }
});

app.get('/get-interrupt-status', (req, res) => {
    console.log("berjalan babiiieh")
    console.log()
    res.send({ interrupt: mesinStatus,client_status:clientStatus });
    //if (mesinStatus) mesinStatus=false
});

app.get('/get', (req, res) => {
    if (strings.length > 0) {
        const nextString = strings.shift(); // Retrieve the next string from the queue
        res.send({ str: nextString,selesai:mesinStatus });
    } else {
        res.send({ str: '' }); // Send an empty string if the queue is empty
    }
});

// GET endpoint to process and send merged JSON
app.get('/merge', async (req, res) => {
    const { event_name, event_date } = req.query;
    console.log(event_date)

    if (!event_name || !event_date) {
        return res.status(400).send('Event name and date are required.');
    }

    const eventPath = path.join(dbTempPath, event_name);
    const mergedFileName = `merged_${event_name}_${event_date}.json`;
    const mergedFilePath = path.join(dbProdPath, mergedFileName);

    try {
        // Check if the event directory exists
        const exists = await fs.pathExists(eventPath);
        if (!exists) {
            return res.status(404).send('Event not found.');
        }

        // Read all files in the event directory
        const files = await fs.readdir(eventPath);
        const dateFiles = files.filter(file => file.includes(event_date) && file.endsWith('.json'));

        // Merge content of all matching files
        let mergedContent = [];
        for (const file of dateFiles) {
            const filePath = path.join(eventPath, file);
            const content = await fs.readJson(filePath);
            mergedContent = mergedContent.concat(content);
        }

        // Save merged content to db_prod
        await fs.writeJson(mergedFilePath, mergedContent);

        // Send merged content as response
        res.sendFile(path.resolve(mergedFilePath));
    } catch (error) {
        console.error('Error processing request:', error);
        res.status(500).send('Error processing request');
    }
});


// Endpoint to upload files
app.post('/upload', upload.array('files'), async (req, res) => {
    try {
        if (req.files) {
            await Promise.all(req.files.map(async (file) => {
                // Extract location_name from the file name
                const eventName = file.originalname.split('_')[1];
                const destinationPath = path.join(dbTempPath, eventName);


                // Ensure the location_name directory exists
                await fs.ensureDir(destinationPath);
                console.log(file)
                console.log(destinationPath)

                // Move the file to the correct directory
                await fs.move(file.path, path.join(destinationPath, file.originalname), { overwrite: true });
            }));

            res.send('Files uploaded and moved successfully');
        } else {
            res.status(400).send('No files were uploaded.');
        }
    } catch (error) {
        console.error('Error during file upload:', error);
        res.status(500).send('Error during file upload');
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
