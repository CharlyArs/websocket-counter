const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// === ВОТ ЭТОТ БЛОК МЫ ДОБАВИЛИ ===
// Говорим серверу отдавать index.html при заходе на главную страницу
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});
// ================================

let globalCount = 100; // Стартовое число для всех

io.on('connection', (socket) => {
    // Отправляем текущее число новому пользователю
    socket.emit('update_count', globalCount);

    // Слушаем кнопку "Убавить"
    socket.on('decrease', () => {
        if (globalCount > 0) {
            globalCount--;
            io.emit('update_count', globalCount);
        } else {
            socket.emit('error_msg', 'Ниже нуля не может быть!');
        }
    });

    // Слушаем кнопку "Сброс"
    socket.on('reset', () => {
        globalCount = 100;
        io.emit('update_count', globalCount);
    });
});

// Настройка порта для Render
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
