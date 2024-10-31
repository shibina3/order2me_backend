const { Pool } = require('pg');

const pool = new Pool({
    user: 'shibina',
    host: 'database-1.c5c4wam0egxq.us-east-1.rds.amazonaws.com',
    database: 'order2me',
    password: 'ramyasil2024',
    port: 5432,
    ssl: {
        rejectUnauthorized: false
    }
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

exports.handler = async (event) => {
    let client = await pool.connect();
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',  // Allow all origins, or specify a domain
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
    try {
        const body = event ? event : null;   
        if(body.path === "/register") {
            const { email, mobile, password, username } = body;
            try {
                if (await userData.isUserRegistered(email)) {
                    return {
                        statusCode: 200,
                        headers,
                        body: JSON.stringify({ error: 'User already registered' }),
                    };
                }
        
                const data = {
                    username: username,
                    email: email,
                    mobile: mobile,
                    password: password
                };
        
                await userData.storeData(data);
        
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ message: 'User registered successfully' }),
                };
            } catch (error) {
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({ error: 'Error registering user' }),
                };
            }
        } else if(body.path === "/login") {
            const { email, password } = body;
            try {
                const data = await userData.getData(email);
        
                if (!data) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ error: 'User does not exist. Please register first' }),
                    };
                } else if(data.password !== password) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ error: 'Invalid credentials' }),
                    };
                }
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        message: "Login successful",
                        data: data
                    }),
                };
            } catch (error) {
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({ error: 'Error during login' }),
                };
            }
        } else if(body.path === "/delete/user") {
            const { id } = body;
            try {
                const result = await pool.query('DELETE FROM users WHERE id = $1',[id]);
        
                return {
                    statusCode: 200,
                    message: 'User Deleted',
                    body: JSON.stringify(result.rows),
                };
            } catch (error) {
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Error while deleting users' }),
                };
            }
        } else if(body.path === "/get/users") {
            try {
                const result = await pool.query('SELECT * FROM users');
        
                return {
                    statusCode: 200,
                    body: JSON.stringify(result.rows),
                };
            } catch (error) {
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Error while fetching users' }),
                };
            }
        } else if(body.path === "/get/delivers") {
            try {
                const result = await pool.query('SELECT * FROM delivery');
        
                return {
                    statusCode: 200,
                    body: JSON.stringify(result.rows),
                };
            } catch (error) {
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Error while fetching users' }),
                };
            }
        } else if (body.path === "/verify/otp") {
            const { order_id, otp } = body;
            try {
                const result = await pool.query('SELECT otp FROM delivery WHERE order_id = $1', [order_id]);
                
                if (result.rows.length > 0) {
                    const storedOtp = result.rows[0].otp;
                    
                    if (storedOtp === otp) {
                        return {
                            statusCode: 200,
                            body: JSON.stringify({ message: 'OTP verified successfully', success: true }),
                        };
                    } else {
                        return {
                            statusCode: 400,
                            body: JSON.stringify({ error: 'Invalid OTP', success: false }),
                        };
                    }
                } else {
                    return {
                        statusCode: 404,
                        body: JSON.stringify({ error: 'Order not found', success: false }),
                    };
                }
            } catch (error) {
                // Error handling
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Error while verifying OTP', success: false }),
                };
            }
        } else if(body.path === "/contact/details") {
            try {
                const result = await pool.query('SELECT * FROM contact_details');
        
                return {
                    statusCode: 200,
                    body: JSON.stringify(result.rows),
                };
            } catch (error) {
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Error while fetching details' }),
                };
            }
        } else if(body.path === "/update/details") {
            const details = body.details; 
            const keys = Object.keys(details);
            
            if (keys.length === 0) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: 'No details provided to update' }),
                };
            }
        
            try {
                for (const key of keys) {
                    const value = details[key];
        
                    await pool.query(
                        'UPDATE contact_details SET value = $1 WHERE key = $2',
                        [value.trim(), key.trim()]
                    );
                }
        
                return {
                    statusCode: 200,
                    message: 'Details updated'
                };
        
            } catch (error) {
                console.error("Error while updating details:", error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Error while updating details' }),
                };
            }
        }
        else if(body.path === "/change/roles") {
            const {role, value, id} = body;
            try {
                let queryStr = ''
                if(role === "admin") {
                    queryStr = 'UPDATE users SET admin = $1 WHERE id = $2 RETURNING *';
                } else {
                    queryStr = 'UPDATE users SET delivery_partner = $1 WHERE id = $2 RETURNING *';
                }
                const result = await pool.query(queryStr,[value, id]);
        
                return {
                    statusCode: 200,
                    message: 'User role updated',
                    body: JSON.stringify(result.rows),
                };
            } catch (error) {
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Error while fetching users' }),
                };
            }
        } else if(body.path === "/get/user-detail") {
            const { email } = body;
            try {
                const data = await userData.getData(email);
        
                if (!data) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ error: 'User does not exist. Please register first' }),
                    };
                }
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        message: "User data found",
                        data: data
                    }),
                };
            } catch (error) {
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({ error: 'Error during login' }),
                };
            }
        } else if(body.path === "/post/categories") {
            const { name, description, image_url } = body;
            const query = 'INSERT INTO categories (name, description, image_url) VALUES ($1, $2, $3) RETURNING *';
            const values = [name, description, image_url];
        
            try {
                const result = await pool.query(query, values);
                return {
                    statusCode: 201,
                    body: JSON.stringify(result.rows[0]),
                };
            } catch (error) {
                console.error("Error adding category:", error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Internal server error' }),
                };
            }
        } else if(body.path === "/get/categories") {
            try {
                const result = await pool.query('SELECT * FROM categories');
                return {
                    statusCode: 200,
                    body: JSON.stringify(result.rows),
                };
            } catch (error) {
                console.error("Error fetching categories:", error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Internal server error' }),
                };
            }
        } else if (body.path === "/add/categories") {
            const { name, description, image_url, location } = body;
            const query = 'INSERT INTO categories (name, description, image_url, location) VALUES ($1, $2, $3, $4) RETURNING *';
            const values = [name, description, image_url, location];
            
            try {
                await pool.query(query, values);
                const result = await pool.query('SELECT * FROM categories');
                return {
                    statusCode: 201,
                    message: "Category Added",
                    body: JSON.stringify(result.rows)
                };
            } catch (error) {
                console.error("Error adding category:", error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Internal server error' }),
                };
            }
        } else if (body.path === "/put/categories") {
            const { name, description, image_url, id, location } = body;
            const query = 'UPDATE categories SET name = $1, description = $2, image_url = $3, location = $4 WHERE id = $4 RETURNING *';
            const values = [name, description, image_url, location, id];
        
            try {
                const result = await pool.query(query, values);
                if (result.rows.length > 0) {
                    return {
                        statusCode: 200,
                        body: JSON.stringify(result.rows[0]),
                    };
                } else {
                    return {
                        statusCode: 404,
                        body: JSON.stringify({ error: 'Category not found' }),
                    };
                }
            } catch (error) {
                console.error("Error updating category:", error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Internal server error' }),
                };
            }
        } else if (body.path === "/delete/categories") {
            const { id } = body;
            const query = 'DELETE FROM categories WHERE id = $1 RETURNING *';
            const values = [id];
        
            try {
                const result = await pool.query(query, values);
                if (result.rows.length > 0) {
                    const categories = await pool.query('SELECT * FROM categories')
                    return {
                        statusCode: 200,
                        message: "Category Deleted",
                        body:JSON.stringify(categories.rows)
                    };
                } else {
                    return {
                        statusCode: 404,
                        body: JSON.stringify({ error: 'Category not found' }),
                    };
                }
            } catch (error) {
                console.error("Error deleting category:", error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Internal server error' }),
                };
            }
        } else if (body.path === "/post/items") {
            const { name, image_url, description, category_id, stock, price_details, popular_item, new_arrival, location } = body;
        
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
                return {
                    statusCode: 201,
                    body: JSON.stringify({ message: 'Item added successfully' }),
                };
            } catch (error) {
                await client.query('ROLLBACK');
                console.error('Error adding item:', error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Failed to add item' }),
                };
            } finally {
                client.release();
            }
        } else if (body.path === "/get/items") {
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
        
                return {
                    statusCode: 200,
                    body: JSON.stringify(itemsResult.rows),
                };
            } catch (error) {
                console.error('Error fetching items:', error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Failed to fetch items' }),
                };
            }
        } else if (body.path === "/put/items") {
            const { id } = body;
            const { name, image_url, description, stock, price_details, popular_item, new_arrival, location } = body;
        
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
        
                await client.query(`
                    UPDATE items 
                    SET name = $1, image_url = $2, description = $3, stock = $4, popular_item = $5, new_arrival = $6, location = $7
                    WHERE id = $8
                `, [name, image_url, description, stock, popular_item, new_arrival, location, id]);
        
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
                return {
                    statusCode: 200,
                    body: JSON.stringify({ message: 'Item updated successfully' }),
                };
            } catch (error) {
                await client.query('ROLLBACK');
                console.error('Error updating item:', error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Failed to update item' }),
                };
            } finally {
                client.release();
            }
        } else if (body.path === "/delete/items") {
            const { id } = body;
        
            try {
                await pool.query('BEGIN');
        
                await pool.query(`
                    DELETE FROM items WHERE id = $1
                `, [id]);
        
                await pool.query(`
                    DELETE FROM price_details WHERE item_id = $1
                `, [id]);
        
                await pool.query('COMMIT');
                return {
                    statusCode: 200,
                    body: JSON.stringify({ message: 'Item deleted successfully' }),
                };
            } catch (error) {
                await pool.query('ROLLBACK');
                console.error('Error deleting item:', error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Failed to delete item' }),
                };
            }
        } else if (body.path === "/post/cart") {
            const { user_id, item_id, quantity, amount } = body;
        
            try {
                const query = `
                    INSERT INTO cart (user_id, item_id, quantity, amount)
                    VALUES ($1, $2, $3, $4)
                    RETURNING *
                `;
                const values = [user_id, item_id, quantity, amount];
                const result = await pool.query(query, values);
        
                return {
                    statusCode: 201,
                    body: JSON.stringify(result.rows[0]),
                };
            } catch (error) {
                console.error('Error adding item to cart:', error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Failed to add item to cart' }),
                };
            }
        } else if (body.path === "/get/cart") {
            const { userId } = body;
        
            try {
                const query = `
                    SELECT c.id, c.item_id, i.name, i.image_url, c.quantity, c.amount, i.stock
                    FROM cart c
                    JOIN items i ON c.item_id = i.id
                    WHERE c.user_id = $1
                `;
                const result = await pool.query(query, [userId]);
        
                return {
                    statusCode: 200,
                    body: JSON.stringify(result.rows),
                };
            } catch (error) {
                console.error('Error fetching cart items:', error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Failed to fetch cart items' }),
                };
            }
        } else if (body.path === "/delete/cart") {
            const { id } = body;
        
            try {
                const query = 'DELETE FROM cart WHERE id = $1 RETURNING *';
                const result = await pool.query(query, [id]);
        
                if (result.rows.length > 0) {
                    return {
                        statusCode: 200,
                        body: JSON.stringify({ message: 'Item removed from cart' }),
                    };
                } else {
                    return {
                        statusCode: 404,
                        body: JSON.stringify({ error: 'Cart item not found' }),
                    };
                }
            } catch (error) {
                console.error('Error removing item from cart:', error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Failed to remove item from cart' }),
                };
            }
        } else if (body.path === "/post/orders") {
            const { user_id, address, phone_number, payment_method, items } = body;
        
            if (!user_id || !address || !phone_number || !payment_method || !items) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: 'Missing required fields' }),
                };
            }

            let payment_status;
            
            if (payment_method !== 'cod') {
                const paymentUrl = 'https://api.phonepe.com/apis/hermes/pg/v1/pay'; 
                payment_status = true
            } else {
                payment_status = 'pending'
            }
        
            try {
                await pool.query('BEGIN');
        
                const orderResult = await pool.query(
                    'INSERT INTO orders (user_id, address, phone_number, payment_method, order_status, payment_status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
                    [user_id, address, phone_number, payment_method, "placed", payment_status]
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
        
                return {
                    statusCode: 200,
                    body: JSON.stringify({ message: 'Order placed successfully!' }),
                };
                
            } catch (error) {
                await pool.query('ROLLBACK');
                console.error('Error processing order:', error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Failed to process order' }),
                };
            }
        } else if (body.path === "/get/orders") {        
            try {
                const query = `SELECT * FROM orders`;
                const result = await pool.query(query);
        
                return {
                    statusCode: 200,
                    body: JSON.stringify(result.rows),
                };
            } catch (error) {
                console.error('Error fetching order items:', error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Failed to fetch order items' }),
                };
            }
        } else if (body.path === "/change/order_status") {  
            const { order_id, status, delivery_partner_id, otp } = body;      
            try {
                const query = `UPDATE orders SET order_status = $1 WHERE id = $2`;
                await pool.query(query,[status, order_id]);

                if(delivery_partner_id) {
                    const del_query = `INSERT INTO delivery (order_id, delivery_partner_id, otp) VALUES ($1, $2, $3)`;
                    await pool.query(del_query,[order_id, delivery_partner_id, otp]);
                }

                const selectQuery = `SELECT * FROM orders`;
                const result = await pool.query(selectQuery);
        
                return {
                    statusCode: 200,
                    body: JSON.stringify(result.rows),
                };
            } catch (error) {
                console.error('Error fetching order items:', error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Failed to fetch order items' }),
                };
            }
        } else if (body.path === "/put/cart") {
            const { id } = body;
            const { quantity, amount, user_id } = body;
        
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
                    return {
                        statusCode: 200,
                        body: JSON.stringify(result.rows[0]),
                    };
                } else {
                    return {
                        statusCode: 404,
                        body: JSON.stringify({ error: 'Cart item not found' }),
                    };
                }
            } catch (error) {
                console.error('Error updating cart item:', error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Failed to update cart item' }),
                };
            }
        } else if (body.path === "/get/items/category/categoryId") {
            const { categoryId } = body;
        
            try {
                const itemsResult = await pool.query(`
                    SELECT i.id, i.name, i.image_url, i.description, i.stock, i.popular_item, i.new_arrival,
                           json_agg(json_build_object('quantity', p.quantity, 'amount', p.amount)) AS price_details
                    FROM items i
                    JOIN price_details p ON i.id = p.item_id
                    WHERE i.category_id = $1
                    GROUP BY i.id
                `, [categoryId]);
                
                return {
                    statusCode: 200,
                    body: JSON.stringify(itemsResult.rows),
                };
            } catch (error) {
                console.error('Error fetching items:', error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Failed to fetch items' }),
                };
            }
        } else if (body.path === "/get/purchases") {
            const { userId } = body;
            try {
                const result = await pool.query('SELECT * FROM orders WHERE user_id=' + userId);
                let order_items = result.rows;
        
                order_items = await Promise.all(order_items.map(async (row) => {
                    const itemsResult = await pool.query('SELECT * FROM order_items WHERE order_id=' + row.id);
                    const items = itemsResult.rows;
        
                    const detailedItems = await Promise.all(items.map(async (item) => {
                        const itemDetailsResult = await pool.query('SELECT name, image_url FROM items WHERE id=' + item.item_id);
                        const itemDetails = itemDetailsResult.rows[0];
        
                        return {
                            ...item,
                            item_name: itemDetails.name,
                            image_url: itemDetails.image_url
                        };
                    }));
        
                    const otpResult = await pool.query('SELECT otp FROM delivery WHERE order_id=' + row.id);
                    const otp = otpResult.rows.length > 0 ? otpResult.rows[0].otp : null;
                            return {
                        ...row,
                        order_items: detailedItems,
                        otp 
                    };
                }));
        
                return {
                    statusCode: 200,
                    body: JSON.stringify(order_items),
                };
            } catch (error) {
                console.error("Error fetching purchases and OTP:", error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Internal server error' }),
                };
            }
        } else if(body.path === "/get/delivery_fee") {
            const { city } = body;
            try {
                const result = await pool.query('SELECT * FROM delivery_fee WHERE area_name = $1', [city]);
                return {
                    statusCode: 200,
                    body: JSON.stringify(result.rows[0]),
                };
            } catch (error) {
                console.error("Error fetching delivery_fee:", error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Internal server error' }),
                };
            }
        } else if(body.path === "/add/delivery_fee") {
            const { city, delivery_fee, location } = body;
            try {
                await pool.query('INSERT INTO delivery_fee (area_name, delivery_fee, location) values($1, $2, $3)', [city, delivery_fee, location]);
                const result = await pool.query('SELECT * FROM delivery_fee');
                return {
                    statusCode: 200,
                    body: JSON.stringify(result.rows),
                };
            } catch (error) {
                console.error("Error inserting delivery_fee:", error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Internal server error' }),
                };
            }
        } else if (body.path === "/update/delivery_fee") {
            const { area_name, delivery_fee } = body.areaDetails;
            
            if (!area_name || !delivery_fee) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: 'Area name and delivery fee are required' }),
                };
            }
        
            try {
                const query = 'UPDATE delivery_fee SET area_name = $1, delivery_fee = $2 WHERE area_id = 1';
                await pool.query(query, [area_name.trim(), delivery_fee.trim()]);

                const result = await pool.query('SELECT * FROM delivery_fee');
                
                return {
                    statusCode: 200,
                    message: 'Area details updated',
                    body: result.rows
                };
            } catch (error) {
                console.error("Error updating delivery_fee:", error);
                return {
                    statusCode: 500,
                    error: 'Error updating area details'
                };
            }
        } else if(body.path === "/get/delivery_charges") {
            try {
                const result = await pool.query('SELECT * FROM delivery_fee');
                return {
                    statusCode: 200,
                    body: JSON.stringify(result.rows),
                };
            } catch (error) {
                console.error("Error fetching delivery_fees:", error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Internal server error' }),
                };
            }
        } else if(body.path === "/delete/delivery_charges") {
            const { area_id } = body;
            try {
                await pool.query('DELETE FROM delivery_fee WHERE area_id = $1',[area_id]);
                const result = await pool.query('SELECT * FROM delivery_fee');
                return {
                    statusCode: 200,
                    body: JSON.stringify(result.rows),
                    message: "Area deleted"
                };
            } catch (error) {
                console.error("Error deleting delivery_fees:", error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Internal server error' }),
                };
            }
        } else if(body.path === "/get/wishlist") {
            const { user_id } = body;
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
                WHERE w.user_id = $1  -- Assuming $1 is the user ID placeholder
                GROUP BY i.id, c.name;
                `, [user_id]);

                return {
                    statusCode: 200,
                    body: JSON.stringify(result.rows),
                };
            } catch (error) {
                console.error("Error fetching wishist:", error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Internal server error' }),
                };
            }
        } else if(body.path === "/add/wishlist") {
            const { user_id, item_id } = body;
            try {
                const result = await pool.query('INSERT INTO wishlist (user_id, item_id) VALUES ($1, $2) RETURNING *;', [user_id, item_id]);
                return {
                    statusCode: 200,
                    body: JSON.stringify(result.rows[0]),
                };
            } catch (error) {
                console.error("Error fetching wishist:", error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Internal server error' }),
                };
            }
        } else if(body.path === "/delete/wishlist") {
            const { user_id, item_id } = body;
            try {
                const result = await pool.query('DELETE FROM wishlist WHERE user_id = $1 AND item_id = $2 RETURNING *;', [user_id, item_id]);
                return {
                    statusCode: 200,
                    body: JSON.stringify(result.rows[0]),
                };
            } catch (error) {
                console.error("Error fetching wishist:", error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Internal server error' }),
                };
            }
        } else if(body.path === "/delete/location") {
            const { id } = body;
            try {
                const result = await pool.query('DELETE FROM locations WHERE id = $1 RETURNING *;', [id]);
                return {
                    statusCode: 200,
                    message: "Location Deleted",
                    body: JSON.stringify(result.rows[0]),
                };
            } catch (error) {
                console.error("Error deleting locations:", error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Internal server error' }),
                };
            }
        } else if(body.path === "/add/location") {
            const { name } = body;
            try {
                const result = await pool.query(`
                    INSERT INTO users (name)
                    VALUES ($1)`, [name]);
                return {
                    statusCode: 200,
                    message: "Location Added",
                    body: JSON.stringify(result.rows[0]),
                };
            } catch (error) {
                console.error("Error adding locations:", error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Internal server error' }),
                };
            }
        }  else if(body.path === "/get/location") {
            try {
                const result = await pool.query(`SELECT * FROM locations`);
                return {
                    statusCode: 200,
                    body: JSON.stringify(result.rows),
                };
            } catch (error) {
                console.error("Error adding locations:", error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Internal server error' }),
                };
            }
        }                                                              
        
    } catch (error) {
        console.error('Database query failed', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Database query failed' }),
        };
    } finally {
        // Release the client back to the pool
        if (client) {
            client.release();
        }
    }
};
