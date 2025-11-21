/**
     * DATABASE KOSAKATA
     */
    const vocabDatabase = [
        { id: 1, korean: "안녕하세요", romaja: "Annyeonghaseyo", id: "Halo", en: "Hello", cn: "你好" },
        { id: 2, korean: "감사합니다", romaja: "Gamsahamnida", id: "Terima Kasih", en: "Thank you", cn: "谢谢" },
        { id: 3, korean: "학교", romaja: "Hakgyo", id: "Sekolah", en: "School", cn: "学校" },
        { id: 4, korean: "물", romaja: "Mul", id: "Air", en: "Water", cn: null },
        { id: 5, korean: "사랑해", romaja: "Saranghae", id: "Aku cinta kamu", en: "I love you", cn: "我爱你" },
        { id: 6, korean: "책", romaja: "Chaek", id: "Buku", en: "Book", cn: "书" },
        { id: 7, korean: "친구", romaja: "Chingu", id: "Teman", en: "Friend", cn: "朋友" },
        { id: 8, korean: "가족", romaja: "Gajok", id: "Keluarga", en: "Family", cn: "家庭" }
    ];

    /**
     * TERJEMAHAN UI (Interface Translations)
     */
    const translations = {
        id: {
            score: "Skor:",
            lblLang: "Bahasa Belajar (Interface Language)",
            menuStartH3: "Mulai Belajar",
            menuStartP: "Tes kosakata (Random)",
            menuHistH3: "Riwayat",
            menuHistP: "Lihat progress belajar",
            shortcutHint: "Shortcut: [1-4] Pilih, [Enter] Jawab/Lanjut, [Esc] Keluar",
            txtAnswer: "Jawab",
            txtNext: "Lanjut",
            txtExit: "Keluar",
            resTitle: "Selesai! 🎉",
            resScoreLbl: "Skor Akhir Kamu:",
            resMaxLbl: "dari Maksimal",
            resReviewLbl: "Review Jawaban:",
            resBackBtn: "Kembali ke Menu",
            histTitle: "Riwayat Belajar",
            histBackBtn: "Kembali",
            histClearBtn: "Hapus Riwayat",
            modalCancel: "Batal",
            qCount: "Soal",
            subLocal: "Bahasa Korea-nya adalah?",
            feedbackCorrect: "Benar!",
            feedbackWrong: "Salah!",
            modalExitTitle: "Keluar Kuis?",
            modalExitMsg: "Progres kuis ini akan hilang jika kamu keluar sekarang.",
            modalClearTitle: "Hapus Riwayat?",
            modalClearMsg: "Semua catatan belajarmu akan dihapus permanen.",
            alertMinVocab: "Butuh minimal 4 kata untuk memulai.",
            histEmpty: "Belum ada riwayat pembelajaran.",
            histCorrect: "Benar",
            histWrong: "Salah"
        },
        en: {
            score: "Score:",
            lblLang: "Learning Language (Interface Language)",
            menuStartH3: "Start Learning",
            menuStartP: "Vocabulary Test (Random)",
            menuHistH3: "History",
            menuHistP: "View learning progress",
            shortcutHint: "Shortcuts: [1-4] Select, [Enter] Answer/Next, [Esc] Exit",
            txtAnswer: "Answer",
            txtNext: "Next",
            txtExit: "Exit",
            resTitle: "Finished! 🎉",
            resScoreLbl: "Your Final Score:",
            resMaxLbl: "out of Max",
            resReviewLbl: "Answer Review:",
            resBackBtn: "Back to Menu",
            histTitle: "Learning History",
            histBackBtn: "Back",
            histClearBtn: "Clear History",
            modalCancel: "Cancel",
            qCount: "Question",
            subLocal: "In Korean is?",
            feedbackCorrect: "Correct!",
            feedbackWrong: "Wrong!",
            modalExitTitle: "Exit Quiz?",
            modalExitMsg: "Quiz progress will be lost if you exit now.",
            modalClearTitle: "Clear History?",
            modalClearMsg: "All learning records will be permanently deleted.",
            alertMinVocab: "Need at least 4 words to start.",
            histEmpty: "No learning history yet.",
            histCorrect: "Correct",
            histWrong: "Wrong"
        },
        cn: {
            score: "得分:",
            lblLang: "学习语言 (界面语言)",
            menuStartH3: "开始学习",
            menuStartP: "词汇测试 (随机)",
            menuHistH3: "历史记录",
            menuHistP: "查看学习进度",
            shortcutHint: "快捷键: [1-4] 选择, [Enter] 回答/下一步, [Esc] 退出",
            txtAnswer: "回答",
            txtNext: "下一步",
            txtExit: "退出",
            resTitle: "完成! 🎉",
            resScoreLbl: "你的最终得分:",
            resMaxLbl: "满分",
            resReviewLbl: "答案回顾:",
            resBackBtn: "返回菜单",
            histTitle: "学习历史",
            histBackBtn: "返回",
            histClearBtn: "清除历史",
            modalCancel: "取消",
            qCount: "问题",
            subLocal: "韩语怎么说？",
            feedbackCorrect: "正确!",
            feedbackWrong: "错误!",
            modalExitTitle: "退出测验?",
            modalExitMsg: "如果现在退出，测验进度将丢失。",
            modalClearTitle: "清除历史?",
            modalClearMsg: "所有的学习记录将被永久删除。",
            alertMinVocab: "最少需要4个单词才能开始。",
            histEmpty: "暂无学习记录。",
            histCorrect: "正确",
            histWrong: "错误"
        }
    };

    // --- STATE VARIABLES ---
    let currentLang = 'en'; // PERBAIKAN: Default EN
    let filteredVocab = [];
    let currentQuestionIndex = 0;
    let score = 0;
    let questionStartTime = 0;
    let timerInterval = null;
    let selectedOptionId = null; 
    let currentCorrectId = null;
    let isQuestionModeKorean = true;
    let sessionLog = [];
    let currentScreen = 'menu';

    // --- DOM ELEMENTS ---
    const elScreens = {
        menu: document.getElementById('screen-menu'),
        quiz: document.getElementById('screen-quiz'),
        result: document.getElementById('screen-result'),
        history: document.getElementById('screen-history')
    };
    const elDisplayScore = document.getElementById('display-score');
    const elLangSelect = document.getElementById('lang-select');
    const elModal = document.getElementById('modal-overlay');

    // --- INITIALIZATION ---
    // Jalankan saat load awal
    updateInterface();

    // --- EVENT LISTENERS ---
    elLangSelect.addEventListener('change', (e) => {
        currentLang = e.target.value;
        updateInterface();
    });

    // Helper untuk update UI Text
    function updateInterface() {
        const t = translations[currentLang];
        
        // Menu
        document.getElementById('lbl-lang').innerText = t.lblLang;
        document.getElementById('menu-start-h3').innerText = t.menuStartH3;
        document.getElementById('menu-start-p').innerText = t.menuStartP;
        document.getElementById('menu-hist-h3').innerText = t.menuHistH3;
        document.getElementById('menu-hist-p').innerText = t.menuHistP;
        document.getElementById('shortcut-hint').innerText = t.shortcutHint;
        
        // Quiz
        document.getElementById('txt-score').innerText = t.score;
        document.getElementById('txt-answer').innerText = t.txtAnswer;
        document.getElementById('txt-next').innerText = t.txtNext;
        document.getElementById('txt-exit').innerText = t.txtExit;

        // Result Screen
        document.getElementById('res-title').innerText = t.resTitle;
        document.getElementById('res-score-lbl').innerText = t.resScoreLbl;
        document.getElementById('res-max-lbl').innerText = t.resMaxLbl;
        document.getElementById('res-review-lbl').innerText = t.resReviewLbl;
        document.getElementById('res-back-btn').innerText = t.resBackBtn;

        // History Screen
        document.getElementById('hist-title').innerText = t.histTitle;
        document.getElementById('hist-back-btn').innerText = t.histBackBtn;
        document.getElementById('hist-clear-btn').innerText = t.histClearBtn;

        // Modal Button
        document.getElementById('modal-cancel-btn').innerText = t.modalCancel;
    }

    // Global Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if (currentScreen !== 'quiz') return;

        // Number Keys 1-4
        if (['1', '2', '3', '4'].includes(e.key)) {
            const index = parseInt(e.key) - 1;
            const buttons = document.querySelectorAll('.option-btn');
            if (buttons[index] && !buttons[index].disabled) {
                buttons[index].click();
            }
        }

        // Enter Key
        if (e.key === 'Enter') {
            const btnSubmit = document.getElementById('btn-submit');
            const btnNext = document.getElementById('btn-next');
            
            if (!btnSubmit.classList.contains('hidden') && !btnSubmit.disabled) {
                btnSubmit.click();
            } else if (!btnNext.classList.contains('hidden')) {
                btnNext.click();
            }
        }

        // Escape Key
        if (e.key === 'Escape') {
            confirmExit();
        }
    });

    // --- NAVIGATION ---
    function showScreen(screenName) {
        Object.values(elScreens).forEach(el => el.classList.remove('active'));
        elScreens[screenName].classList.add('active');
        currentScreen = screenName;
    }

    function returnToMenu() {
        clearInterval(timerInterval);
        showScreen('menu');
    }

    // --- MODAL SYSTEM ---
    function showModal(title, msg, onConfirm) {
        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-msg').innerText = msg;
        const confirmBtn = document.getElementById('modal-confirm-btn');
        
        const newBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
        
        newBtn.innerText = currentLang === 'en' ? 'Yes' : (currentLang === 'cn' ? '是' : 'Ya');

        newBtn.onclick = () => {
            onConfirm();
            closeModal();
        };
        
        elModal.classList.remove('hidden');
    }

    function closeModal() {
        elModal.classList.add('hidden');
    }

    function confirmExit() {
        const t = translations[currentLang];
        showModal(
            t.modalExitTitle, 
            t.modalExitMsg, 
            () => returnToMenu()
        );
    }

    function confirmClearHistory() {
        const t = translations[currentLang];
        showModal(
            t.modalClearTitle,
            t.modalClearMsg,
            () => {
                localStorage.removeItem('koreHanaHistory');
                showHistoryScreen();
            }
        );
    }

    // --- GAME LOGIC ---

    function startQuiz() {
        filteredVocab = vocabDatabase.filter(item => item[currentLang]);
        
        if (filteredVocab.length < 4) {
            alert(translations[currentLang].alertMinVocab);
            return;
        }

        filteredVocab.sort(() => Math.random() - 0.5); 
        currentQuestionIndex = 0;
        score = 0;
        sessionLog = [];
        elDisplayScore.innerText = score;
        
        showScreen('quiz');
        loadQuestion();
    }

    function loadQuestion() {
        selectedOptionId = null;
        document.getElementById('btn-submit').classList.remove('hidden');
        document.getElementById('btn-next').classList.add('hidden');
        document.getElementById('btn-submit').disabled = true; 
        document.getElementById('btn-submit').style.opacity = '0.5';

        // Reset feedback text color
        const ptsDisplay = document.getElementById('current-pts');
        ptsDisplay.className = ''; 
        ptsDisplay.innerText = ''; // Clear text
        
        // Reset timer fill color if needed (here we just restart animation)
        const timerFill = document.getElementById('timer-fill');
        timerFill.style.background = 'var(--accent)';

        const currentItem = filteredVocab[currentQuestionIndex];
        currentCorrectId = currentItem.id;
        
        // Update Counter
        const t = translations[currentLang];
        document.getElementById('q-counter').innerText = `${t.qCount} ${currentQuestionIndex + 1}/${filteredVocab.length}`;

        isQuestionModeKorean = Math.random() > 0.5;

        let questionText, subText;
        if (isQuestionModeKorean) {
            questionText = currentItem.korean;
            subText = `(${currentItem.romaja})`;
        } else {
            questionText = currentItem[currentLang];
            subText = t.subLocal;
        }

        document.getElementById('question-text').innerText = questionText;
        document.getElementById('question-sub').innerText = subText;

        let options = [currentItem];
        let distractors = filteredVocab.filter(item => item.id !== currentItem.id);
        distractors.sort(() => Math.random() - 0.5);
        options.push(...distractors.slice(0, 3));
        options.sort(() => Math.random() - 0.5);

        const optionsContainer = document.getElementById('options-container');
        optionsContainer.innerHTML = '';

        options.forEach((opt, index) => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            
            let btnText = isQuestionModeKorean ? opt[currentLang] : opt.korean;
            
            btn.innerHTML = `<span class="key-hint">${index + 1}</span> ${btnText}`;
            btn.dataset.id = opt.id;
            btn.onclick = () => selectOption(opt.id, btn);
            optionsContainer.appendChild(btn);
        });

        startTimer();
    }

    function selectOption(id, btnElement) {
        document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
        btnElement.classList.add('selected');
        selectedOptionId = id;

        const btnSubmit = document.getElementById('btn-submit');
        btnSubmit.disabled = false;
        btnSubmit.style.opacity = '1';
    }

    function startTimer() {
        questionStartTime = Date.now();
        const timerFill = document.getElementById('timer-fill');
        const currentPtsDisplay = document.getElementById('current-pts');
        currentPtsDisplay.innerText = "+100 pts"; // Reset display
        
        timerFill.style.transition = 'none';
        timerFill.style.width = '100%';
        timerFill.offsetHeight; 
        timerFill.style.transition = 'width 10s linear';
        timerFill.style.width = '0%';

        if (timerInterval) clearInterval(timerInterval);

        timerInterval = setInterval(() => {
            let elapsed = (Date.now() - questionStartTime) / 1000;
            let potentialPoints = calculateScore(elapsed);
            // Hanya update jika belum jawab
            if(!document.getElementById('btn-submit').classList.contains('hidden')) {
                currentPtsDisplay.innerText = `+${potentialPoints} pts`;
            }
        }, 100);
    }

    function calculateScore(secondsElapsed) {
        if (secondsElapsed < 3) return 100;
        if (secondsElapsed >= 10) return 70;
        let decay = (secondsElapsed - 3) * (30 / 7);
        return Math.floor(100 - decay);
    }

    function submitAnswer() {
        if (!selectedOptionId) return;
        
        clearInterval(timerInterval);
        const timerFill = document.getElementById('timer-fill');
        timerFill.style.width = getComputedStyle(timerFill).width; 
        timerFill.style.transition = 'none';

        let elapsed = (Date.now() - questionStartTime) / 1000;
        let pointsEarned = 0;
        const btns = document.querySelectorAll('.option-btn');
        let isCorrect = selectedOptionId === currentCorrectId;
        const t = translations[currentLang];
        const ptsDisplay = document.getElementById('current-pts');

        btns.forEach(btn => {
            btn.disabled = true; 
            const btnId = parseInt(btn.dataset.id);
            
            // Highlight Logic
            if (btnId === currentCorrectId) {
                btn.classList.add('correct');
                btn.classList.remove('selected');
            }
            if (btnId === selectedOptionId && !isCorrect) {
                btn.classList.add('wrong');
                btn.classList.remove('selected');
            }
        });

        if (isCorrect) {
            pointsEarned = calculateScore(elapsed);
            score += pointsEarned;
            ptsDisplay.innerText = `${t.feedbackCorrect} +${pointsEarned}`;
            ptsDisplay.classList.add('feedback-correct'); 
        } else {
            ptsDisplay.innerText = `${t.feedbackWrong} (+0)`;
            ptsDisplay.classList.add('feedback-wrong'); 
        }
        elDisplayScore.innerText = score;

        // Log Logic
        const currentItem = filteredVocab.find(v => v.id === currentCorrectId);
        const selectedItem = filteredVocab.find(v => v.id === selectedOptionId);
        
        const qLog = isQuestionModeKorean ? `${currentItem.korean} (${currentItem.romaja})` : `${currentItem[currentLang]}`;
        const aCorrect = isQuestionModeKorean ? currentItem[currentLang] : currentItem.korean;
        const aUser = selectedItem ? (isQuestionModeKorean ? selectedItem[currentLang] : selectedItem.korean) : "-";

        sessionLog.push({
            question: qLog,
            userAnswer: aUser,
            correctAnswer: aCorrect,
            isCorrect: isCorrect,
            points: pointsEarned
        });

        document.getElementById('btn-submit').classList.add('hidden');
        document.getElementById('btn-next').classList.remove('hidden');
    }

    function nextQuestion() {
        currentQuestionIndex++;
        if (currentQuestionIndex < filteredVocab.length) {
            loadQuestion();
        } else {
            finishQuiz();
        }
    }

    // --- RESULT & HISTORY LOGIC ---

    function finishQuiz() {
        showScreen('result');
        const maxScore = filteredVocab.length * 100;
        document.getElementById('final-score').innerText = score;
        document.getElementById('max-score').innerText = maxScore;
        const t = translations[currentLang];

        const listContainer = document.getElementById('result-list');
        listContainer.innerHTML = '';
        
        sessionLog.forEach((log, index) => {
            const div = document.createElement('div');
            div.className = `review-item ${log.isCorrect ? 'correct' : 'wrong'}`;
            div.innerHTML = `
                <div style="flex: 1;">
                    <small style="color: #636e72;">${t.qCount} ${index + 1}: ${log.question}</small><br>
                    <strong>${log.userAnswer}</strong>
                    ${!log.isCorrect ? `<br><small style="color: var(--success)">: ${log.correctAnswer}</small>` : ''}
                </div>
                <div class="review-score">+${log.points}</div>
            `;
            listContainer.appendChild(div);
        });

        saveToHistory(maxScore);
    }

    function saveToHistory(maxScore) {
        const historyData = {
            id: Date.now(), 
            date: new Date().toISOString(),
            score: score,
            maxScore: maxScore,
            details: sessionLog
        };

        let existingHistory = JSON.parse(localStorage.getItem('koreHanaHistory') || '[]');
        existingHistory.unshift(historyData); 
        localStorage.setItem('koreHanaHistory', JSON.stringify(existingHistory));
    }

    function showHistoryScreen() {
        showScreen('history');
        const container = document.getElementById('history-container');
        const history = JSON.parse(localStorage.getItem('koreHanaHistory') || '[]');
        const t = translations[currentLang];

        container.innerHTML = '';

        if (history.length === 0) {
            container.innerHTML = `<p style="text-align:center; color:#999;">${t.histEmpty}</p>`;
            return;
        }

        history.forEach(item => {
            const dateObj = new Date(item.date);
            const dateStr = dateObj.toLocaleDateString(currentLang === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });
            const timeStr = dateObj.toLocaleTimeString(currentLang === 'id' ? 'id-ID' : 'en-US', { hour: '2-digit', minute: '2-digit' });

            const card = document.createElement('div');
            card.className = 'history-card';
            
            // Generate details HTML
            let detailsHtml = item.details.map((d, idx) => `
                <div class="detail-row">
                    <span class="detail-q">${idx + 1}. ${d.question} <span style="float:right; font-weight:normal; font-size:0.8rem;">${d.isCorrect ? '✅ +'+d.points : '❌ +0'}</span></span>
                    <div class="detail-ans">
                        <span class="ans-user">
                            ${d.isCorrect ? d.userAnswer : `<span class="ans-wrong-label">${d.userAnswer}</span>`}
                        </span>
                        ${!d.isCorrect ? `<span class="ans-correct">(${d.correctAnswer})</span>` : ''}
                    </div>
                </div>
            `).join('');

            card.innerHTML = `
                <div class="history-summary" onclick="toggleHistory(this)">
                    <div>
                        <div style="font-weight:bold; color:var(--text);">${dateStr} <small style="color:#b2bec3; font-weight:normal;">${timeStr}</small></div>
                    </div>
                    <div style="text-align:right;">
                        <span style="font-weight:bold; color:var(--primary); font-size:1.1rem;">${item.score}</span>
                        <span style="font-size:0.8rem; color:#b2bec3;">/ ${item.maxScore}</span>
                    </div>
                </div>
                <div class="history-details">
                    ${detailsHtml}
                </div>
            `;
            container.appendChild(card);
        });
    }

    function toggleHistory(element) {
        const card = element.parentElement;
        card.classList.toggle('expanded');
    }