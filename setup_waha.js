const fs = require('fs');

const API_KEY = '3a625c52f0884b8f8ba9f0a8b2b1f710';
const API_URL = 'http://localhost:3000';

async function setup() {
    console.log("WAHA üzerinde 'default' oturumu başlatılıyor...");
    try {
        const startRes = await fetch(`${API_URL}/api/sessions/start`, {
            method: 'POST',
            headers: {
                'X-Api-Key': API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: 'default' })
        });
        
        console.log("Oturum durumu:", await startRes.text());
        
        console.log("QR kodun hazır olması için 10 saniye bekleniyor...");
        await new Promise(r => setTimeout(r, 10000));
        
        console.log("QR Kod (Ekran Görüntüsü) indiriliyor...");
        const imgRes = await fetch(`${API_URL}/api/screenshot?session=default`, {
            headers: { 'X-Api-Key': API_KEY }
        });
        
        if (imgRes.ok) {
            const buffer = await imgRes.arrayBuffer();
            fs.writeFileSync('qr.png', Buffer.from(buffer));
            console.log("qr.png dosyası başarıyla oluşturuldu!");
        } else {
            console.log("Resim alınamadı. Hata:", await imgRes.text());
        }
    } catch (e) {
        console.error("Hata oluştu:", e);
    }
}

setup();
