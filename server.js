const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded images statically
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(uploadsDir, file.fieldname || 'images');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Database connection
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'order2me',
    password: process.env.DB_PASSWORD || '',
    port: parseInt(process.env.DB_PORT || '5432'),
    ssl: process.env.DB_SSL === 'true' ? {
        rejectUnauthorized: false
    } : false
});

// Helper function to get base URL for images
const getImageUrl = (req, filePath) => {
    if (!filePath) return null;
    // If it's already a full URL, return it
    if (filePath.startsWith('http')) return filePath;
    // Otherwise, construct the URL
    const baseUrl = process.env.API_BASE_URL || `http://${req.get('host')}`;
    return `${baseUrl}/uploads/${filePath}`;
};

// User data helper functions
const userData = {
    storeData: async (data) => {
        const query = `
            INSERT INTO users (username, email, mobile, password, admin, delivery_partner)
            VALUES ($1, $2, $3, $4, $5, $6)
        `;
        const values = [data.username, data.email, data.mobile, data.password, false, false];
        try {
            await pool.query(query, values);
        } catch (error) {
            console.error("Error storing data:", error);
            throw error;
        }
    },
    getData: async (email) => {
        const query = `SELECT * FROM users WHERE email = $1`;
        try {
            const res = await pool.query(query, [email]);
            return res.rows[0];
        } catch (error) {
            console.error("Error retrieving data:", error);
            return null;
        }
    },
    isUserRegistered: async (email) => {
        const data = await userData.getData(email);
        return !!data;
    },
    deRegisterUser: async (email) => {
        const query = `DELETE FROM users WHERE email = $1`;
        try {
            await pool.query(query, [email]);
            return true;
        } catch (error) {
            console.error("Error deregistering user:", error);
            return false;
        }
    }
};

// ========== AUTH ROUTES ==========
app.post('/register', async (req, res) => {
    const { email, mobile, password, username } = req.body;
    try {
        if (await userData.isUserRegistered(email)) {
            return res.status(400).json({ error: 'User already registered' });
        }
        const data = { username, email, mobile, password };
        await userData.storeData(data);
        res.status(200).json({ message: 'User registered successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Error registering user' });
    }
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const data = await userData.getData(email);
        if (!data) {
            return res.status(400).json({ error: 'User does not exist. Please register first' });
        } else if (data.password !== password) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        res.status(200).json({
            message: "Login successful",
            data: data
        });
    } catch (error) {
        res.status(500).json({ error: 'Error during login' });
    }
});

// ========== FILE UPLOAD ROUTE ==========
app.post('/upload', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    const filePath = path.join(req.file.fieldname || 'images', req.file.filename);
    const imageUrl = getImageUrl(req, filePath);
    res.json({ imageUrl, filePath });
});

