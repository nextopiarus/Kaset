// script.js — Kaset AI Chat Widget

document.addEventListener('DOMContentLoaded', function () {

    // ── Smooth scroll ──────────────────────────────────────────────
    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
        anchor.addEventListener('click', function (e) {
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });

    // ── Chat Widget ────────────────────────────────────────────────
    const chatToggle  = document.getElementById('chatToggle');
    const chatBox     = document.getElementById('chatBox');
    const chatClose   = document.getElementById('chatClose');
    const chatInput   = document.getElementById('chatInput');
    const chatSend    = document.getElementById('chatSend');
    const chatMessages= document.getElementById('chatMessages');
    const quickReplies= document.getElementById('quickReplies');

    // ประวัติการสนทนา (สำหรับส่งให้ AI)
    let conversationHistory = [];

    // ── Navigation map: คำสำคัญ → section/action ──────────────────
    const NAV_MAP = [
        { keywords: ['โรคพืช','แมลง','ศัตรูพืช','รา','เพลี้ย','หนอน'],  section: '#knowledge', label: 'คลังโรคพืช' },
        { keywords: ['ดิน','ปุ๋ย','ธาตุอาหาร','ph ดิน','วิเคราะห์ดิน'],  section: '#knowledge', label: 'คลังดิน/ปุ๋ย' },
        { keywords: ['อากาศ','ฤดู','ฝน','แล้ง','ปฏิทิน'],                section: '#knowledge', label: 'คลังสภาพอากาศ' },
        { keywords: ['ปลูก','เพาะ','เกี่ยว','รด','ดูแล','เทคนิค'],       section: '#knowledge', label: 'คลังเทคนิคปลูก' },
        { keywords: ['กฎหมาย','นโยบาย','เงินอุดหนุน','สิทธิ','ชดเชย'],   section: '#knowledge', label: 'คลังกฎหมาย' },
        { keywords: ['line','ไลน์','ผู้เชี่ยวชาญ','คุยกับคน'],            section: '#chatbot',   label: 'Line OA' },
        { keywords: ['หน้าแรก','กลับบ้าน'],                               section: null,         scroll: 'top' },
        { keywords: ['คลังความรู้','ค้นหา','หมวดหมู่'],                    section: '#knowledge', label: 'คลังความรู้' },
    ];

    // ── Toggle open/close ──────────────────────────────────────────
    chatToggle.addEventListener('click', () => {
        const isOpen = chatBox.classList.toggle('open');
        chatToggle.style.transform = isOpen ? 'scale(0.9)' : '';
        // ซ่อน notification dot หลังเปิดครั้งแรก
        chatToggle.style.setProperty('--dot-display', 'none');
        chatToggle.classList.add('seen');
        if (isOpen) chatInput.focus();
    });

    chatClose.addEventListener('click', () => {
        chatBox.classList.remove('open');
        chatToggle.style.transform = '';
    });

    // ── Quick Reply chips ──────────────────────────────────────────
    quickReplies.querySelectorAll('.quick-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const msg = chip.dataset.msg;
            sendMessage(msg);
        });
    });

    // ── Mic / Speech Recognition ───────────────────────────────
    const chatMic = document.getElementById('chatMic');
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = 'th-TH';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        let isListening = false;

        chatMic.addEventListener('click', () => {
            if (isListening) {
                recognition.stop();
            } else {
                recognition.start();
            }
        });

        recognition.addEventListener('start', () => {
            isListening = true;
            chatMic.classList.add('listening');
            chatMic.title = 'กำลังฟัง... กดเพื่อหยุด';
            chatInput.placeholder = '🎙️ กำลังฟัง...';
        });

        recognition.addEventListener('result', (e) => {
            const transcript = e.results[0][0].transcript;
            chatInput.value = transcript;
        });

        recognition.addEventListener('end', () => {
            isListening = false;
            chatMic.classList.remove('listening');
            chatMic.title = 'กดแล้วพูด';
            chatInput.placeholder = 'พิมพ์คำถามของคุณ...';

            // ส่งอัตโนมัติถ้ามีข้อความ
            const text = chatInput.value.trim();
            if (text) { sendMessage(text); chatInput.value = ''; }
        });

        recognition.addEventListener('error', (e) => {
            isListening = false;
            chatMic.classList.remove('listening');
            chatInput.placeholder = 'พิมพ์คำถามของคุณ...';
            if (e.error === 'not-allowed') {
                appendMsg('bot', '⚠️ กรุณาอนุญาตให้ใช้ไมโครโฟนในเบราว์เซอร์ก่อนนะครับ');
            }
        });
    } else {
        // browser ไม่รองรับ — ซ่อนปุ่มไมค์
        chatMic.style.display = 'none';
    }

    // ── Send message ───────────────────────────────────────────────
    chatSend.addEventListener('click', () => {
        const text = chatInput.value.trim();
        if (text) { sendMessage(text); chatInput.value = ''; }
    });

    chatInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            const text = chatInput.value.trim();
            if (text) { sendMessage(text); chatInput.value = ''; }
        }
    });

    // ── Core: send + get AI reply ──────────────────────────────────
    async function sendMessage(text) {
        appendMsg('user', text);
        conversationHistory.push({ role: 'user', content: text });

        // ซ่อน quick replies หลังส่งครั้งแรก
        quickReplies.style.display = 'none';

        // ตรวจสอบว่าควรนำทางผู้ใช้หรือไม่
        const navAction = detectNavigation(text);

        showTyping();

        try {
            const reply = await callAI(text, navAction);
            hideTyping();
            appendMsg('bot', reply);
            conversationHistory.push({ role: 'assistant', content: reply });

            // ถ้ามี navigation action ให้เลื่อนไปหลังแสดง reply
            if (navAction) {
                setTimeout(() => doNavigation(navAction), 800);
            }
        } catch (err) {
            hideTyping();
            appendMsg('bot', 'ขออภัยครับ เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง 🙏');
        }
    }

    // ── ตรวจจับ intent navigation ──────────────────────────────────
    function detectNavigation(text) {
        const lower = text.toLowerCase();
        for (const rule of NAV_MAP) {
            if (rule.keywords.some(kw => lower.includes(kw))) {
                return rule;
            }
        }
        return null;
    }

    function doNavigation(rule) {
        if (rule.scroll === 'top') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (rule.section) {
            const el = document.querySelector(rule.section);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    // ── เรียก Anthropic API ────────────────────────────────────────
    async function callAI(userText, navAction) {
        const systemPrompt = `คุณคือ "เกษตรบอท" ผู้ช่วย AI บนเว็บไซต์ Kaset คลังความรู้เกษตรกรไทย

บทบาทของคุณ:
- ตอบคำถามเรื่องเกษตรกรรม โรคพืช ดิน ปุ๋ย สภาพอากาศ เทคนิคปลูก และกฎหมายเกษตร
- ช่วยนำทางผู้ใช้ไปยังส่วนต่างๆ ของเว็บไซต์
- พูดภาษาไทยที่เข้าใจง่าย เป็นกันเอง และให้กำลังใจเกษตรกร

เว็บไซต์มีส่วน:
- คลังความรู้ (โรคพืช / ดิน-ปุ๋ย / สภาพอากาศ / เทคนิคปลูก / กฎหมาย)
- Line OA สำหรับติดต่อผู้เชี่ยวชาญ

${navAction ? `ผู้ใช้ถามเรื่องที่เกี่ยวข้องกับ "${navAction.label}" — คุณกำลังจะพาเขาไปที่ส่วนนั้นโดยอัตโนมัติ กรุณาแจ้งให้ทราบในคำตอบด้วย` : ''}

ตอบกระชับ ไม่เกิน 3 ประโยค ใช้ emoji ได้พอประมาณ`;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'claude-sonnet-4-6',
                max_tokens: 1000,
                system: systemPrompt,
                messages: conversationHistory
            })
        });

        if (!response.ok) throw new Error('API error');
        const data = await response.json();
        return data.content?.[0]?.text || 'ขออภัยครับ ไม่สามารถตอบได้ในขณะนี้';
    }

    // ── UI helpers ─────────────────────────────────────────────────
    function appendMsg(role, text) {
        const div = document.createElement('div');
        div.className = `chat-msg ${role}`;
        div.textContent = text;
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    let typingEl = null;
    function showTyping() {
        typingEl = document.createElement('div');
        typingEl.className = 'chat-msg bot chat-typing';
        typingEl.innerHTML = '<span></span><span></span><span></span>';
        chatMessages.appendChild(typingEl);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    function hideTyping() {
        if (typingEl) { typingEl.remove(); typingEl = null; }
    }

});
