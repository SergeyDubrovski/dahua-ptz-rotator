import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const md5 = (str) => crypto.createHash('md5').update(str).digest('hex');

// Универсальная функция отправки любой команды через нативный Digest Auth
async function sendCommand(config, uriPath) {
    const url = `http://${config.cameraIp}${uriPath}`;

    // 1. Холостой запрос для получения nonce
    const firstResponse = await fetch(url);
    const authHeader = firstResponse.headers.get('www-authenticate');
    if (!authHeader) throw new Error('Камера не вернула заголовок WWW-Authenticate');

    const realm = authHeader.match(/realm="([^"]+)"/)?.[1];
    const nonce = authHeader.match(/nonce="([^"]+)"/)?.[1];
    if (!realm || !nonce) throw new Error('Не удалось распарсить параметры авторизации');

    const nc = '00000001';
    const cnonce = crypto.randomBytes(8).toString('hex');

    // 2. Расчет хэша (строго в нижнем регистре для новых Dahua)
    const HA1 = md5(`${config.username}:${realm}:${config.password}`);
    const HA2 = md5(`GET:${uriPath}`);
    const responseHash = md5(`${HA1}:${nonce}:${nc}:${cnonce}:auth:${HA2}`).toLowerCase();

    const authValue = `Digest username="${config.username}", realm="${realm}", nonce="${nonce}", uri="${uriPath}", qop=auth, nc=${nc}, cnonce="${cnonce}", response="${responseHash}"`;

    // 3. Реальный запрос с авторизацией
    const secondResponse = await fetch(url, { headers: { 'Authorization': authValue } });
    return await secondResponse.text();
}

async function startQuizTour() {
    const configPath = path.join(__dirname, 'config.json');
    if (!fs.existsSync(configPath)) {
        console.error('❌ Ошибка: Не найден config.json');
        return;
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    
    console.log(`=== Запуск автообхода Dahua для Квиз-Кафе ===`);
    console.log(`Камера IP: ${config.cameraIp}`);
    console.log(`Маршрут: ${config.presets.join(' -> ')}`);
    console.log(`Интервал смены залов: ${config.intervalMs / 1000} сек.\n`);

    let currentIdx = 0;

    // Бесконечный цикл патрулирования залов
    while (true) {
        const preset = config.presets[currentIdx];
        // Точечный CGI-путь для вызова пресета на новых Dahua
        const ptzUri = `/cgi-bin/ptz.cgi?action=start&channel=1&code=GotoPreset&arg1=0&arg2=${preset}&arg3=0`;

        try {
            const result = await sendCommand(config, ptzUri);
            
            if (result.toLowerCase().includes('ok')) {
                console.log(`[${new Date().toLocaleTimeString()}] Успех: Переключено на Стол/Зал [Пресет ${preset}]`);
            } else {
                console.log(`[${new Date().toLocaleTimeString()}] Предупреждение от камеры: ${result.trim()}`);
            }
        } catch (error) {
            console.error(`[${new Date().toLocaleTimeString()}] Ошибка сети при переключении на Пресет ${preset}:`, error.message);
        }

        // Считаем индекс следующего пресета
        currentIdx = (currentIdx + 1) % config.presets.length;

        // Спим заданное в конфиге время
        await new Promise(resolve => setTimeout(resolve, config.intervalMs));
    }
}

startQuizTour();
