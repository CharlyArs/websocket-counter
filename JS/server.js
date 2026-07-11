const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Настройка чтения JSON-данных от клиента
app.use(express.json());

// Раздача главной страницы
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Настройка подключения к PostgreSQL (Render сам передаст нужный URL через переменную окружения)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Обязательно для работы с облачным Render Postgres
});

// Автоматическое создание таблиц в базе данных при старте сервера
async function initDB() {
    // Таблица пользователей
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            phone VARCHAR(20) UNIQUE NOT NULL,
            nickname VARCHAR(50) NOT NULL,
            password_hash VARCHAR(255) NOT NULL
        );
    `);
    // Таблица состояния счетчика
    await pool.query(`
        CREATE TABLE IF NOT EXISTS app_state (
            key VARCHAR(50) PRIMARY KEY,
            value INT NOT NULL
        );
    `);
    // Создаем стартовое число счетчика (100), если его еще нет в БД
    await pool.query(`
        INSERT INTO app_state (key, value) VALUES ('counter', 100) ON CONFLICT DO NOTHING;
    `);
    console.log('База данных PostgreSQL успешно инициализирована');
}
initDB().catch(err => console.error('Ошибка инициализации БД:', err));

// --- МЕХАНИЗМ РЕГИСТРАЦИИ ---
app.post('/api/register', async (req, res) => {
    const { phone, nickname, password } = req.body;

    if (!phone || !nickname || !password) {
        return res.status(400).json({ error: 'Заполните все три поля!' });
    }

    try {
        // Проверяем, существует ли уже пользователь с таким телефоном
        const userCheck = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ error: 'Такой пользователь уже существует' });
        }

        // Хешируем (шифруем) пароль
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Сохраняем нового пользователя в БД
        await pool.query(
            'INSERT INTO users (phone, nickname, password_hash) VALUES ($1, $2, $3)',
            [phone, nickname, hashedPassword]
        );

        res.json({ success: true, nickname: nickname });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера при регистрации' });
    }
});

// --- МЕХАНИЗМ АВТОРИЗАЦИИ (ВХОДА) ---
app.post('/api/login', async (req, res) => {
    const { phone, password } = req.body;

    try {
        // Ищем пользователя по телефону
        const userResult = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
        if (userResult.rows.length === 0) {
            return res.status(400).json({ error: 'Неверный номер телефона или пароль' });
        }

        const user = userResult.rows[0];

        // Сравниваем введенный пароль с захешированным паролем из базы
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(400).json({ error: 'Неверный номер телефона или пароль' });
        }

        res.json({ success: true, nickname: user.nickname });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера при входе' });
    }
});

// --- РАБОТА СЧЕТЧИКА В РЕАЛЬНОМ ВРЕМЕНИ (SOCKET.IO) ---
io.on('connection', async (socket) => {
    
    // При подключении вытаскиваем актуальное число счетчика из базы данных
    const stateRes = await pool.query("SELECT value FROM app_state WHERE key = 'counter'");
    socket.emit('update_count', stateRes.rows[0].value);

    // Слушаем клик «Убавить»
    socket.on('decrease', async () => {
        const res = await pool.query("SELECT value FROM app_state WHERE key = 'counter'");
        let count = res.rows[0].value;

        if (count > 0) {
            count--;
            // Сохраняем новое число в БД
            await pool.query("UPDATE app_state SET value = $1 WHERE key = 'counter'", [count]);
            io.emit('update_count', count);
        } else {
            socket.emit('error_msg', 'Ниже нуля не может быть!');
        }
    });

    // Слушаем клик «Сброс»
    socket.on('reset', async () => {
        await pool.query("UPDATE app_state SET value = 100 WHERE key = 'counter'");
        io.emit('update_count', 100);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
