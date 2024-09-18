import express from 'express';
import mysql from 'mysql2';
import cors from 'cors';
import { processAndSave } from './scrape.js';

const app = express();

// MySQL Database connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '1234567890',
    database: 'test',
});

// Middleware
app.use(express.json());
app.use(cors());

  processAndSave();
 
app.get('/products', (req, res) => {
    const query = 'SELECT * FROM toys'

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching products:', err);
            return res.status(500).json({ message: 'Internal Server Error' });
        }

        res.status(200).json(results);
    });
});

app.post('/toysByMonths', (req, res) => {
    const { months } = req.body;  

    if (!months || isNaN(months)) {
        return res.status(400).json({ message: 'Invalid months input' });
    }

    console.log('Received months:', months);

    // SQL query to fetch toys with age greater than or equal to the input months
    const query = `
        SELECT * FROM toys
        WHERE
            (age LIKE '%months%' AND CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(age, ' months', 1), ' ', -1) AS UNSIGNED) >= ?)
            OR (age LIKE '%years%' AND CAST(SUBSTRING_INDEX(age, ' years', 1) AS UNSIGNED) * 12 >= ?)
    `;

    console.log('Executing query:', query);
    console.log('Parameters:', [months, months]);

    db.query(query, [months, months], (err, results) => {
        if (err) {
            console.error('Error fetching toys by months:', err);
            return res.status(500).json({ message: 'Internal Server Error' });
        }
        console.log('Query results:', results);
        res.status(200).json(results);
    });
});

app.post('/toysByYear', (req, res) => {
    const { years } = req.body;  

    if (!years || isNaN(years)) {
        return res.status(400).json({ message: 'Invalid years input' });
    }

    console.log('Received years:', years);

    const query = `
        SELECT * FROM toys
        WHERE 
            (age LIKE '%years%' AND CAST(SUBSTRING_INDEX(age, ' years', 1) AS UNSIGNED) >= ?)
            OR (age LIKE '%months%' AND CAST(SUBSTRING_INDEX(age, ' months', 1) AS UNSIGNED) / 12 >= ?)
    `;

    console.log('Executing query:', query);
    console.log('Parameters:', [years, years]);

    db.query(query, [years, years], (err, results) => {
        if (err) {
            console.error('Error fetching toys by years:', err);
            return res.status(500).json({ message: 'Internal Server Error' });
        }
        console.log('Query results:', results);
        res.status(200).json(results);
    });
});


// Start the server on port 8800
app.listen(8800, () => {
    console.log('Server is running on port 8800');
});





