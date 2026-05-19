require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const { OpenAI } = require('openai');
const express = require('express');
const path = require('path');

// OpenAI API Key Kontrolü
if (!process.env.OPENAI_API_KEY) {
    console.error('\n❌ HATA: "OPENAI_API_KEY" ortam değişkeni bulunamadı!');
    console.error('Lütfen Render/Koyeb panelinden Environment Variables (Ortam Değişkenleri) kısmına "OPENAI_API_KEY" eklediğinizden emin olun.\n');
    process.exit(1);
}

// OpenAI Bağlantısı
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const client = new Client({
    authStrategy: new LocalAuth(),
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    puppeteer: {
        headless: true,
        dumpio: true,
        executablePath: process.platform === 'win32' ? undefined : (process.env.CHROME_PATH || '/usr/bin/chromium'),
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            ...(process.platform !== 'win32' ? [
                '--disable-features=site-per-process',
                '--disable-features=IsolateOrigins'
            ] : [])
        ]
    }
});

client.on('loading_screen', (percent, message) => {
    console.log(`[Yükleniyor] %${percent}: ${message}`);
});

client.on('authenticated', () => {
    console.log('[BAŞARILI] Giriş bilgileri doğrulandı!');
});

client.on('auth_failure', msg => {
    console.error('[HATA] Giriş başarısız oldu!', msg);
});

client.on('disconnected', (reason) => {
    console.log('[BAĞLANTI KOPTI] Bot bağlantısı kesildi. Sebep:', reason);
});

// QR kod oluşturulunca bunu qr.png olarak kaydet
client.on('qr', (qr) => {
    qrcode.toFile('qr.png', qr, {
        color: {
            dark: '#000000',
            light: '#FFFFFF'
        }
    }, function (err) {
        if (err) throw err;
        console.log('\n======================================================');
        console.log('✅ YENİ QR KOD OLUŞTURULDU: "qr.png" DOSYASI GÜNCELLENDİ!');
        console.log('Lütfen proje klasöründeki "qr.png" dosyasını açıp okutun.');
        console.log('======================================================\n');
    });
});

// Başarılı bir şekilde giriş yapıldığında
client.on('ready', () => {
    console.log('\n[BAŞARILI] Bot başarıyla giriş yaptı ve dinlemeye hazır!');
    if (fs.existsSync('qr.png')) {
        fs.unlinkSync('qr.png');
    }
});

const chatHistories = {};
const MAX_HISTORY_LENGTH = 15; // Son 15 mesajı hatırla

// Bir mesaj geldiğinde
client.on('message', async (msg) => {
    // Kendi attığımız mesajlara cevap vermemek için kontrol (Opsiyonel ama iyi bir pratiktir)
    if (msg.fromMe) return;

    console.log(`[YENİ MESAJ] Kimden: ${msg.from} | Mesaj: ${msg.body}`);

    const chatId = msg.from;

    // Eğer bu kişiyle daha önce konuşulmadıysa, yeni bir hafıza oluştur
    if (!chatHistories[chatId]) {
        chatHistories[chatId] = [
            { role: "system", content: "Sen WhatsApp üzerinden kullanıcılara yardımcı olan kibar ve kısa cevaplar veren bir asistansın. Önceki konuşmaları hatırlayarak bağlama uygun cevaplar verirsin." }
        ];
    }

    // Kullanıcının yeni mesajını hafızaya ekle
    chatHistories[chatId].push({ role: "user", content: msg.body });

    // Hafıza sınırını aşarsa, en eski mesajları sil (System mesajını koru)
    if (chatHistories[chatId].length > MAX_HISTORY_LENGTH + 1) {
        // 1. index'ten itibaren sil (0. index system prompt)
        chatHistories[chatId].splice(1, chatHistories[chatId].length - (MAX_HISTORY_LENGTH + 1));
    }

    try {
        console.log(`[OpenAI] İstek gönderiliyor: "${msg.body}"`);
        // OpenAI'ye mesajı gönder ve cevap bekle
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Veya "gpt-3.5-turbo"
            messages: chatHistories[chatId],
            max_tokens: 200,
        });

        const aiResponse = completion.choices[0].message.content;
        console.log(`[OpenAI] Cevap alındı: "${aiResponse}"`);
        
        // Asistanın verdiği cevabı da hafızaya ekle
        chatHistories[chatId].push({ role: "assistant", content: aiResponse });

        // Gelen cevabı WhatsApp'a gönder
        console.log(`[WhatsApp] Cevap gönderiliyor...`);
        await msg.reply(aiResponse);
        console.log(`[WhatsApp] Cevap başarıyla gönderildi!`);

    } catch (error) {
        console.error('OpenAI API Hatası:', error.message);
        try {
            await msg.reply('Üzgünüm, şu anda yanıt oluşturamıyorum. Lütfen daha sonra tekrar deneyin.');
        } catch (replyErr) {
            console.error('WhatsApp Yanıt Gönderme Hatası:', replyErr.message);
        }
    }
});

