const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(express.json());
app.use(cors());

const pool = new Pool({
    user: 'shibina',
    host: 'localhost',
    database: 'mydb',
    password: '12345',
    port: 5432,
});

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
}

// user login
app.post('/register', async (req, res) => {
    const { email, mobile, password, username } = req.body;
    try {
        if (await userData.isUserRegistered(email)) {
            return res.status(400).json({ error: 'User already registered' });
        }

        const data = {
            username: username,
            email: email,
            mobile: mobile,
            password: password
        };

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
        } else if(data.password !== password) {
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

// categories
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
        const result = await pool.query('SELECT * FROM categories');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error("Error fetching categories:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.put('/categories/:id', async (req, res) => {
    const { id } = req.params;
    const { name, description, image_url } = req.body;
    const query = 'UPDATE categories SET name = $1, description = $2, image_url = $3 WHERE id = $4 RETURNING *';
    const values = [name, description, image_url, id];

    try {
        const result = await pool.query(query, values);
        if (result.rows.length > 0) {
            res.status(200).json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'Category not found' });
        }
    } catch (error) {
        console.error("Error updating category:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/categories/:id', async (req, res) => {
    const { id } = req.params;
    const query = 'DELETE FROM categories WHERE id = $1 RETURNING *';
    const values = [id];

    try {
        const result = await pool.query(query, values);
        if (result.rows.length > 0) {
            res.status(200).json({ message: 'Category deleted successfully' });
        } else {
            res.status(404).json({ error: 'Category not found' });
        }
    } catch (error) {
        console.error("Error deleting category:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

//items 
app.post('/items', async (req, res) => {
    const { name, image_url, description, category_id, stock, price_details, popular_item, new_arrival } = req.body;
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const insertItemResult = await client.query(`
            INSERT INTO items (name, image_url, description, category_id, stock, popular_item, new_arrival)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
        `, [name, image_url, description, category_id, stock, popular_item, new_arrival]);
        
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

app.get('/items', async (req, res) => {
    try {
        const itemsResult = await pool.query(`
            SELECT i.id, i.name, i.image_url, i.description, i.stock, i.popular_item, i.new_arrival,
                   c.name AS category, 
                   json_agg(json_build_object('quantity', p.quantity, 'amount', p.amount)) AS price_details
            FROM items i
            JOIN categories c ON i.category_id = c.id
            LEFT JOIN price_details p ON i.id = p.item_id
            GROUP BY i.id, c.name
        `);

        res.status(200).json(itemsResult.rows);
    } catch (error) {
        console.error('Error fetching items:', error);
        res.status(500).json({ error: 'Failed to fetch items' });
    }
});

app.put('/items/:id', async (req, res) => {
    const { id } = req.params;
    const { name, image_url, description, stock, price_details, popular_item, new_arrival } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        await client.query(`
            UPDATE items 
            SET name = $1, image_url = $2, description = $3, stock = $4, popular_item = $5, new_arrival = $6
            WHERE id = $7
        `, [name, image_url, description, stock, popular_item, new_arrival, id]);
        
        await client.query(`
            DELETE FROM price_details WHERE item_id = $1
        `, [id]);
        
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

app.delete('/items/:id', async (req, res) => {
    const { id } = req.params;

    try {
        await pool.query('BEGIN');
        
        await pool.query(`
            DELETE FROM items WHERE id = $1
        `, [id]);
        
        await pool.query(`
            DELETE FROM price_details WHERE item_id = $1
        `, [id]);
        
        await pool.query('COMMIT');
        res.status(200).json({ message: 'Item deleted successfully' });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Error deleting item:', error);
        res.status(500).json({ error: 'Failed to delete item' });
    }
});

// fetch items by category
app.get('/items/category/:categoryId', async (req, res) => {
    const { categoryId } = req.params;

    try {
        const itemsResult = await pool.query(`
            SELECT i.id, i.name, i.image_url, i.description, i.stock, i.popular_item, i.new_arrival,
                   json_agg(json_build_object('quantity', p.quantity, 'amount', p.amount)) AS price_details
            FROM items i
            JOIN price_details p ON i.id = p.item_id
            WHERE i.category_id = $1
            GROUP BY i.id
        `, [categoryId]);
        
        res.status(200).json(itemsResult.rows);
    } catch (error) {
        console.error('Error fetching items:', error);
        res.status(500).json({ error: 'Failed to fetch items' });
    }
});

// cart 
app.post('/cart', async (req, res) => {
    const { user_id, item_id, quantity, amount } = req.body;

    try {
        const query = `
            INSERT INTO cart (user_id, item_id, quantity, amount)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;
        const values = [user_id, item_id, quantity, amount];
        const result = await pool.query(query, values);
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error adding item to cart:', error);
        res.status(500).json({ error: 'Failed to add item to cart' });
    }
});

app.get('/cart/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        const query = `
            SELECT c.id, c.item_id, i.name, i.image_url, c.quantity, c.amount
            FROM cart c
            JOIN items i ON c.item_id = i.id
            WHERE c.user_id = $1
        `;
        const result = await pool.query(query, [userId]);
        
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching cart items:', error);
        res.status(500).json({ error: 'Failed to fetch cart items' });
    }
});

app.put('/cart/:id', async (req, res) => {
    const { id } = req.params;
    const { quantity, amount, user_id } = req.body;

    try {
        const query = `
            UPDATE cart
            SET quantity = $1, amount = $2
            WHERE user_id = $3 AND item_id = $4
            RETURNING *
        `;
        const values = [quantity, amount, user_id, id];
        const result = await pool.query(query, values);
        
        if (result.rows.length > 0) {
            res.status(200).json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'Cart item not found' });
        }
    } catch (error) {
        console.error('Error updating cart item:', error);
        res.status(500).json({ error: 'Failed to update cart item' });
    }
});

app.delete('/cart/:id', async (req, res) => {
    const { id } = req.params;
    const { user_id } = req.body;

    try {
        const query = `
            DELETE FROM cart
            WHERE user_id = $1 and item_id = $2
            RETURNING *
        `;
        const result = await pool.query(query, [user_id, id]);
        
        if (result.rows.length > 0) {
            res.status(200).json({ message: 'Cart item deleted successfully' });
        } else {
            res.status(404).json({ error: 'Cart item not found' });
        }
    } catch (error) {
        console.error('Error deleting cart item:', error);
        res.status(500).json({ error: 'Failed to delete cart item' });
    }
});

// order
app.post('/orders', async (req, res) => {
    const { user_id, address, phone_number, payment_method, items } = req.body;

    if (!user_id || !address || !phone_number || !payment_method || !items) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        await pool.query('BEGIN');

        const orderResult = await pool.query(
            'INSERT INTO orders (user_id, address, phone_number, payment_method) VALUES ($1, $2, $3, $4) RETURNING id',
            [user_id, address, phone_number, payment_method]
        );
        const orderId = orderResult.rows[0].id;

        for (const item of items) {            
            await pool.query(
                'INSERT INTO order_items (order_id, item_id, quantity, price) VALUES ($1, $2, $3, $4)',
                [orderId, item.item_id, item.quantity, item.amount]
            );
        }

        await pool.query(
            'DELETE FROM cart WHERE user_id = $1',
            [user_id]
        );

        await pool.query('COMMIT');

        if (payment_method !== 'cod') {
            // Here you'd redirect to payment gateway or generate a payment URL
            const paymentUrl = 'https://example.com/payment'; // Placeholder URL
            res.json({ paymentUrl });
        } else {
            res.json({ message: 'Order placed successfully!' });
        }
    } catch (error) {
        // Rollback transaction on error
        await pool.query('ROLLBACK');
        console.error('Error processing order:', error);
        res.status(500).json({ error: 'Failed to process order' });
    }
});


// for lambda deployment
// exports.handler = serverless(app);

// for local deployment
app.listen(3001, () => console.log('Local app listening on port 3001!'));
