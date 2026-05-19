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
    puppeteer: {
        headless: true,
        executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
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
        // OpenAI'ye mesajı gönder ve cevap bekle
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Veya "gpt-3.5-turbo"
            messages: chatHistories[chatId],
            max_tokens: 200,
        });

        const aiResponse = completion.choices[0].message.content;
        
        // Asistanın verdiği cevabı da hafızaya ekle
        chatHistories[chatId].push({ role: "assistant", content: aiResponse });

        // Gelen cevabı WhatsApp'a gönder
        await msg.reply(aiResponse);

    } catch (error) {
        console.error('OpenAI API Hatası:', error.message);
        await msg.reply('Üzgünüm, şu anda yanıt oluşturamıyorum. Lütfen daha sonra tekrar deneyin.');
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
    if (fs.existsSync(qrPath)) {
        // QR kod resmini göster
        res.setHeader('Content-Type', 'image/png');
        res.sendFile(qrPath);
    } else {
        res.send('<h1>WhatsApp Bot Çalışıyor!</h1><p>Giriş yapılmış durumda veya henüz QR kod üretilmedi. Bağlantı durumunu kontrol edin.</p>');
    }
});

app.listen(PORT, () => {
    console.log(`Web sunucusu ${PORT} portunda başlatıldı. (Keep-alive ve QR görüntüleme için)`);
});
