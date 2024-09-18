import puppeteer from 'puppeteer';
import fs from 'fs';
import xlsx from 'xlsx';
import mysql from 'mysql2/promise';

export const scrape = async () => {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    let allToys = [];
    let currentPage = 1;
    const maxPage = 5;

    // Load existing data if it exists (from JSON and Excel)
    let existingToys = [];
    if (fs.existsSync('toys.json')) {
        const data = fs.readFileSync('toys.json');
        existingToys = JSON.parse(data);
    }

    let existingToysExcel = [];
    if (fs.existsSync('toys.xlsx')) {
        // If the file exists, read it
        const workbook = xlsx.readFile('toys.xlsx');
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        existingToysExcel = xlsx.utils.sheet_to_json(worksheet);
    } else {
        console.log('toys.xlsx does not exist. Skipping Excel data load.');
    }

    // Connect to MySQL and ensure the table exists
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '1234567890',
        database: 'test',
    });

    // Create table if it doesn't exist
    await connection.execute(`
        CREATE TABLE IF NOT EXISTS toys (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255) UNIQUE,
            price VARCHAR(50),
            age VARCHAR(50),
            url TEXT,
            image TEXT,
            description TEXT,
            category TEXT
        )
    `);

    // Now, load existing toys from SQL
    const [existingToysSQL] = await connection.execute(`SELECT title, url FROM toys`);
    const existingToysURLs = existingToysSQL.map(toy => toy.url); // Extract URLs for quick comparison

    // Scrape multiple pages
    while (currentPage <= maxPage) {
        const url = `https://www.amazon.in/s?i=toys&page=${currentPage}`;

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); // 60 seconds

        const toys = await page.evaluate(() => {
            const toyElements = document.querySelectorAll('.puis-card-container');
            return Array.from(toyElements).map((toy) => {
                const title = toy.querySelector('span.a-size-base-plus')?.textContent?.trim() || 'No title available';
                const priceWhole = toy.querySelector('span.a-price-whole')?.textContent?.trim() || 'No price available';
                const priceSymbol = toy.querySelector('span.a-price-symbol')?.textContent?.trim() || '$';
                const price = priceSymbol + priceWhole;
                const age = toy.querySelector('div[data-cy="product-details-recipe"] span')?.textContent?.trim() || 'No age info';
                const url = toy.querySelector('a.a-link-normal')?.href || 'No URL';
                const image = toy.querySelector('img.s-image')?.src || 'No image available';

                return { title, price, age, url, image };
            });
        });

        // Filter out duplicates based on title and URL
        const newToys = toys.filter(newToy =>
            !existingToys.some(
                existingToy => existingToy.title === newToy.title && existingToy.url === newToy.url
            ) &&
            !existingToysExcel.some(
                existingToy => existingToy.title === newToy.title && existingToy.url === newToy.url
            ) &&
            !existingToysURLs.includes(newToy.url) // Check if the toy exists in SQL DB
        );

        allToys = [...allToys, ...newToys];
        existingToys = [...existingToys, ...newToys]; // Keep adding new toys to the list

        console.log(`Page ${currentPage} processed.`);

        currentPage++;
    }

    // Fetch descriptions and categories for each toy
    let filteredToys = [];
    for (let toy of allToys) {
        if (toy.url !== 'No URL') {
            try {
                await page.goto(toy.url, { waitUntil: 'domcontentloaded', timeout: 60000 });

                const description = await page.evaluate(() => {
                    const ulElement = document.querySelector('ul.a-unordered-list.a-vertical.a-spacing-mini');
                    if (!ulElement) return 'No description available';
                    const liElements = ulElement.querySelectorAll('li');
                    return Array.from(liElements).map((li) => li.textContent.trim()).join(', ');
                });

                const category = await page.evaluate(() => {
                    const breadcrumb = document.querySelector('ul.a-unordered-list.a-horizontal.a-size-small');
                    if (!breadcrumb) return 'No category available';
                    const categories = breadcrumb.querySelectorAll('li');
                    return Array.from(categories).map((cat) => cat.textContent.trim()).join(' > ');
                });

                toy.description = description;
                toy.category = category;

                if (category.includes('Toys & Games')) {
                    filteredToys.push(toy);
                }
            } catch (error) {
                console.log(`Failed to fetch description or category for ${toy.title}: ${error.message}`);
                toy.description = 'Failed to fetch description';
                toy.category = 'Failed to fetch category';
            }
        } else {
            toy.description = 'No URL available';
            toy.category = 'No URL available';
        }
    }

    await browser.close();

    // Merge with existing toys data from JSON and Excel (remove duplicates)
    const mergedToys = [...existingToysExcel, ...filteredToys].reduce((acc, current) => {
        const duplicate = acc.find(toy => toy.title === current.title && toy.url === current.url);
        if (!duplicate) {
            acc.push(current);
        }
        return acc;
    }, []); // This will merge and remove duplicates

    // Save the merged data back to toys.json and toys.xlsx
    fs.writeFileSync('toys.json', JSON.stringify(mergedToys, null, 2));
    console.log('Final merged data saved to toys.json');

    // Create Excel file with merged toys (if it was missing, we create a new one)
    const workBook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(mergedToys);
    xlsx.utils.book_append_sheet(workBook, worksheet, 'Toys');
    xlsx.writeFile(workBook, 'toys.xlsx');
    console.log('Merged data saved to toys.xlsx');

};


export const saveToDatabase = async () => {
    const workBook = xlsx.readFile('toys.xlsx');
    const sheetName = workBook.SheetNames[0];
    const worksheet = workBook.Sheets[sheetName];
    const toysData = xlsx.utils.sheet_to_json(worksheet);

    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '1234567890',
        database: 'test',
    });

    // Create table if not exists
    await connection.execute(`
        CREATE TABLE IF NOT EXISTS toys (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255),
            price VARCHAR(50),
            age VARCHAR(50),
            url TEXT,
            image TEXT,
            description TEXT,
            category TEXT,
            UNIQUE (title, url) -- Ensure no duplicates based on title and url
        )
    `);

    // Insert only new toys into MySQL database
    for (let toy of toysData) {
        const { title, price, age, url, image, description, category } = toy;

        try {
            // Attempt to insert new toy, if it's a duplicate it will fail and skip
            await connection.execute(`
                INSERT INTO toys (title, price, age, url, image, description, category)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [title, price, age, url, image, description, category]);
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                console.log(`Duplicate entry found for toy: ${title}. Skipping...`);
            } else {
                console.log(`Error saving toy: ${title}. Error: ${error.message}`);
            }
        }
    }

    console.log('New data has been saved to the MySQL database');
    await connection.end();
};


// Function to process and save data
export const processAndSave = async () => {
    await scrape();
    await saveToDatabase();
};