// ========== CATEGORIES ROUTES ==========
app.post('/categories', async (req, res) => {
    const { name, description, image_url } = req.body;
    const query = 'INSERT INTO categories (name, description, image_url) VALUES ($1, $2, $3) RETURNING *';
    const values = [name, description, image_url];
    try {
        const result = await pool.query(query, values);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("Error adding category:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/categories', async (req, res) => {
    try {
        const { location } = req.query;
        let query = 'SELECT * FROM categories';
        let params = [];
        
        if (location) {
            query += ' WHERE location = $1';
            params = [location];
        }
        
        const result = await pool.query(query, params);
        
        // Get app_status if location is provided
        let app_status = null;
        if (location) {
            const appStatusResult = await pool.query('SELECT app_status FROM locations WHERE name = $1', [location]);
            if (appStatusResult.rows.length > 0) {
                app_status = appStatusResult.rows[0].app_status;
            }
        }
        
        res.status(200).json({ body: result.rows, app_status });
    } catch (error) {
        console.error("Error fetching categories:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/add/categories', async (req, res) => {
    const { name, description, image_url, location } = req.body;
    const query = 'INSERT INTO categories (name, description, image_url, location) VALUES ($1, $2, $3, $4) RETURNING *';
    const values = [name, description, image_url, location];
    try {
        await pool.query(query, values);
        const result = await pool.query('SELECT * FROM categories');
        res.status(201).json({ message: "Category Added", body: result.rows });
    } catch (error) {
        console.error("Error adding category:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/put/categories', async (req, res) => {
    const { name, description, image_url, id, location, order, hide } = req.body;
    const query = 'UPDATE categories SET name = $1, description = $2, image_url = $3, location = $4, "order" = $6, hide = $7 WHERE id = $5 RETURNING *';
    const values = [name, description, image_url, location, id, parseInt(order), hide];
    try {
        const result = await pool.query(query, values);
        if (result.rows.length > 0) {
            res.status(200).json({ message: "Category Edited", body: result.rows[0] });
        } else {
            res.status(404).json({ error: 'Category not found' });
        }
    } catch (error) {
        console.error("Error updating category:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/delete/categories', async (req, res) => {
    const { id } = req.body;
    try {
        await pool.query('DELETE FROM wishlist WHERE item_id IN (SELECT id FROM items WHERE category_id = $1)', [id]);
        await pool.query('DELETE FROM items WHERE category_id = $1', [id]);
        const result = await pool.query('DELETE FROM categories WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length > 0) {
            const categories = await pool.query('SELECT * FROM categories');
            res.status(200).json({ message: "Category Deleted", body: categories.rows });
        } else {
            res.status(404).json({ error: 'Category not found' });
        }
    } catch (error) {
        console.error("Error deleting category:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/hideOrUnhide/categories', async (req, res) => {
    const { id, hide } = req.body;
    const query = 'UPDATE categories SET hide = $1 WHERE id = $2 RETURNING *';
    const values = [hide, id];
    try {
        const result = await pool.query(query, values);
        await pool.query('UPDATE items SET stock = $1 WHERE category_id = $2', [hide ? 'out-of-stock' : 'in-stock', id]);
        if (result.rows.length > 0) {
            res.status(200).json({ message: "Done", body: result.rows[0] });
        } else {
            res.status(404).json({ error: 'Category not found' });
        }
    } catch (error) {
        console.error("Error updating category:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/update/categories_order', async (req, res) => {
    const { order } = req.body;
    try {
        await pool.query('BEGIN');
        for (let i = 0; i < order.length; i++) {
            await pool.query('UPDATE categories SET "order" = $1 WHERE id = $2', [order[i].order, order[i].id]);
        }
        await pool.query('COMMIT');
        res.status(200).json({ message: "Categories Order Updated" });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Error updating categories order:', error);
        res.status(500).json({ error: 'Failed to update categories order' });
    }
});

app.post('/club/categories', async (req, res) => {
    const { categories, location } = req.body;
    try {
        await pool.query('INSERT INTO clubbed_categories (categories, location) VALUES ($1, $2)', [JSON.stringify(categories), location]);
        const result = await pool.query('SELECT * FROM clubbed_categories');
        res.status(201).json({ message: "Categories Clubbed", body: result.rows });
    } catch (error) {
        console.error("Error clubbing categories:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/clubbed/categories', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM clubbed_categories');
        res.status(200).json({ body: result.rows });
    } catch (error) {
        console.error("Error fetching clubbed categories:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/unclub/categories', async (req, res) => {
    const { id } = req.body;
    try {
        await pool.query('DELETE FROM clubbed_categories WHERE id = $1', [id]);
        const result = await pool.query('SELECT * FROM clubbed_categories');
        res.status(200).json({ message: "Categories Unclubbed", body: result.rows });
    } catch (error) {
        console.error("Error unclubbing categories:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ========== ITEMS ROUTES ==========
app.post('/post/items', async (req, res) => {
    const { name, image_url, description, category_id, stock, price_details, popular_item, new_arrival, location } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const insertItemResult = await client.query(`
            INSERT INTO items (name, image_url, description, category_id, stock, popular_item, new_arrival, location)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
        `, [name, image_url, description, category_id, stock, popular_item, new_arrival, location]);
        const itemId = insertItemResult.rows[0].id;
        for (const price of price_details) {
            await client.query(`
                INSERT INTO price_details (item_id, quantity, amount)
                VALUES ($1, $2, $3)
            `, [itemId, price.quantity, price.amount]);
        }
        await client.query('COMMIT');
        res.status(201).json({ message: 'Item added successfully' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error adding item:', error);
        res.status(500).json({ error: 'Failed to add item' });
    } finally {
        client.release();
    }
});

app.post('/get/items', async (req, res) => {
    try {
        const itemsResult = await pool.query(`
            SELECT i.id, i.name, i.image_url, i.description, i.stock, i.popular_item, i.new_arrival, i.location,
                   c.name AS category, 
                   json_agg(json_build_object('quantity', p.quantity, 'amount', p.amount)) AS price_details
            FROM items i
            JOIN categories c ON i.category_id = c.id
            LEFT JOIN price_details p ON i.id = p.item_id
            GROUP BY i.id, c.name
        `);
        res.status(200).json({ body: itemsResult.rows });
    } catch (error) {
        console.error('Error fetching items:', error);
        res.status(500).json({ error: 'Failed to fetch items' });
    }
});

app.post('/put/items', async (req, res) => {
    const { id, name, image_url, description, stock, price_details, popular_item, new_arrival, location } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`
            UPDATE items 
            SET name = $1, image_url = $2, description = $3, stock = $4, popular_item = $5, new_arrival = $6, location = $7
            WHERE id = $8
        `, [name, image_url, description, stock, popular_item, new_arrival, location, id]);
        await client.query('DELETE FROM price_details WHERE item_id = $1', [id]);
        for (const price of price_details) {
            await client.query(`
                INSERT INTO price_details (item_id, quantity, amount)
                VALUES ($1, $2, $3)
            `, [id, price.quantity, price.amount]);
        }
        await client.query('COMMIT');
        res.status(200).json({ message: 'Item updated successfully' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating item:', error);
        res.status(500).json({ error: 'Failed to update item' });
    } finally {
        client.release();
    }
});

app.post('/delete/items', async (req, res) => {
    const { id } = req.body;
    try {
        await pool.query('BEGIN');
        await pool.query('DELETE FROM items WHERE id = $1', [id]);
        await pool.query('DELETE FROM price_details WHERE item_id = $1', [id]);
        await pool.query('COMMIT');
        res.status(200).json({ message: 'Item deleted successfully' });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Error deleting item:', error);
        res.status(500).json({ error: 'Failed to delete item' });
    }
});

app.post('/get/items/category/categoryId', async (req, res) => {
    const { categoryId } = req.body;
    try {
        const itemsResult = await pool.query(`
            SELECT i.id, i.name, i.image_url, i.description, i.stock, i.popular_item, i.new_arrival,
                   json_agg(json_build_object('quantity', p.quantity, 'amount', p.amount)) AS price_details
            FROM items i
            JOIN price_details p ON i.id = p.item_id
            WHERE i.category_id = $1
            GROUP BY i.id
        `, [categoryId]);
        res.status(200).json({ body: itemsResult.rows });
    } catch (error) {
        console.error('Error fetching items:', error);
        res.status(500).json({ error: 'Failed to fetch items' });
    }
});

// ========== CART ROUTES ==========
app.post('/post/cart', async (req, res) => {
    const { user_id, item_id, quantity, amount, product_quantity, location } = req.body;
    try {
        const cartItems = await pool.query('SELECT DISTINCT item_id FROM cart WHERE user_id = $1', [user_id]);
        if (cartItems.rowCount > 0) {
            const existingItemIds = cartItems.rows.map(row => row.item_id);
            const categoryResult = await pool.query(
                'SELECT DISTINCT category_id FROM items WHERE id = ANY($1::int[])',
                [existingItemIds]
            );
            let currentCategoryId = await pool.query('SELECT category_id FROM items WHERE id = $1', [item_id]);
            currentCategoryId = currentCategoryId.rows[0].category_id;
            const categoryIds = categoryResult.rows.map(row => row.category_id);
            const clubbedCategoryResult = await pool.query(
                'SELECT categories FROM clubbed_categories WHERE location = $1',
                [location]
            );
            const clubbedCategorySets = clubbedCategoryResult.rows.map(row => JSON.parse(row.categories));
            const existingClub = clubbedCategorySets.find(set => set.includes(categoryIds[0]));
            const currentCategoryClub = clubbedCategorySets.find(set => set.includes(currentCategoryId));
            if((existingClub && !existingClub.includes(currentCategoryId)) || (!existingClub && currentCategoryClub)) {
                return res.status(400).json({ error: 'Items from different categories cannot be clubbed.' });
            }
        }
        const query = `
            INSERT INTO cart (user_id, item_id, quantity, amount, product_quantity)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;
        const values = [user_id, item_id, quantity, amount, product_quantity];
        const result = await pool.query(query, values);
        res.status(201).json({ body: result.rows[0] });
    } catch (error) {
        console.error('Error adding item to cart:', error);
        res.status(500).json({ error: 'Failed to add item to cart' });
    }
});

app.post('/clear/post/cart', async (req, res) => {
    const { user_id, item_id, quantity, amount, product_quantity } = req.body;
    try {
        await pool.query('DELETE FROM cart WHERE user_id = $1', [user_id]);
        const query = `
            INSERT INTO cart (user_id, item_id, quantity, amount, product_quantity)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;
        const values = [user_id, item_id, quantity, amount, product_quantity];
        await pool.query(query, values);
        const result = await pool.query('SELECT * FROM cart WHERE user_id = $1', [user_id]);
        res.status(201).json({ body: result.rows });
    } catch (error) {
        console.error('Error adding item to cart:', error);
        res.status(500).json({ error: 'Failed to add item to cart' });
    }
});

app.post('/get/cart', async (req, res) => {
    const { userId, location } = req.body;
    try {
        const app_status = await pool.query('SELECT app_status FROM locations WHERE name = $1', [location]);
        const query = `
            SELECT 
                c.id,
                c.item_id,
                i.name,
                i.image_url,
                c.quantity,
                c.amount,
                i.stock,
                c.product_quantity AS price_quantity
            FROM 
                cart c
            JOIN 
                items i ON c.item_id = i.id
            WHERE 
                c.user_id = $1
        `;
        const result = await pool.query(query, [userId]);
        const wallet = await pool.query('SELECT wallet FROM users WHERE id = $1', [userId]);
        res.status(200).json({
            body: result.rows,
            app_status: app_status.rows[0]?.app_status,
            wallet: wallet.rows[0]?.wallet
        });
    } catch (error) {
        console.error('Error fetching cart items:', error);
        res.status(500).json({ error: 'Failed to fetch cart items' });
    }
});

app.post('/delete/cart', async (req, res) => {
    const { id } = req.body;
    try {
        const query = 'DELETE FROM cart WHERE item_id = $1 RETURNING *';
        const result = await pool.query(query, [id]);
        if (result.rows.length > 0) {
            res.status(200).json({ message: 'Item removed from cart' });
        } else {
            res.status(404).json({ error: 'Cart item not found' });
        }
    } catch (error) {
        console.error('Error removing item from cart:', error);
        res.status(500).json({ error: 'Failed to remove item from cart' });
    }
});

app.post('/clear/cart', async (req, res) => {
    const { userId } = req.body;
    try {
        await pool.query('DELETE FROM cart WHERE user_id = $1', [userId]);
        res.status(200).json({ message: 'Cart cleared' });
    } catch (error) {
        console.error('Error clearing cart:', error);
        res.status(500).json({ error: 'Failed to clear cart' });
    }
});

app.post('/put/cart', async (req, res) => {
    const { itemId, quantity, amount, user_id, product_quantity } = req.body;
    try {
        const query = `
            UPDATE cart
            SET quantity = $1, amount = $2, product_quantity = $3
            WHERE user_id = $4 AND item_id = $5
            RETURNING *
        `;
        const values = [quantity, amount, product_quantity, user_id, itemId];
        const result = await pool.query(query, values);
        if (result.rows.length > 0) {
            res.status(200).json({ body: result.rows[0] });
        } else {
            res.status(404).json({ error: 'Cart item not found' });
        }
    } catch (error) {
        console.error('Error updating cart item:', error);
        res.status(500).json({ error: 'Failed to update cart item' });
    }
});

// ========== ORDERS ROUTES ==========
app.post('/post/orders', async (req, res) => {
    const { user_id, address, phone_number, payment_method, items, selectedTimeSlot, instructions, useWallet } = req.body;
    if (!user_id || !address || !phone_number || !payment_method || !items) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    let payment_status;
    if (payment_method !== 'cod') {
        payment_status = true;
    } else {
        payment_status = 'pending';
    }
    try {
        await pool.query('BEGIN');
        const orderResult = await pool.query(
            'INSERT INTO orders (user_id, address, phone_number, payment_method, order_status, payment_status, selected_timeslot, instructions) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
            [user_id, address, phone_number, payment_method, "placed", payment_status, selectedTimeSlot, instructions]
        );
        const orderId = orderResult.rows[0].id;
        for (const item of items) {
            await pool.query(
                'INSERT INTO order_items (order_id, item_id, quantity, price, product_quantity) VALUES ($1, $2, $3, $4, $5)',
                [orderId, item.item_id, item.quantity, item.amount, item.price_quantity]
            );
        }
        await pool.query('DELETE FROM cart WHERE user_id = $1', [user_id]);
        if(useWallet) {
            await pool.query('UPDATE users SET wallet = $1 WHERE id = $2', [0, user_id]);
        }
        await pool.query('COMMIT');
        res.status(200).json({ message: 'Order placed successfully!' });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Error processing order:', error);
        res.status(500).json({ error: 'Failed to process order' });
    }
});

app.post('/get/orders', async (req, res) => {
    try {
        const query = `SELECT * FROM orders`;
        const result = await pool.query(query);
        let order_items = result.rows;
        order_items = await Promise.all(order_items.map(async (row) => {
            const itemsResult = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [row.id]);
            const items = itemsResult.rows;
            const detailedItems = await Promise.all(items.map(async (item) => {
                try {
                    const itemDetailsResult = await pool.query(`
                        SELECT items.name, items.image_url 
                        FROM items 
                        WHERE items.id = $1
                    `, [item.item_id]);
                    let itemDetails;
                    if (itemDetailsResult.rows.length === 0) {
                        console.warn(`Item with ID ${item.item_id} was deleted.`);
                        itemDetails = { name: 'Deleted item', image_url: null };
                    } else {
                        itemDetails = itemDetailsResult.rows[0];
                    }
                    return {
                        ...item,
                        item_name: itemDetails.name,
                        image_url: itemDetails.image_url
                    };
                } catch (err) {
                    console.error(`Error fetching details for item ID ${item.item_id}:`, err);
                    return null;
                }
            }));
            const filteredItems = detailedItems.filter(item => item !== null);
            const usernameResult = await pool.query('SELECT username FROM users WHERE id = $1', [row.user_id]);
            const username = usernameResult.rows.length > 0 ? usernameResult.rows[0].username : null;
            const otpResult = await pool.query('SELECT otp FROM delivery WHERE order_id = $1', [row.id]);
            const otp = otpResult.rows.length > 0 ? otpResult.rows[0].otp : null;
            return {
                ...row,
                username,
                order_items: filteredItems,
                otp
            };
        }));
        res.status(200).json({ body: order_items });
    } catch (error) {
        console.error('Error fetching order items:', error);
        res.status(500).json({ error: 'Failed to fetch order items' });
    }
});

app.post('/change/order_status', async (req, res) => {
    const { order_id, status, delivery_partner_id, otp } = req.body;
    try {
        const query = `UPDATE orders SET order_status = $1 WHERE id = $2`;
        await pool.query(query, [status, order_id]);
        if (delivery_partner_id) {
            const del_query = `INSERT INTO delivery (order_id, delivery_partner_id, otp) VALUES ($1, $2, $3)`;
            await pool.query(del_query, [order_id, delivery_partner_id, otp]);
        }
        const selectQuery = `SELECT * FROM orders`;
        const result = await pool.query(selectQuery);
        let order_items = result.rows;
        order_items = await Promise.all(order_items.map(async (row) => {
            const itemsResult = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [row.id]);
            const items = itemsResult.rows;
            const detailedItems = await Promise.all(items.map(async (item) => {
                try {
                    const itemDetailsResult = await pool.query(`
                        SELECT items.name, items.image_url
                        FROM items 
                        WHERE items.id = $1
                    `, [item.item_id]);
                    let itemDetails;
                    if (itemDetailsResult.rows.length === 0) {
                        console.warn(`Item with ID ${item.item_id} was deleted.`);
                        itemDetails = { name: 'Deleted item', image_url: null };
                    } else {
                        itemDetails = itemDetailsResult.rows[0];
                    }
                    return {
                        ...item,
                        item_name: itemDetails.name,
                        image_url: itemDetails.image_url
                    };
                } catch (err) {
                    console.error(`Error fetching details for item ID ${item.item_id}:`, err);
                    return null;
                }
            }));
            const filteredItems = detailedItems.filter(item => item !== null);
            const otpResult = await pool.query('SELECT otp FROM delivery WHERE order_id = $1', [row.id]);
            const otp = otpResult.rows.length > 0 ? otpResult.rows[0].otp : null;
            return {
                ...row,
                order_items: filteredItems,
                otp
            };
        }));
        res.status(200).json({ body: order_items });
    } catch (error) {
        console.error('Error fetching order items:', error);
        res.status(500).json({ error: 'Failed to fetch order items' });
    }
});

app.post('/get/purchases', async (req, res) => {
    const { userId } = req.body;
    try {
        const contact_admin = await pool.query('SELECT * FROM contact_details WHERE key = $1', ['phone']);
        const result = await pool.query('SELECT * FROM orders WHERE user_id = $1', [userId]);
        let order_items = result.rows;
        order_items = await Promise.all(order_items.map(async (row) => {
            const itemsResult = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [row.id]);
            const items = itemsResult.rows;
            const detailedItems = await Promise.all(items.map(async (item) => {
                try {
                    const itemDetailsResult = await pool.query('SELECT name, image_url FROM items WHERE id = $1', [item.item_id]);
                    let itemDetails;
                    if (itemDetailsResult.rows.length === 0) {
                        console.warn(`Item with ID ${item.item_id} was deleted.`);
                        itemDetails = { name: 'Deleted item', image_url: null };
                    } else {
                        itemDetails = itemDetailsResult.rows[0];
                    }
                    return {
                        ...item,
                        item_name: itemDetails.name,
                        image_url: itemDetails.image_url
                    };
                } catch (err) {
                    console.error(`Error fetching details for item ID ${item.item_id}:`, err);
                    return null;
                }
            }));
            const filteredItems = detailedItems.filter(item => item !== null);
            const otpResult = await pool.query('SELECT otp FROM delivery WHERE order_id = $1', [row.id]);
            const otp = otpResult.rows.length > 0 ? otpResult.rows[0].otp : null;
            return {
                ...row,
                order_items: filteredItems,
                contact_admin: contact_admin.rows[0]?.value,
                otp
            };
        }));
        res.status(200).json({ body: order_items });
    } catch (error) {
        console.error("Error fetching purchases and OTP:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ========== DELIVERY FEE ROUTES ==========
app.post('/get/delivery_fee', async (req, res) => {
    const { city } = req.body;
    try {
        const result = await pool.query('SELECT * FROM delivery_fee WHERE location = $1', [city]);
        res.status(200).json({ body: result.rows });
    } catch (error) {
        console.error("Error fetching delivery_fee:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/add/delivery_fee', async (req, res) => {
    const { city, delivery_fee, location } = req.body;
    try {
        await pool.query('INSERT INTO delivery_fee (area_name, delivery_fee, location) values($1, $2, $3)', [city, delivery_fee, location]);
        const result = await pool.query('SELECT * FROM delivery_fee');
        res.status(200).json({ body: result.rows });
    } catch (error) {
        console.error("Error inserting delivery_fee:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/update/delivery_fee', async (req, res) => {
    const { area_name, delivery_fee } = req.body.areaDetails;
    const { area_id } = req.body;
    if (!area_name || !delivery_fee) {
        return res.status(400).json({ error: 'Area name and delivery fee are required' });
    }
    try {
        const query = 'UPDATE delivery_fee SET area_name = $1, delivery_fee = $2 WHERE area_id = $3';
        await pool.query(query, [area_name.trim(), delivery_fee.trim(), area_id]);
        const result = await pool.query('SELECT * FROM delivery_fee');
        res.status(200).json({ message: 'Area details updated', body: result.rows });
    } catch (error) {
        console.error("Error updating delivery_fee:", error);
        res.status(500).json({ error: 'Error updating area details' });
    }
});

app.post('/get/delivery_charges', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM delivery_fee');
        res.status(200).json({ body: result.rows });
    } catch (error) {
        console.error("Error fetching delivery_fees:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/delete/delivery_charges', async (req, res) => {
    const { area_id } = req.body;
    try {
        await pool.query('DELETE FROM delivery_fee WHERE area_id = $1', [area_id]);
        const result = await pool.query('SELECT * FROM delivery_fee');
        res.status(200).json({ message: "Area deleted", body: result.rows });
    } catch (error) {
        console.error("Error deleting delivery_fees:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ========== WISHLIST ROUTES ==========
app.post('/get/wishlist', async (req, res) => {
    const { user_id } = req.body;
    try {
        const result = await pool.query(`SELECT i.id, 
            i.name, 
            i.image_url, 
            i.description, 
            i.stock, 
            i.popular_item, 
            i.new_arrival, 
            c.name AS category, 
            json_agg(json_build_object('quantity', p.quantity, 'amount', p.amount)) AS price_details
        FROM wishlist w
        JOIN items i ON w.item_id = i.id 
        JOIN categories c ON i.category_id = c.id
        LEFT JOIN price_details p ON i.id = p.item_id
        WHERE w.user_id = $1
        GROUP BY i.id, c.name;
        `, [user_id]);
        res.status(200).json({ body: result.rows });
    } catch (error) {
        console.error("Error fetching wishlist:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/add/wishlist', async (req, res) => {
    const { user_id, item_id } = req.body;
    try {
        const result = await pool.query('INSERT INTO wishlist (user_id, item_id) VALUES ($1, $2) RETURNING *;', [user_id, item_id]);
        res.status(200).json({ body: result.rows[0] });
    } catch (error) {
        console.error("Error adding to wishlist:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/delete/wishlist', async (req, res) => {
    const { user_id, item_id } = req.body;
    try {
        const result = await pool.query('DELETE FROM wishlist WHERE user_id = $1 AND item_id = $2 RETURNING *;', [user_id, item_id]);
        res.status(200).json({ body: result.rows[0] });
    } catch (error) {
        console.error("Error deleting from wishlist:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ========== LOCATIONS ROUTES ==========
app.post('/delete/location', async (req, res) => {
    const { id } = req.body;
    try {
        const result = await pool.query('DELETE FROM locations WHERE id = $1 RETURNING *;', [id]);
        const location = result.rows[0].name;
        await pool.query('DELETE FROM delivery_fee WHERE location = $1', [location]);
        await pool.query('DELETE FROM clubbed_categories WHERE location = $1', [location]);
        await pool.query('DELETE FROM items WHERE location = $1', [location]);
        await pool.query('DELETE FROM categories WHERE location = $1', [location]);
        res.status(200).json({ message: "Location Deleted", body: result.rows[0] });
    } catch (error) {
        console.error("Error deleting locations:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/add/location', async (req, res) => {
    const { name } = req.body;
    try {
        const result = await pool.query('INSERT INTO locations (name) VALUES ($1) RETURNING *', [name]);
        res.status(200).json({ message: "Location Added", body: result.rows[0] });
    } catch (error) {
        console.error("Error adding locations:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/get/location', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM locations');
        res.status(200).json({ body: result.rows });
    } catch (error) {
        console.error("Error fetching locations:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/put/app_status', async (req, res) => {
    const { app_status, location } = req.body;
    try {
        await pool.query('UPDATE locations SET app_status = $1 WHERE name = $2', [app_status, location]);
        res.status(200).json({ message: "App status updated" });
    } catch (error) {
        console.error("Error updating app status:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ========== TIME SLOTS ROUTES ==========
app.post('/get/time_slots', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM time_slots');
        res.status(200).json({ body: result.rows });
    } catch (error) {
        console.error("Error fetching time slots:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/add/time_slot', async (req, res) => {
    const { time_slot } = req.body;
    try {
        await pool.query('INSERT INTO time_slots (from_time, to_time) VALUES ($1, $2) RETURNING *;', [time_slot.from, time_slot.to]);
        const result = await pool.query('SELECT * FROM time_slots');
        res.status(200).json({ message: "Time Slot Added", body: result.rows });
    } catch (error) {
        console.error("Error adding time slot:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/delete/time_slot', async (req, res) => {
    const { id } = req.body;
    try {
        await pool.query('DELETE FROM time_slots WHERE id = $1 RETURNING *;', [id]);
        const result = await pool.query('SELECT * FROM time_slots');
        res.status(200).json({ message: "Time Slot Deleted", body: result.rows });
    } catch (error) {
        console.error("Error deleting time slot:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ========== WALLET ROUTES ==========
app.post('/add/wallet', async (req, res) => {
    const { users, amount } = req.body;
    try {
        await pool.query('BEGIN');
        for (const user of users) {
            await pool.query('UPDATE users SET wallet = wallet + $1 WHERE email = $2', [amount, user]);
        }
        await pool.query('COMMIT');
        res.status(200).json({ message: 'Wallets added successfully' });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Error adding wallets:', error);
        res.status(500).json({ error: 'Failed to add wallets' });
    }
});

app.post('/remove/wallet', async (req, res) => {
    const { users } = req.body;
    try {
        await pool.query('BEGIN');
        for (const user of users) {
            await pool.query('UPDATE users SET wallet = $1 WHERE email = $2', [0, user]);
        }
        await pool.query('COMMIT');
        res.status(200).json({ message: 'Wallets removed successfully' });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Error removing wallets:', error);
        res.status(500).json({ error: 'Failed to remove wallets' });
    }
});

app.post('/update/wallet', async (req, res) => {
    const { email, amount } = req.body;
    try {
        await pool.query('UPDATE users SET wallet = $1 WHERE id = $2', [amount, email]);
        res.status(200).json({ message: 'Wallet updated successfully' });
    } catch (error) {
        console.error('Error updating wallet:', error);
        res.status(500).json({ error: 'Failed to update wallet' });
    }
});

// ========== PROMO CODES ROUTES ==========
app.post('/get/promo-codes', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM promo_codes');
        res.status(200).json({ body: result.rows });
    } catch (error) {
        console.error('Error fetching promo codes:', error);
        res.status(500).json({ error: 'Failed to fetch promo codes' });
    }
});

app.post('/add/promo-code', async (req, res) => {
    const { code, discount, discount_type } = req.body;
    try {
        let result = await pool.query('INSERT INTO promo_codes (code, discount, discount_type) VALUES ($1, $2, $3) RETURNING *', [code, discount, discount_type]);
        res.status(200).json({ message: 'Promo code added successfully', result: result });
    } catch (error) {
        console.error('Error adding promo code:', error);
        res.status(500).json({ error: 'Failed to add promo code' });
    }
});

app.post('/delete/promo-code', async (req, res) => {
    const { codeIds } = req.body;
    try {
        await pool.query('DELETE FROM promo_codes WHERE id = ANY($1::int[])', [codeIds]);
        res.status(200).json({ message: 'Promo code deleted successfully' });
    } catch (error) {
        console.error('Error deleting promo code:', error);
        res.status(500).json({ error: 'Failed to delete promo code' });
    }
});

app.post('/get/promo-code', async (req, res) => {
    const { code } = req.body;
    try {
        const result = await pool.query('SELECT * FROM promo_codes WHERE code = $1', [code]);
        res.status(200).json({ body: result.rows });
    } catch (error) {
        console.error('Error fetching promo code:', error);
        res.status(500).json({ error: 'Failed to fetch promo code' });
    }
});

// ========== USER MANAGEMENT ROUTES ==========
app.post('/delete/user', async (req, res) => {
    const { id } = req.body;
    try {
        const result = await pool.query('DELETE FROM users WHERE id = $1', [id]);
        res.status(200).json({ message: 'User Deleted', body: result.rows });
    } catch (error) {
        res.status(500).json({ error: 'Error while deleting users' });
    }
});

app.post('/get/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users');
        res.status(200).json({ body: result.rows });
    } catch (error) {
        res.status(500).json({ error: 'Error while fetching users' });
    }
});

app.post('/get/delivers', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM delivery');
        res.status(200).json({ body: result.rows });
    } catch (error) {
        res.status(500).json({ error: 'Error while fetching users' });
    }
});

app.post('/verify/otp', async (req, res) => {
    const { order_id, otp } = req.body;
    try {
        const result = await pool.query('SELECT otp FROM delivery WHERE order_id = $1', [order_id]);
        if (result.rows.length > 0) {
            const storedOtp = result.rows[0].otp;
            if (storedOtp === otp) {
                res.status(200).json({ message: 'OTP verified successfully', success: true });
            } else {
                res.status(400).json({ error: 'Invalid OTP', success: false });
            }
        } else {
            res.status(404).json({ error: 'Order not found', success: false });
        }
    } catch (error) {
        res.status(500).json({ error: 'Error while verifying OTP', success: false });
    }
});

app.post('/contact/details', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM contact_details');
        res.status(200).json({ body: result.rows });
    } catch (error) {
        res.status(500).json({ error: 'Error while fetching details' });
    }
});

app.post('/update/details', async (req, res) => {
    const details = req.body.details;
    const keys = Object.keys(details);
    if (keys.length === 0) {
        return res.status(400).json({ error: 'No details provided to update' });
    }
    try {
        for (const key of keys) {
            const value = details[key];
            await pool.query(
                'UPDATE contact_details SET value = $1 WHERE key = $2',
                [value.trim(), key.trim()]
            );
        }
        res.status(200).json({ message: 'Details updated' });
    } catch (error) {
        console.error("Error while updating details:", error);
        res.status(500).json({ error: 'Error while updating details' });
    }
});

app.post('/change/roles', async (req, res) => {
    const { role, value, id } = req.body;
    try {
        let queryStr = '';
        if (role === "admin") {
            queryStr = 'UPDATE users SET admin = $1 WHERE id = $2 RETURNING *';
        } else {
            queryStr = 'UPDATE users SET delivery_partner = $1 WHERE id = $2 RETURNING *';
        }
        const result = await pool.query(queryStr, [value, id]);
        res.status(200).json({ message: 'User role updated', body: result.rows });
    } catch (error) {
        res.status(500).json({ error: 'Error while fetching users' });
    }
});

app.post('/get/user-detail', async (req, res) => {
    const { email } = req.body;
    try {
        const data = await userData.getData(email);
        if (!data) {
            return res.status(400).json({ error: 'User does not exist. Please register first' });
        }
        res.status(200).json({
            message: "User data found",
            data: data
        });
    } catch (error) {
        res.status(500).json({ error: 'Error during login' });
    }
});

// ========== COMPATIBILITY ROUTE (for Lambda-style requests) ==========
// This route handles the old Lambda-style POST requests with path in body
app.post('/', async (req, res) => {
    const { path } = req.body;
    // Redirect to appropriate route based on path
    // This maintains backward compatibility
    res.status(404).json({ error: 'Please use the new API endpoints. See documentation.' });
});

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