// Client'ı çalıştır
console.log('Bot başlatılıyor, lütfen bekleyin...');
client.initialize();

// Dummy Express Sunucusu (Bulut platformların uygulamayı açık tutması için ve QR kodu göstermek için)
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    const qrPath = path.join(__dirname, 'qr.png');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    if (fs.existsSync(qrPath)) {
        res.send(`
            <html>
                <head>
                    <title>WhatsApp Bot - QR Kod</title>
                    <meta http-equiv="refresh" content="10">
                    <style>
                        body {
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            justify-content: center;
                            height: 100vh;
                            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                            background-color: #0b141a;
                            color: #e9edef;
                            margin: 0;
                        }
                        .container {
                            background: #111b21;
                            padding: 40px;
                            border-radius: 15px;
                            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                            text-align: center;
                            border: 1px solid #222e35;
                            max-width: 400px;
                        }
                        h2 {
                            color: #00a884;
                            margin-top: 0;
                        }
                        p {
                            color: #8696a0;
                            font-size: 14px;
                            line-height: 1.5;
                        }
                        .qr-box {
                            background: white;
                            padding: 15px;
                            border-radius: 10px;
                            display: inline-block;
                            margin: 20px 0;
                        }
                        img {
                            width: 250px;
                            height: 250px;
                            display: block;
                        }
                        .status {
                            font-size: 12px;
                            color: #667781;
                            margin-top: 10px;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h2>WhatsApp Bot Kurulumu</h2>
                        <p>Telefonunuzdan WhatsApp uygulamasını açıp <b>Bağlı Cihazlar > Cihaz Bağla</b> seçeneğine dokunun ve aşağıdaki QR kodu okutun.</p>
                        <div class="qr-box">
                            <img src="/qr.png?t=${Date.now()}" alt="QR Kod" />
                        </div>
                        <div class="status">Sayfa her 10 saniyede bir otomatik olarak yenilenir.</div>
                    </div>
                </body>
            </html>
        `);
    } else {
        res.send(`
            <html>
                <head>
                    <title>WhatsApp Bot Status</title>
                    <meta http-equiv="refresh" content="5">
                    <style>
                        body {
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            justify-content: center;
                            height: 100vh;
                            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                            background-color: #0b141a;
                            color: #e9edef;
                            margin: 0;
                        }
                        .container {
                            background: #111b21;
                            padding: 40px;
                            border-radius: 15px;
                            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                            text-align: center;
                            border: 1px solid #222e35;
                        }
                        h2 {
                            color: #00a884;
                        }
                        p {
                            color: #8696a0;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h2>WhatsApp Bot Aktif</h2>
                        <p>Bot başarıyla giriş yapmış durumda veya QR kod yükleniyor.</p>
                        <p>Lütfen bekleyin...</p>
                    </div>
                </body>
            </html>
        `);
    }
});

app.get('/qr.png', (req, res) => {
    const qrPath = path.join(__dirname, 'qr.png');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    if (fs.existsSync(qrPath)) {
        res.sendFile(qrPath);
    } else {
        res.status(404).send('QR Kod bulunamadı.');
    }
});

app.listen(PORT, () => {
    console.log(`Web sunucusu ${PORT} portunda başlatıldı. (Keep-alive ve QR görüntüleme için)`);
});
