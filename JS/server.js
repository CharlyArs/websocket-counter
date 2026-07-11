const express = require('express');
const app = express();
const http = require('http').createServer(app);
// Подключаем Socket.io для работы в реальном времени
const io = require('socket.io')(http);

// Общее число, единое для ВСЕХ пользователей
let globalCount = 100; 

io.on('connection', (socket) => {
    // Как только пользователь зашел, отправляем ему текущее число
    socket.emit('update_count', globalCount);

    // Слушаем, если кто-то нажал кнопку "Убавить"
    socket.on('decrease', () => {
        if (globalCount > 0) {
            globalCount--;
            // Мгновенно рассылаем новое число ВСЕМ подключенным браузерам
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

const PORT = process.env.PORT || 3000;

http.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});