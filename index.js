import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

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

// Функция патрулирования для одной конкретной камеры
async function runSingleCameraTour(cameraConfig) {
    console.log(`🚀 Запущен поток патрулирования для камеры [${cameraConfig.cameraIp}]`);
    let currentIdx = 0;

    while (true) {
        const preset = cameraConfig.presets[currentIdx];
        const ptzUri = `/cgi-bin/ptz.cgi?action=start&channel=1&code=GotoPreset&arg1=0&arg2=${preset}&arg3=0`;

        try {
            const result = await sendCommand(cameraConfig, ptzUri);
            
            if (result.toLowerCase().includes('ok')) {
                console.log(`[${new Date().toLocaleTimeString()}] [${cameraConfig.cameraIp}] Успех: Переключено на Пресет ${preset}`);
            } else {
                console.log(`[${new Date().toLocaleTimeString()}] [${cameraConfig.cameraIp}] Предупреждение от камеры: ${result.trim()}`);
            }
        } catch (error) {
            console.error(`[${new Date().toLocaleTimeString()}] [${cameraConfig.cameraIp}] Сбой связи (Пресет ${preset}):`, error.message);
        }

        currentIdx = (currentIdx + 1) % cameraConfig.presets.length;
        await new Promise(resolve => setTimeout(resolve, cameraConfig.intervalMs));
    }
}

// Главная функция инициализации мульти-обхода
async function startMultiQuizTour() {
    // Ищем config.json строго в той папке, где лежит запущенный .exe
    const configPath = path.join(process.cwd(), 'config.json');
    
    if (!fs.existsSync(configPath)) {
        console.error(`❌ Ошибка: Не найден файл конфигурации config.json по пути: ${configPath}`);
        return;
    }

    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        
        console.log(`=== Запуск мульти-обхода Dahua для Квиз-Кафе ===`);
        console.log(`Всего камер найдено в конфиге: ${config.cameras.length}\n`);

        config.cameras.forEach(cameraConfig => {
            runSingleCameraTour(cameraConfig);
        });

    } catch (parseError) {
        console.error('❌ Ошибка при чтении или парсинге config.json:', parseError.message);
    }
}

startMultiQuizTour();
